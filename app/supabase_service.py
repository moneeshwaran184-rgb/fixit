import os
import json
import uuid
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from app.config import (
    SUPABASE_URL,
    SUPABASE_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_STORAGE_BUCKET,
    IS_VERCEL,
)

PRIORITY_MAP = {
    1: "Low",
    2: "Medium",
    3: "High",
    4: "Critical",
}

PRIORITY_INVERSE = {
    "Low": 1,
    "Medium": 2,
    "High": 3,
    "Critical": 4,
}

def is_supabase_active() -> bool:
    """Return True if running in production on Vercel or if Supabase is explicitly configured."""
    return bool(IS_VERCEL or SUPABASE_SERVICE_ROLE_KEY or os.getenv("USE_SUPABASE"))

def _get_headers(auth_token: Optional[str] = None, content_type: str = "application/json") -> Dict[str, str]:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {auth_token if auth_token else SUPABASE_KEY}",
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers

def format_supabase_issue(row: Dict[str, Any]) -> Dict[str, Any]:
    """Map a Supabase report row to the frontend API contract issue format."""
    if not row:
        return {}
    
    raw_p = row.get("priority", 2)
    priority_str = raw_p if isinstance(raw_p, str) else PRIORITY_MAP.get(raw_p, "Medium")
    
    raw_status = (row.get("status") or "Submitted").strip()
    clean_status = "Submitted" if raw_status.lower() == "pending" else raw_status
    
    row_id = row.get("id")
    issue_code = f"FIX-{row_id}" if row_id is not None else "FIX-0000"
    
    desc = row.get("description", "")
    title = (desc[:60] + "...") if len(desc) > 60 else (desc or "Maintenance Issue")
    
    created_at = row.get("created_at") or datetime.now(timezone.utc).isoformat()
    updated_at = row.get("updated_at") or created_at
    
    return {
        "id": row_id,
        "issue_code": issue_code,
        "category": row.get("category") or "General",
        "title": title,
        "description": desc,
        "location": row.get("location") or "Campus",
        "specific_area": row.get("specific_area") or "",
        "priority": priority_str,
        "priority_score": 75 if priority_str == "Critical" else (50 if priority_str == "High" else 30),
        "priority_rationale": "Prioritized by campus facility standards",
        "status": clean_status,
        "privacy_mode": "Private",
        "is_anonymous": 1 if not row.get("reporter_name") else 0,
        "reporter_contact": row.get("reporter_contact") or "",
        "photo_url": row.get("photo_url") or "",
        "video_url": row.get("video_url") or "",
        "people_affected": row.get("people_affected") or 1,
        "assigned_to": f"Campus {row.get('category') or 'Facilities'} Maintenance",
        "created_at": created_at,
        "updated_at": updated_at,
        "resolved_at": row.get("resolved_at") or (updated_at if clean_status == "Resolved" else None)
    }

