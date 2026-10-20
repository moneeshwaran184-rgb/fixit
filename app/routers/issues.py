import os
import uuid
import shutil
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, Depends, Header

from app.database import get_db, generate_issue_code, dict_from_row
from app.models import IssueCreate, IssueUpdateStatus, IssueUpdatePriority, LinkReportRequest
from app.smart_engine import detect_category, calculate_priority_score, find_potential_duplicates
from app.config import UPLOAD_DIR, MAX_UPLOAD_SIZE, ALLOWED_EXTENSIONS, IS_VERCEL, ensure_upload_dir
from app.supabase_service import (
    is_supabase_active,
    supabase_upload_media,
    supabase_get_reports,
    supabase_get_report_by_id,
    supabase_create_report,
    supabase_update_status,
    supabase_update_priority,
    format_supabase_issue
)

router = APIRouter(prefix="/api/issues", tags=["Issues"])

@router.get("")
def list_issues(
    q: Optional[str] = Query(None, description="Search query across code, description, location, category"),
    status: Optional[str] = Query(None, description="Filter by status: Pending, In Progress, Resolved"),
    priority: Optional[str] = Query(None, description="Filter by priority: Critical, High, Medium, Low"),
    category: Optional[str] = Query(None, description="Filter by category"),
    location: Optional[str] = Query(None, description="Filter by location"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    """
    Search and filter campus complaints.
    Persistent in Supabase in production; falls back to SQLite in local dev.
    """
    if is_supabase_active():
        try:
            return supabase_get_reports(
                q=q,
                status=status,
                priority=priority,
                category=category,
                location=location,
                limit=limit,
                offset=offset
            )
        except Exception as e:
            # If Supabase query fails, continue to SQLite fallback if not on Vercel
            if IS_VERCEL:
                return {"total": 0, "count": 0, "limit": limit, "offset": offset, "issues": []}

    conn = get_db()
    cursor = conn.cursor()

    conditions = []
    params = []

    if q and q.strip():
        search_term = f"%{q.strip()}%"
        conditions.append("""(
            issue_code LIKE ? OR 
            title LIKE ? OR 
            description LIKE ? OR 
            location LIKE ? OR 
            specific_area LIKE ? OR 
            category LIKE ?
        )""")
        params.extend([search_term] * 6)

    if status and status.strip():
        conditions.append("status = ?")
        params.append(status.strip())

    if priority and priority.strip():
        conditions.append("priority = ?")
        params.append(priority.strip())

    if category and category.strip():
        conditions.append("category = ?")
        params.append(category.strip())

    if location and location.strip():
        conditions.append("(location LIKE ? OR specific_area LIKE ?)")
        params.extend([f"%{location.strip()}%", f"%{location.strip()}%"])

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    order_clause = """
    ORDER BY 
        CASE priority 
            WHEN 'Critical' THEN 1 
            WHEN 'High' THEN 2 
            WHEN 'Medium' THEN 3 
            WHEN 'Low' THEN 4 
            ELSE 5 
        END ASC,
        created_at DESC
    """

    query = f"SELECT * FROM issues {where_clause} {order_clause} LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    try:
        cursor.execute(query, params)
        rows = cursor.fetchall()
        issues = [dict_from_row(r) for r in rows]

        count_query = f"SELECT COUNT(*) FROM issues {where_clause}"
        cursor.execute(count_query, params[:-2])
        total_count = cursor.fetchone()[0]
    except Exception:
        total_count = 0
        issues = []
    finally:
        conn.close()

    return {
        "total": total_count,
        "count": len(issues),
        "limit": limit,
        "offset": offset,
        "issues": issues
    }

@router.get("/{issue_id}")
def get_issue_detail(issue_id: str):
    """Retrieve full issue detail including timeline and linked reports."""
    clean_id = issue_id.upper().replace("FIX-", "")
    numeric_id = int(clean_id) if clean_id.isdigit() else None

    if is_supabase_active() and numeric_id is not None:
        try:
            issue = supabase_get_report_by_id(numeric_id)
            if issue:
                return issue
        except Exception:
            pass

    conn = get_db()
    cursor = conn.cursor()

    try:
        if issue_id.isdigit():
            cursor.execute("SELECT * FROM issues WHERE id = ?", (int(issue_id),))
        else:
            cursor.execute("SELECT * FROM issues WHERE issue_code = ?", (issue_id.upper(),))

        row = cursor.fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Issue not found")

        issue = dict_from_row(row)

        cursor.execute(
            "SELECT * FROM issue_timeline WHERE issue_id = ? ORDER BY created_at ASC",
            (issue["id"],)
        )
        timeline_rows = cursor.fetchall()
        issue["timeline"] = [dict_from_row(t) for t in timeline_rows]

        cursor.execute(
            "SELECT * FROM linked_reports WHERE parent_issue_id = ? ORDER BY created_at DESC",
            (issue["id"],)
        )
        linked_rows = cursor.fetchall()
        issue["linked_reports"] = [dict_from_row(l) for l in linked_rows]

        return issue
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=404, detail="Issue not found")
    finally:
        conn.close()

@router.post("", status_code=201)
def create_issue(payload: IssueCreate):
    """
    Create a new campus complaint with smart category and priority analysis.
    Stores persistently in Supabase on production.
    """
    category = payload.category
    if not category or category.strip() == "":
        detected_cat, _, _ = detect_category(payload.description)
        category = detected_cat

    priority_info = calculate_priority_score(
        description=payload.description,
        location=payload.location,
        people_affected=payload.people_affected or 1
    )

    priority = payload.priority
    if not priority or priority.strip() == "":
        priority = priority_info["priority_level"]

    priority_score = priority_info["total_score"]
    priority_rationale = priority_info["rationale"]

    title = payload.title
    if not title or not title.strip():
        first_sentence = payload.description.split(".")[0].strip()
        title = first_sentence[:75] + ("..." if len(first_sentence) > 75 else "")

    if is_supabase_active():
        try:
            return supabase_create_report({
                "description": payload.description,
                "location": payload.location,
                "specific_area": payload.specific_area,
                "category": category,
                "priority": priority,
                "photo_url": payload.photo_url,
                "status": "Submitted",
                "reporter_name": payload.reporter_contact if not payload.is_anonymous else "",
                "reporter_contact": payload.reporter_contact if not payload.is_anonymous else ""
            })
        except Exception as e:
            if IS_VERCEL:
                raise HTTPException(status_code=500, detail=f"Supabase storage error: {str(e)}")

    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    issue_code = generate_issue_code(cursor)

    try:
        with conn:
            cursor.execute("""
                INSERT INTO issues (
                    issue_code, category, title, description, location, specific_area,
                    priority, priority_score, priority_rationale, status, privacy_mode,
                    is_anonymous, reporter_contact, photo_url, people_affected,
                    assigned_to, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                issue_code,
                category,
                title,
                payload.description.strip(),
                payload.location.strip(),
                payload.specific_area.strip() if payload.specific_area else "",
                priority,
                priority_score,
                priority_rationale,
                "Pending",
                payload.privacy_mode or "Private",
                1 if payload.is_anonymous else 0,
                payload.reporter_contact.strip() if payload.reporter_contact else "",
                payload.photo_url or "",
                payload.people_affected or 1,
                f"Campus {category} Maintenance",
                now,
                now
            ))
            new_id = cursor.lastrowid

            privacy_label = "Private Campus Report" if payload.is_anonymous else "Registered Report"
            cursor.execute("""
                INSERT INTO issue_timeline (issue_id, stage, action, notes, actor, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (new_id, "Reported", f"Issue filed via portal ({privacy_label})", "", "Reporter", now))

            analysis_note = f"Auto-classified as {category} · Priority: {priority} (Score: {priority_score}/100)"
            cursor.execute("""
                INSERT INTO issue_timeline (issue_id, stage, action, notes, actor, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (new_id, "Smart Analyzed", analysis_note, priority_rationale, "FixIt Smart Engine", now))

        cursor.execute("SELECT * FROM issues WHERE id = ?", (new_id,))
        created_issue = dict_from_row(cursor.fetchone())
        return created_issue
    finally:
        conn.close()

@router.patch("/{issue_id}/status")
def update_issue_status(issue_id: int, payload: IssueUpdateStatus):
    """
    Update complaint status.
    Enforces valid campus maintenance transitions and updates persistent database.
    """
    if is_supabase_active():
        try:
            return supabase_update_status(
                report_id=issue_id,
                status=payload.status,
                notes=payload.notes or "",
                actor=payload.actor or "Facility Admin"
            )
        except Exception as e:
            if IS_VERCEL:
                raise HTTPException(status_code=500, detail=f"Failed to update status in Supabase: {str(e)}")

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
        current = cursor.fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Issue not found")

        old_status = current["status"]
        new_status = payload.status

        if old_status == new_status:
            return dict_from_row(current)

        valid_transitions = {
            "Pending": ["In Progress", "Resolved"],
            "Submitted": ["In Progress", "Resolved"],
            "In Progress": ["Resolved", "Pending", "Submitted"],
            "Resolved": ["In Progress"]
        }

        if new_status not in valid_transitions.get(old_status, []):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition directly from '{old_status}' to '{new_status}'."
            )

        now = datetime.now(timezone.utc).isoformat()
        resolved_at = now if new_status == "Resolved" else (None if old_status == "Resolved" else current["resolved_at"])

        with conn:
            cursor.execute("""
                UPDATE issues 
                SET status = ?, updated_at = ?, resolved_at = ?
                WHERE id = ?
            """, (new_status, now, resolved_at, issue_id))

            action_text = f"Status updated from '{old_status}' to '{new_status}'"
            cursor.execute("""
                INSERT INTO issue_timeline (issue_id, stage, action, notes, actor, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (issue_id, new_status, action_text, payload.notes or "", payload.actor or "Facility Admin", now))

        cursor.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
        return dict_from_row(cursor.fetchone())
    finally:
        conn.close()

@router.patch("/{issue_id}/priority")
def update_issue_priority(issue_id: int, payload: IssueUpdatePriority):
    """Admin override of priority level."""
    if is_supabase_active():
        try:
            return supabase_update_priority(
                report_id=issue_id,
                priority=payload.priority,
                reason=payload.reason or "Admin reassessment"
            )
        except Exception as e:
            if IS_VERCEL:
                raise HTTPException(status_code=500, detail=f"Failed to update priority in Supabase: {str(e)}")

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
        current = cursor.fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Issue not found")

        old_priority = current["priority"]
        now = datetime.now(timezone.utc).isoformat()

        with conn:
            cursor.execute("""
                UPDATE issues SET priority = ?, updated_at = ? WHERE id = ?
            """, (payload.priority, now, issue_id))

            action_text = f"Priority adjusted: {old_priority} ➔ {payload.priority}"
            cursor.execute("""
                INSERT INTO issue_timeline (issue_id, stage, action, notes, actor, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (issue_id, "Priority Updated", action_text, payload.reason or "Admin reassessment", "Admin", now))

        cursor.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
        return dict_from_row(cursor.fetchone())
    finally:
        conn.close()

@router.post("/{issue_id}/link")
def link_duplicate_report(issue_id: int, payload: LinkReportRequest):
    """Link a newly reported issue to an existing parent issue."""
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
        parent = cursor.fetchone()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent issue not found")

        now = datetime.now(timezone.utc).isoformat()
        new_affected_count = parent["people_affected"] + 1

        with conn:
            cursor.execute("""
                UPDATE issues 
                SET people_affected = ?, updated_at = ?
                WHERE id = ?
            """, (new_affected_count, now, issue_id))

            cursor.execute("""
                INSERT INTO linked_reports (parent_issue_id, reporter_note, created_at)
                VALUES (?, ?, ?)
            """, (issue_id, payload.note or "Additional student confirmed this issue", now))

            cursor.execute("""
                INSERT INTO issue_timeline (issue_id, stage, action, notes, actor, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                issue_id,
                "Report Linked",
                f"Additional report linked. Total affected: {new_affected_count} people",
                payload.note or "",
                "Campus Reporter",
                now
            ))

        cursor.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
        return dict_from_row(cursor.fetchone())
    finally:
        conn.close()

@router.post("/upload")
async def upload_issue_photo(photo: UploadFile = File(...)):
    """
    Upload complaint photo attachment with validation.
    On production / Vercel: stores persistently in Supabase Storage.
    Never writes to local deployed directory or temporary /tmp.
    """
    filename = photo.filename
    if not filename:
        raise HTTPException(status_code=400, detail="Empty filename provided")

    ext = filename.split(".")[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    contents = await photo.read()
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds maximum 5MB limit.")

    # In production on Vercel or when Supabase is active: upload to persistent Supabase Storage
    if IS_VERCEL or is_supabase_active():
        try:
            mime = photo.content_type or f"image/{ext if ext != 'jpg' else 'jpeg'}"
            res = supabase_upload_media(contents=contents, filename=filename, content_type=mime)
            return {
                "url": res["url"],
                "filename": res["filename"],
                "size_bytes": res["size_bytes"]
            }
        except Exception as e:
            if IS_VERCEL:
                raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")

    # Local development fallback: only if upload directory is writable
    if ensure_upload_dir():
        unique_filename = f"issue_{uuid.uuid4().hex[:12]}.{ext}"
        dest_path = UPLOAD_DIR / unique_filename
        try:
            with open(dest_path, "wb") as f:
                f.write(contents)
            return {
                "url": f"/static/uploads/{unique_filename}",
                "filename": unique_filename,
                "size_bytes": len(contents)
            }
        except OSError:
            pass

    # If local filesystem is read-only, upload via Supabase storage
    mime = photo.content_type or f"image/{ext if ext != 'jpg' else 'jpeg'}"
    res = supabase_upload_media(contents=contents, filename=filename, content_type=mime)
    return {
        "url": res["url"],
        "filename": res["filename"],
        "size_bytes": res["size_bytes"]
    }

@router.get("/mine")
def get_my_issues(Authorization: str = Header(None)):
    """
    Return issues reported by the currently authenticated student.
    The client must send a Bearer token from Supabase Auth.
    The token is decoded to obtain the user id (sub claim) and then used
    to query Supabase reports with RLS enforcement.
    If Supabase is not active, an empty list is returned.
    """
    if not Authorization or not Authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = Authorization.split(" ", 1)[1]
    # Decode JWT payload to extract user id (sub). No signature verification needed for lookup.
    import base64, json
    try:
        payload_part = token.split(".")[1]
        padded = payload_part + "=" * (-len(payload_part) % 4)
        decoded_bytes = base64.urlsafe_b64decode(padded)
        payload = json.loads(decoded_bytes)
        user_id = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid JWT token")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")

    if is_supabase_active():
        # Query Supabase reports table filtering by reporter_id using the provided token for RLS.
        url = f"{SUPABASE_URL}/rest/v1/reports?reporter_id=eq.{user_id}&order=created_at.desc"
        headers = _get_headers(auth_token=token)
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                issues = [format_supabase_issue(r) for r in data]
                total = len(issues)
                return {"issues": issues, "total": total, "count": total}
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise HTTPException(status_code=401, detail="Unauthorized access to Supabase")
            raise HTTPException(status_code=500, detail="Failed to fetch reports from Supabase")
        except Exception:
            raise HTTPException(status_code=500, detail="Error retrieving reports")
    # Fallback for local SQLite: no per-user segregation, return empty list.
    return {"issues": [], "total": 0, "count": 0}
