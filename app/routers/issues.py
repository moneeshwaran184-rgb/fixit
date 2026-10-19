import os
import uuid
import shutil
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, Depends
from app.database import get_db, generate_issue_code, dict_from_row
from app.models import IssueCreate, IssueUpdateStatus, IssueUpdatePriority, LinkReportRequest
from app.smart_engine import detect_category, calculate_priority_score, find_potential_duplicates
from app.config import UPLOAD_DIR, MAX_UPLOAD_SIZE, ALLOWED_EXTENSIONS

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
    Supports combined multi-attribute filtering as required by the problem statement.
    """
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

    # Sort priority order: Critical first, then High, Medium, Low; then newest first
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

    cursor.execute(query, params)
    rows = cursor.fetchall()
    issues = [dict_from_row(r) for r in rows]

    # Get total count for pagination metadata
    count_query = f"SELECT COUNT(*) FROM issues {where_clause}"
    cursor.execute(count_query, params[:-2])
    total_count = cursor.fetchone()[0]

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
    conn = get_db()
    cursor = conn.cursor()

    if issue_id.isdigit():
        cursor.execute("SELECT * FROM issues WHERE id = ?", (int(issue_id),))
    else:
        cursor.execute("SELECT * FROM issues WHERE issue_code = ?", (issue_id.upper(),))

    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Issue not found")

    issue = dict_from_row(row)

    # Fetch timeline entries
    cursor.execute(
        "SELECT * FROM issue_timeline WHERE issue_id = ? ORDER BY created_at ASC",
        (issue["id"],)
    )
    timeline_rows = cursor.fetchall()
    issue["timeline"] = [dict_from_row(t) for t in timeline_rows]

    # Fetch linked reports
    cursor.execute(
        "SELECT * FROM linked_reports WHERE parent_issue_id = ? ORDER BY created_at DESC",
        (issue["id"],)
    )
    linked_rows = cursor.fetchall()
    issue["linked_reports"] = [dict_from_row(l) for l in linked_rows]

    conn.close()
    return issue

@router.post("", status_code=201)
def create_issue(payload: IssueCreate):
    """
    Create a new campus complaint with smart category and priority analysis.
    Safeguards reporter privacy by default.
    """
    conn = get_db()
    cursor = conn.cursor()

    now = datetime.now(timezone.utc).isoformat()

    # Step 1: Smart Category Determination
    category = payload.category
    auto_cat = False
    if not category or category.strip() == "":
        detected_cat, _, _ = detect_category(payload.description)
        category = detected_cat
        auto_cat = True

    # Step 2: Smart Priority & Risk Score
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

    # Generate title if absent
    title = payload.title
    if not title or not title.strip():
        # Clean brief title from description
        first_sentence = payload.description.split(".")[0].strip()
        title = first_sentence[:75] + ("..." if len(first_sentence) > 75 else "")

    issue_code = generate_issue_code(cursor)

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

        # Timeline Event 1: Reported
        privacy_label = "Private Campus Report" if payload.is_anonymous else "Registered Report"
        cursor.execute("""
            INSERT INTO issue_timeline (issue_id, stage, action, notes, actor, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (new_id, "Reported", f"Issue filed via portal ({privacy_label})", "", "Reporter", now))

        # Timeline Event 2: Smart Analyzed
        analysis_note = f"Auto-classified as {category} · Priority: {priority} (Score: {priority_score}/100)"
        if priority_info["is_safety_hazard"]:
            analysis_note += " ⚠️ Safety hazard flagged!"
        cursor.execute("""
            INSERT INTO issue_timeline (issue_id, stage, action, notes, actor, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (new_id, "Smart Analyzed", analysis_note, priority_rationale, "FixIt Smart Engine", now))

    # Fetch created issue
    cursor.execute("SELECT * FROM issues WHERE id = ?", (new_id,))
    created_issue = dict_from_row(cursor.fetchone())

    conn.close()
    return created_issue

@router.patch("/{issue_id}/status")
def update_issue_status(issue_id: int, payload: IssueUpdateStatus):
    """
    Update complaint status: Pending -> In Progress -> Resolved.
    Enforces valid campus maintenance transitions.
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
    current = cursor.fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Issue not found")

    old_status = current["status"]
    new_status = payload.status

    if old_status == new_status:
        conn.close()
        return dict_from_row(current)

    # Valid transitions:
    # Pending -> In Progress, Resolved
    # In Progress -> Resolved, Pending
    # Resolved -> In Progress (reopen with note)
    valid_transitions = {
        "Pending": ["In Progress", "Resolved"],
        "In Progress": ["Resolved", "Pending"],
        "Resolved": ["In Progress"]
    }

    if new_status not in valid_transitions.get(old_status, []):
        conn.close()
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

        # Add timeline entry
        action_text = f"Status updated from '{old_status}' to '{new_status}'"
        cursor.execute("""
            INSERT INTO issue_timeline (issue_id, stage, action, notes, actor, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (issue_id, new_status, action_text, payload.notes or "", payload.actor or "Facility Admin", now))

    cursor.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
    updated = dict_from_row(cursor.fetchone())
    conn.close()
    return updated

@router.patch("/{issue_id}/priority")
def update_issue_priority(issue_id: int, payload: IssueUpdatePriority):
    """Admin override of priority level."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
    current = cursor.fetchone()
    if not current:
        conn.close()
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
    updated = dict_from_row(cursor.fetchone())
    conn.close()
    return updated

@router.post("/{issue_id}/link")
def link_duplicate_report(issue_id: int, payload: LinkReportRequest):
    """
    Link a newly reported issue to an existing parent issue.
    Increments people_affected without losing information.
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
    parent = cursor.fetchone()
    if not parent:
        conn.close()
        raise HTTPException(status_code=404, detail="Parent issue not found")

    now = datetime.now(timezone.utc).isoformat()
    new_affected_count = parent["people_affected"] + 1

    with conn:
        # Increment people affected
        cursor.execute("""
            UPDATE issues 
            SET people_affected = ?, updated_at = ?
            WHERE id = ?
        """, (new_affected_count, now, issue_id))

        # Record linked report note
        cursor.execute("""
            INSERT INTO linked_reports (parent_issue_id, reporter_note, created_at)
            VALUES (?, ?, ?)
        """, (issue_id, payload.note or "Additional student confirmed this issue", now))

        # Record timeline event
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
    updated = dict_from_row(cursor.fetchone())
    conn.close()
    return updated

@router.post("/upload")
async def upload_issue_photo(photo: UploadFile = File(...)):
    """
    Upload complaint photo attachment with validation.
    Checks file type and maximum size (<= 5MB).
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

    # Read and check size
    contents = await photo.read()
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds maximum 5MB limit.")

    unique_filename = f"issue_{uuid.uuid4().hex[:12]}.{ext}"
    dest_path = UPLOAD_DIR / unique_filename

    with open(dest_path, "wb") as f:
        f.write(contents)

    return {
        "url": f"/static/uploads/{unique_filename}",
        "filename": unique_filename,
        "size_bytes": len(contents)
    }
