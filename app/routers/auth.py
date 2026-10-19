from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class MemberLoginRequest(BaseModel):
    username_or_email: str
    password: str

class AdminLoginRequest(BaseModel):
    admin_id_or_email: str
    password: str

# Valid demo campus members
VALID_MEMBERS = {
    "student@campus.edu": {
        "name": "Alex Chen",
        "email": "student@campus.edu",
        "role": "Campus Student",
        "id_number": "STU-2024-042",
        "department": "Computer Science & Engineering"
    },
    "faculty@campus.edu": {
        "name": "Dr. Sarah Verma",
        "email": "faculty@campus.edu",
        "role": "Faculty Member",
        "id_number": "FAC-108",
        "department": "Civil & Structural Engineering"
    }
}

# Valid demo facility admins
VALID_ADMINS = {
    "admin@campus.edu": {
        "name": "R. Sharma",
        "email": "admin@campus.edu",
        "role": "Chief Maintenance Officer",
        "department": "Campus Facilities & Infrastructure"
    },
    "facilities.lead@campus.edu": {
        "name": "A. Patel",
        "email": "facilities.lead@campus.edu",
        "role": "Facility Operations Lead",
        "department": "Electrical & Physical Plant"
    }
}

@router.post("/member-login")
def member_login(payload: MemberLoginRequest):
    """Authenticate campus members (students, staff, faculty)."""
    user_key = payload.username_or_email.strip().lower()
    
    # Check credentials
    if user_key in VALID_MEMBERS and payload.password == "fixit123":
        user_info = VALID_MEMBERS[user_key]
        return {
            "success": True,
            "user": user_info,
            "token": f"member_token_{user_key}"
        }
    
    # Allow roll numbers or campus emails with default pass
    if (user_key.endswith("@campus.edu") or user_key.endswith("@college.edu") or len(user_key) >= 3) and payload.password == "fixit123":
        return {
            "success": True,
            "user": {
                "name": payload.username_or_email.split("@")[0].title() or "Campus Member",
                "email": payload.username_or_email,
                "role": "Campus Member",
                "id_number": "MEM-" + str(abs(hash(user_key)) % 9000 + 1000),
                "department": "General Campus"
            },
            "token": f"member_token_{abs(hash(user_key))}"
        }

    raise HTTPException(status_code=401, detail="Invalid campus credentials. (Hint: Use student@campus.edu / fixit123)")

@router.post("/admin-login")
def admin_login(payload: AdminLoginRequest):
    """Authenticate facility administration members with status modification privileges."""
    admin_key = payload.admin_id_or_email.strip().lower()
    
    if admin_key in VALID_ADMINS and payload.password == "admin123":
        admin_info = VALID_ADMINS[admin_key]
        return {
            "success": True,
            "admin": admin_info,
            "token": f"admin_token_{admin_key}"
        }
    
    if (admin_key == "admin" or admin_key == "admin@fixit.edu") and payload.password == "admin123":
        return {
            "success": True,
            "admin": {
                "name": "R. Sharma",
                "email": "admin@campus.edu",
                "role": "Facility Administrator",
                "department": "Campus Maintenance Operations"
            },
            "token": "admin_token_default"
        }

    raise HTTPException(status_code=401, detail="Invalid admin credentials. (Hint: Use admin@campus.edu / admin123)")