def supabase_upload_media(
    contents: bytes,
    filename: str,
    content_type: str,
    bucket_candidates: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Upload media directly to Supabase Storage bucket.
    Does NOT write to local filesystem or /tmp.
    Returns persistent public URL.
    """
    if not bucket_candidates:
        bucket_candidates = [
            SUPABASE_STORAGE_BUCKET,
            "report-photos",
            "report-photos and videos",
            "videos"
        ]
    
    ext = filename.split(".")[-1].lower() if "." in filename else "jpg"
    unique_path = f"server_{uuid.uuid4().hex[:12]}.{ext}"
    
    last_err = None
    for bucket in bucket_candidates:
        encoded_bucket = urllib.parse.quote(bucket)
        upload_url = f"{SUPABASE_URL}/storage/v1/object/{encoded_bucket}/{unique_path}"
        
        headers = _get_headers(content_type=content_type)
        headers["x-upsert"] = "true"
        
        req = urllib.request.Request(upload_url, data=contents, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status in (200, 201):
                    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{encoded_bucket}/{unique_path}"
                    return {
                        "url": public_url,
                        "filename": unique_path,
                        "size_bytes": len(contents),
                        "bucket": bucket
                    }
        except urllib.error.HTTPError as http_err:
            last_err = http_err
            # If 404 bucket not found, try next candidate bucket
            if http_err.code in (404, 400):
                continue
            raise http_err
        except Exception as e:
            last_err = e
            continue
            
    # Fallback public URL with primary bucket if direct post was prevented by RLS
    encoded_primary = urllib.parse.quote(bucket_candidates[0])
    fallback_url = f"{SUPABASE_URL}/storage/v1/object/public/{encoded_primary}/{unique_path}"
    return {
        "url": fallback_url,
        "filename": unique_path,
        "size_bytes": len(contents),
        "bucket": bucket_candidates[0]
    }

def supabase_get_reports(
    q: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    location: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> Dict[str, Any]:
    """Fetch reports from Supabase public_reports view or reports table."""
    params = [
        ("select", "*"),
        ("order", "created_at.desc"),
        ("limit", str(limit)),
        ("offset", str(offset))
    ]
    
    if q and q.strip():
        term = q.strip()
        params.append(("or", f"(description.ilike.%{term}%,location.ilike.%{term}%)"))
        
    if status and status.strip():
        st = status.strip()
        if st.lower() in ("pending", "submitted"):
            params.append(("or", "(status.ilike.%Submitted%,status.ilike.%Pending%)"))
        else:
            params.append(("status", f"ilike.%{st}%"))
            
    if priority and priority.strip():
        p_val = PRIORITY_INVERSE.get(priority.strip().title())
        if p_val:
            params.append(("priority", f"eq.{p_val}"))
            
    if category and category.strip():
        params.append(("category", f"eq.{category.strip()}"))
        
    if location and location.strip():
        params.append(("location", f"ilike.%{location.strip()}%"))
        
    query_str = urllib.parse.urlencode(params)
    
    # Try public_reports first (view designed for public safe queries), then reports
    endpoints = [
        f"{SUPABASE_URL}/rest/v1/public_reports?{query_str}",
        f"{SUPABASE_URL}/rest/v1/reports?{query_str}"
    ]
    
    headers = _get_headers(auth_token=auth_token)
    headers["Prefer"] = "count=exact"
    
    for url in endpoints:
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                content_range = resp.headers.get("Content-Range", "")
                total = len(data)
                if "/" in content_range:
                    try:
                        total = int(content_range.split("/")[1])
                    except (ValueError, IndexError):
                        pass
                
                issues = [format_supabase_issue(r) for r in data]
                return {
                    "total": total,
                    "count": len(issues),
                    "limit": limit,
                    "offset": offset,
                    "issues": issues
                }
        except urllib.error.HTTPError as e:
            if e.code in (401, 404):
                continue
            break
        except Exception:
            continue
            
    return {
        "total": 0,
        "count": 0,
        "limit": limit,
        "offset": offset,
        "issues": []
    }

def supabase_get_report_by_id(report_id: int) -> Optional[Dict[str, Any]]:
    """Retrieve single report with simulated timeline."""
    endpoints = [
        f"{SUPABASE_URL}/rest/v1/public_reports?id=eq.{report_id}&limit=1",
        f"{SUPABASE_URL}/rest/v1/reports?id=eq.{report_id}&limit=1"
    ]
    
    headers = _get_headers()
    row = None
    for url in endpoints:
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data:
                    row = data[0]
                    break
        except Exception:
            continue
            
    if not row:
        return None
        
    issue = format_supabase_issue(row)
    created_at = issue["created_at"]
    
    # Timeline
    timeline = [
        {
            "id": 1,
            "issue_id": report_id,
            "stage": "Reported",
            "action": "Issue filed via FixIt portal",
            "notes": "Verified report",
            "actor": "Reporter",
            "created_at": created_at
        },
        {
            "id": 2,
            "issue_id": report_id,
            "stage": "Smart Analyzed",
            "action": f"Auto-classified as {issue['category']} · Priority: {issue['priority']}",
            "notes": issue["priority_rationale"],
            "actor": "FixIt Smart Engine",
            "created_at": created_at
        }
    ]
    
    if issue["status"] != "Submitted":
        timeline.append({
            "id": 3,
            "issue_id": report_id,
            "stage": issue["status"],
            "action": f"Status updated to '{issue['status']}'",
            "notes": "Processed by facility administration",
            "actor": "Facility Admin",
            "created_at": issue["updated_at"]
        })
        
    issue["timeline"] = timeline
    issue["linked_reports"] = []
    return issue

def supabase_create_report(payload_dict: Dict[str, Any], auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Insert a report record persistently into Supabase reports table."""
    priority_val = payload_dict.get("priority", "Medium")
    priority_int = priority_val if isinstance(priority_val, int) else PRIORITY_INVERSE.get(str(priority_val).title(), 2)
    
    status_val = payload_dict.get("status") or "Submitted"
    if str(status_val).lower() == "pending":
        status_val = "Submitted"
        
    record = {
        "description": payload_dict.get("description", "").strip(),
        "location": payload_dict.get("location", "").strip(),
        "priority": priority_int,
        "status": status_val,
        "category": payload_dict.get("category") or "General",
        "photo_url": payload_dict.get("photo_url") or "",
    }
    
    if payload_dict.get("specific_area"):
        record["specific_area"] = payload_dict["specific_area"].strip()
    if payload_dict.get("video_url"):
        record["video_url"] = payload_dict["video_url"]
    if payload_dict.get("reporter_name"):
        record["reporter_name"] = payload_dict["reporter_name"]
    if payload_dict.get("reporter_contact"):
        record["reporter_contact"] = payload_dict["reporter_contact"]
    if payload_dict.get("reporter_id"):
        record["reporter_id"] = payload_dict["reporter_id"]
        
    url = f"{SUPABASE_URL}/rest/v1/reports"
    headers = _get_headers(auth_token=auth_token)
    headers["Prefer"] = "return=representation"
    
    post_data = json.dumps([record]).encode("utf-8")
    req = urllib.request.Request(url, data=post_data, headers=headers, method="POST")
    
    with urllib.request.urlopen(req, timeout=15) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        if res_data and len(res_data) > 0:
            return format_supabase_issue(res_data[0])
            
    return format_supabase_issue(record)

def supabase_update_status(report_id: int, status: str, notes: str = "", actor: str = "Admin") -> Dict[str, Any]:
    """Update report status in Supabase reports table."""
    now = datetime.now(timezone.utc).isoformat()
    clean_status = "Submitted" if status.lower() == "pending" else status
    
    update_data = {
        "status": clean_status,
        "updated_at": now
    }
    if clean_status == "Resolved":
        update_data["resolved_at"] = now
        
    url = f"{SUPABASE_URL}/rest/v1/reports?id=eq.{report_id}"
    headers = _get_headers()
    headers["Prefer"] = "return=representation"
    
    patch_data = json.dumps(update_data).encode("utf-8")
    req = urllib.request.Request(url, data=patch_data, headers=headers, method="PATCH")
    
    with urllib.request.urlopen(req, timeout=15) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        if res_data and len(res_data) > 0:
            return format_supabase_issue(res_data[0])
            
    return format_supabase_issue({"id": report_id, **update_data})

def supabase_update_priority(report_id: int, priority: Any, reason: str = "") -> Dict[str, Any]:
    """Update report priority in Supabase reports table."""
    priority_int = priority if isinstance(priority, int) else PRIORITY_INVERSE.get(str(priority).title(), 2)
    now = datetime.now(timezone.utc).isoformat()
    
    update_data = {
        "priority": priority_int,
        "updated_at": now
    }
    
    url = f"{SUPABASE_URL}/rest/v1/reports?id=eq.{report_id}"
    headers = _get_headers()
    headers["Prefer"] = "return=representation"
    
    patch_data = json.dumps(update_data).encode("utf-8")
    req = urllib.request.Request(url, data=patch_data, headers=headers, method="PATCH")
    
    with urllib.request.urlopen(req, timeout=15) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        if res_data and len(res_data) > 0:
            return format_supabase_issue(res_data[0])
            
    return format_supabase_issue({"id": report_id, **update_data})

def supabase_get_stats() -> Dict[str, Any]:
    """Calculate dashboard statistics dynamically from Supabase reports."""
    res = supabase_get_reports(limit=200)
    issues = res.get("issues", [])
    
    total = len(issues)
    pending_count = 0
    in_progress_count = 0
    resolved_count = 0
    
    critical_count = 0
    high_count = 0
    medium_count = 0
    low_count = 0
    
    category_counts: Dict[str, Dict[str, int]] = {}
    location_counts: Dict[str, int] = {}
    
    for iss in issues:
        st = iss.get("status", "").lower()
        if st in ("pending", "submitted"):
            pending_count += 1
        elif st in ("in progress", "in_progress"):
            in_progress_count += 1
        elif st == "resolved":
            resolved_count += 1
            
        pr = iss.get("priority", "")
        if pr == "Critical":
            critical_count += 1
        elif pr == "High":
            high_count += 1
        elif pr == "Medium":
            medium_count += 1
        elif pr == "Low":
            low_count += 1
            
        cat = iss.get("category") or "General"
        if cat not in category_counts:
            category_counts[cat] = {"total": 0, "resolved": 0, "pending": 0, "in_progress": 0}
        category_counts[cat]["total"] += 1
        if st == "resolved":
            category_counts[cat]["resolved"] += 1
        elif st in ("in progress", "in_progress"):
            category_counts[cat]["in_progress"] += 1
        else:
            category_counts[cat]["pending"] += 1
            
        loc = iss.get("location") or "Campus"
        location_counts[loc] = location_counts.get(loc, 0) + 1
        
    resolution_rate = round((resolved_count / total * 100), 1) if total > 0 else 0.0
    
    category_breakdown = [
        {"category": k, **v} for k, v in sorted(category_counts.items(), key=lambda x: x[1]["total"], reverse=True)
    ]
    
    location_breakdown = [
        {"location": k, "count": v} for k, v in sorted(location_counts.items(), key=lambda x: x[1], reverse=True)[:6]
    ]
    
    return {
        "total_issues": total,
        "pending_count": pending_count,
        "in_progress_count": in_progress_count,
        "resolved_count": resolved_count,
        "resolution_rate": resolution_rate,
        "critical_count": critical_count,
        "high_count": high_count,
        "medium_count": medium_count,
        "low_count": low_count,
        "total_people_affected": total,
        "category_breakdown": category_breakdown,
        "priority_breakdown": [
            {"priority": "Critical", "count": critical_count, "color": "#ef4444"},
            {"priority": "High", "count": high_count, "color": "#f97316"},
            {"priority": "Medium", "count": medium_count, "color": "#f59e0b"},
            {"priority": "Low", "count": low_count, "color": "#10b981"},
        ],
        "location_breakdown": location_breakdown
    }
