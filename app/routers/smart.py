from fastapi import APIRouter
from app.database import get_db, dict_from_row
from app.models import SmartAnalyzeRequest
from app.ai_service import ai_service

router = APIRouter(prefix="/api/smart", tags=["Smart Analysis"])

@router.post("/analyze")
def analyze_issue(payload: SmartAnalyzeRequest):
    """
    Real-time intelligent analysis for the report form:
    1. Smart category suggestion
    2. Transparent priority calculation & risk assessment
    3. Duplicate / related complaint detection across active issues
    """
    conn = get_db()
    cursor = conn.cursor()

    # Query active/open issues to compare against
    cursor.execute("""
        SELECT id, issue_code, title, description, location, category, priority, status, people_affected, created_at
        FROM issues
        WHERE status != 'Resolved'
        ORDER BY created_at DESC
        LIMIT 100
    """)
    rows = cursor.fetchall()
    existing_issues = [dict_from_row(r) for r in rows]
    conn.close()

    result = ai_service.analyze_complaint(
        description=payload.description,
        location=payload.location or "",
        existing_issues=existing_issues
    )

    return result

@router.get("/status")
def smart_service_status():
    """Return status and configuration of the smart engine and AI layer."""
    return ai_service.get_service_status()
