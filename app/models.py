from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class IssueCreate(BaseModel):
    category: Optional[str] = None
    title: Optional[str] = None
    description: str = Field(..., min_length=5, description="Detailed problem description")
    location: str = Field(..., min_length=2, description="Building, floor, or room")
    specific_area: Optional[str] = Field(default="", description="Precise spot e.g. Room 204")
    priority: Optional[str] = Field(default=None, description="Critical, High, Medium, Low")
    privacy_mode: Optional[str] = "Private"
    is_anonymous: Optional[bool] = True
    reporter_contact: Optional[str] = ""
    photo_url: Optional[str] = ""
    people_affected: Optional[int] = 1

class IssueUpdateStatus(BaseModel):
    status: str = Field(..., pattern="^(Pending|In Progress|Resolved)$")
    notes: Optional[str] = ""
    actor: Optional[str] = "Campus Maintenance Lead"

class IssueUpdatePriority(BaseModel):
    priority: str = Field(..., pattern="^(Critical|High|Medium|Low)$")
    reason: Optional[str] = "Admin adjustment"

class SmartAnalyzeRequest(BaseModel):
    description: str = Field(..., min_length=3)
    location: Optional[str] = ""

class LinkReportRequest(BaseModel):
    parent_issue_id: int
    note: Optional[str] = "Linked by reporter via duplicate detection"

class TimelineEntry(BaseModel):
    id: int
    issue_id: int
    stage: str
    action: str
    notes: Optional[str] = ""
    actor: str
    created_at: str

class IssueResponse(BaseModel):
    id: int
    issue_code: str
    category: str
    title: str
    description: str
    location: str
    specific_area: str
    priority: str
    priority_score: int
    priority_rationale: str
    status: str
    privacy_mode: str
    is_anonymous: bool
    photo_url: str
    people_affected: int
    assigned_to: str
    created_at: str
    updated_at: str
    resolved_at: Optional[str] = None
    timeline: Optional[List[TimelineEntry]] = []
