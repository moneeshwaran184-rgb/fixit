from fastapi import APIRouter
from app.database import get_db, dict_from_row
from app.seed_data import reset_and_reseed
from app.config import IS_VERCEL
from app.supabase_service import is_supabase_active, supabase_get_stats

router = APIRouter(prefix="/api/analytics", tags=["Analytics & Statistics"])

@router.get("/stats")
def get_resolution_statistics():
    """
    Computes live campus issue resolution statistics and breakdowns.
    Powers the executive analytics charts and dashboard counters.
    Uses Supabase in production and falls back to SQLite in local dev.
    """
    if is_supabase_active():
        try:
            return supabase_get_stats()
        except Exception:
            if IS_VERCEL:
                return {
                    "total_issues": 0,
                    "pending_count": 0,
                    "in_progress_count": 0,
                    "resolved_count": 0,
                    "resolution_rate": 0.0,
                    "critical_count": 0,
                    "high_count": 0,
                    "medium_count": 0,
                    "low_count": 0,
                    "total_people_affected": 0,
                    "category_breakdown": [],
                    "priority_breakdown": [],
                    "location_breakdown": []
                }

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT COUNT(*) FROM issues")
        total_issues = cursor.fetchone()[0]

        cursor.execute("SELECT status, COUNT(*) as count FROM issues GROUP BY status")
        status_rows = cursor.fetchall()
        status_map = {row["status"]: row["count"] for row in status_rows}

        pending_count = status_map.get("Pending", 0) + status_map.get("Submitted", 0)
        in_progress_count = status_map.get("In Progress", 0)
        resolved_count = status_map.get("Resolved", 0)

        resolution_rate = round((resolved_count / total_issues * 100), 1) if total_issues > 0 else 0.0

        cursor.execute("SELECT priority, COUNT(*) as count FROM issues GROUP BY priority")
        priority_rows = cursor.fetchall()
        priority_map = {row["priority"]: row["count"] for row in priority_rows}

        critical_count = priority_map.get("Critical", 0)
        high_count = priority_map.get("High", 0)
        medium_count = priority_map.get("Medium", 0)
        low_count = priority_map.get("Low", 0)

        cursor.execute("""
            SELECT 
                category,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status IN ('Pending', 'Submitted') THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress
            FROM issues
            GROUP BY category
            ORDER BY total DESC
        """)
        category_breakdown = [dict_from_row(r) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT location, COUNT(*) as count 
            FROM issues 
            GROUP BY location 
            ORDER BY count DESC 
            LIMIT 6
        """)
        location_breakdown = [dict_from_row(r) for r in cursor.fetchall()]

        cursor.execute("SELECT SUM(people_affected) FROM issues")
        total_people_affected = cursor.fetchone()[0] or 0

        return {
            "total_issues": total_issues,
            "pending_count": pending_count,
            "in_progress_count": in_progress_count,
            "resolved_count": resolved_count,
            "resolution_rate": resolution_rate,
            "critical_count": critical_count,
            "high_count": high_count,
            "medium_count": medium_count,
            "low_count": low_count,
            "total_people_affected": total_people_affected,
            "category_breakdown": category_breakdown,
            "priority_breakdown": [
                {"priority": "Critical", "count": critical_count, "color": "#ef4444"},
                {"priority": "High", "count": high_count, "color": "#f97316"},
                {"priority": "Medium", "count": medium_count, "color": "#f59e0b"},
                {"priority": "Low", "count": low_count, "color": "#10b981"}
            ],
            "location_breakdown": location_breakdown
        }
    except Exception:
        return {
            "total_issues": 0,
            "pending_count": 0,
            "in_progress_count": 0,
            "resolved_count": 0,
            "resolution_rate": 0.0,
            "critical_count": 0,
            "high_count": 0,
            "medium_count": 0,
            "low_count": 0,
            "total_people_affected": 0,
            "category_breakdown": [],
            "priority_breakdown": [],
            "location_breakdown": []
        }
    finally:
        conn.close()

@router.post("/reset-demo")
def reset_demo_database():
    """Reset the database to clean realistic campus demo state."""
    if IS_VERCEL or is_supabase_active():
        return {"message": "Demo reset is disabled in production to safeguard real student complaints and uploaded media."}
    reset_and_reseed()
    return {"message": "Demo data successfully re-seeded to initial state!"}
