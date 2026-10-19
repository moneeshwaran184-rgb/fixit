from datetime import datetime, timezone, timedelta
from app.database import get_db, init_db, generate_issue_code

def seed_demo_data():
    """Populate database with realistic campus maintenance complaints."""
    init_db()
    conn = get_db()
    cursor = conn.cursor()

    # Check if issues already seeded
    cursor.execute("SELECT COUNT(*) FROM issues")
    if cursor.fetchone()[0] > 0:
        conn.close()
        return

    now = datetime.now(timezone.utc)

    demo_issues = [
        {
            "category": "Electrical",
            "title": "Electrical sparks coming from main switchboard",
            "description": "Continuous electrical sparks and burning plastic smell coming from the main power switchboard on the north wall. High fire risk.",
            "location": "Science Block",
            "specific_area": "Computer Lab 3",
            "priority": "Critical",
            "priority_score": 92,
            "priority_rationale": "Immediate safety hazard detected (sparks, burning smell); High-traffic campus facility (Computer Lab); Urgent electrical danger",
            "status": "In Progress",
            "privacy_mode": "Private",
            "is_anonymous": 1,
            "reporter_contact": "",
            "photo_url": "/static/sample_photos/electrical_sparks.svg",
            "people_affected": 24,
            "assigned_to": "Campus Electrical Team (Lead: R. Sharma)",
            "created_hours_ago": 3.5,
            "updated_hours_ago": 1.2,
            "resolved_hours_ago": None,
            "timeline": [
                ("Reported", "Complaint submitted via FixIt mobile portal", "Campus Reporter"),
                ("Smart Analyzed", "Auto-classified: Electrical · Severity: Critical (Score: 92/100). Safety hazard flagged.", "FixIt Smart Engine"),
                ("Reviewed", "Incident acknowledged by Chief Electrical Officer. Main breaker shut down safely.", "Admin / Safety Officer"),
                ("In Progress", "Technician dispatched on-site with replacement 32A MCB and insulated wiring.", "R. Sharma (Maintenance)")
            ],
            "linked_reports": [
                "Noticed sparks while trying to plug in workstation 14.",
                "Smelled burning wire near entrance switchboard during lab session."
            ]
        },
        {
            "category": "Plumbing",
            "title": "Heavy water leakage from ceiling pipe near reading racks",
            "description": "Pipe joint in the false ceiling is leaking heavily. Water is dripping onto student study tables and close to reference book stacks.",
            "location": "Central Library",
            "specific_area": "2nd Floor East Wing",
            "priority": "High",
            "priority_score": 72,
            "priority_rationale": "High operational disruption (heavy water leakage); High-impact campus facility (Library); Multiple users impacted",
            "status": "Pending",
            "privacy_mode": "Private",
            "is_anonymous": 1,
            "reporter_contact": "",
            "photo_url": "/static/sample_photos/water_leak.svg",
            "people_affected": 8,
            "assigned_to": "Campus Plumbing Dept",
            "created_hours_ago": 2.0,
            "updated_hours_ago": 2.0,
            "resolved_hours_ago": None,
            "timeline": [
                ("Reported", "Submitted with photo attachment by library visitor", "Campus Student"),
                ("Smart Analyzed", "Auto-classified: Plumbing · Severity: High (Score: 72/100).", "FixIt Smart Engine")
            ],
            "linked_reports": [
                "Water dripping onto carpet near aisle 7."
            ]
        },
        {
            "category": "Electrical",
            "title": "Ceiling fan making loud noise and stopping in Room 204",
            "description": "The middle ceiling fan in Room 204 makes grinding noises and stops rotating after 5 minutes. Creates disturbance during lectures.",
            "location": "Academic Complex Block A",
            "specific_area": "Room 204",
            "priority": "Medium",
            "priority_score": 45,
            "priority_rationale": "Equipment non-functional (fan not working); Standard classroom space",
            "status": "In Progress",
            "privacy_mode": "Private",
            "is_anonymous": 1,
            "reporter_contact": "",
            "photo_url": "/static/sample_photos/broken_fan.svg",
            "people_affected": 3,
            "assigned_to": "General Maintenance Unit",
            "created_hours_ago": 18.0,
            "updated_hours_ago": 4.5,
            "resolved_hours_ago": None,
            "timeline": [
                ("Reported", "Issue reported by student after morning class", "Student"),
                ("Smart Analyzed", "Auto-classified: Electrical · Priority: Medium (Score: 45/100)", "FixIt Smart Engine"),
                ("In Progress", "Work order #WM-409 generated. Capacitor replacement scheduled.", "Facility Admin")
            ],
            "linked_reports": [
                "Fan stopped spinning during 10 AM physics lecture.",
                "Loud squeaking noise from ceiling fan in 204."
            ]
        },
        {
            "category": "Classroom",
            "title": "Ceiling projector displaying distorted red tint and flickering",
            "description": "HDMI and VGA projection shows heavy red distortion and screen flickers every few seconds. Impossible to conduct slide presentations.",
            "location": "Lecture Hall Complex",
            "specific_area": "Hall LH-2",
            "priority": "High",
            "priority_score": 68,
            "priority_rationale": "Disrupting primary academic facility (Lecture Hall); Equipment malfunctioning",
            "status": "Resolved",
            "privacy_mode": "Private",
            "is_anonymous": 1,
            "reporter_contact": "",
            "photo_url": "/static/sample_photos/projector_fault.svg",
            "people_affected": 65,
            "assigned_to": "Audiovisual & IT Support",
            "created_hours_ago": 26.0,
            "updated_hours_ago": 3.0,
            "resolved_hours_ago": 3.0,
            "timeline": [
                ("Reported", "Submitted by faculty member before lecture", "Faculty Member"),
                ("Smart Analyzed", "Auto-classified: Classroom · Priority: High (Score: 68/100)", "FixIt Smart Engine"),
                ("In Progress", "AV team inspected projector lamp and connection cables", "IT Support"),
                ("Resolved", "Defective HDMI splitter replaced; optical color filter recalibrated. Working normally.", "AV Lead Engineer")
            ],
            "linked_reports": []
        },
        {
            "category": "Furniture",
            "title": "Broken student chair with sharp exposed screw",
            "description": "Third row student desk chair seat is detached on the left side with a sharp screw pointing outward. Risk of tearing clothes or injury.",
            "location": "Humanities Block",
            "specific_area": "Seminar Hall 1, Row 3",
            "priority": "Low",
            "priority_score": 28,
            "priority_rationale": "Minor physical wear; Single furniture item impacted; Handled by carpenter",
            "status": "Pending",
            "privacy_mode": "Private",
            "is_anonymous": 1,
            "reporter_contact": "",
            "photo_url": "/static/sample_photos/broken_chair.svg",
            "people_affected": 1,
            "assigned_to": "Campus Carpentry Unit",
            "created_hours_ago": 5.0,
            "updated_hours_ago": 5.0,
            "resolved_hours_ago": None,
            "timeline": [
                ("Reported", "Reported via QR code complaint link", "Student"),
                ("Smart Analyzed", "Auto-classified: Furniture · Priority: Low (Score: 28/100)", "FixIt Smart Engine")
            ],
            "linked_reports": []
        },
        {
            "category": "Internet/Network",
            "title": "Wi-Fi access point down across 3rd floor corridor",
            "description": "Access point 'CAMPUS-STUDENT-AP-14' shows steady red LED. No Wi-Fi signal in rooms 301 to 312.",
            "location": "Hostel Block B",
            "specific_area": "3rd Floor North Corridor",
            "priority": "Medium",
            "priority_score": 48,
            "priority_rationale": "High student impact in residential zone; Network connectivity loss",
            "status": "In Progress",
            "privacy_mode": "Private",
            "is_anonymous": 1,
            "reporter_contact": "",
            "photo_url": "/static/sample_photos/wifi_router.svg",
            "people_affected": 32,
            "assigned_to": "Campus Network NOC",
            "created_hours_ago": 14.0,
            "updated_hours_ago": 6.0,
            "resolved_hours_ago": None,
            "timeline": [
                ("Reported", "Reported by hostel resident", "Hostel Resident"),
                ("Smart Analyzed", "Auto-classified: Internet/Network · Priority: Medium (Score: 48/100)", "FixIt Smart Engine"),
                ("In Progress", "PoE switch port rebooted; technician sent to replace faulty patch cable.", "Network Engineer")
            ],
            "linked_reports": [
                "No hostel wifi since afternoon in room 305.",
                "Unable to connect to college network for assignment submission."
            ]
        },
        {
            "category": "Cleaning",
            "title": "Spilled chemical cleaning agent in Ground Floor Restroom",
            "description": "Strong pungent chemical odor and slippery liquid on the tile floor near the entrance. Needs immediate mopping and ventilation.",
            "location": "Main Administration Wing",
            "specific_area": "Ground Floor Restroom",
            "priority": "Medium",
            "priority_score": 42,
            "priority_rationale": "Potential slip hazard in shared access restroom",
            "status": "Resolved",
            "privacy_mode": "Private",
            "is_anonymous": 1,
            "reporter_contact": "",
            "photo_url": "/static/sample_photos/cleaning_spill.svg",
            "people_affected": 5,
            "assigned_to": "Housekeeping & Sanitation",
            "created_hours_ago": 48.0,
            "updated_hours_ago": 46.0,
            "resolved_hours_ago": 46.0,
            "timeline": [
                ("Reported", "Noticed by staff member", "Staff"),
                ("Smart Analyzed", "Auto-classified: Cleaning · Priority: Medium", "FixIt Smart Engine"),
                ("In Progress", "Housekeeping supervisor alerted", "Admin"),
                ("Resolved", "Floor neutralised, sanitized, dried, and caution tape removed.", "Sanitation Supervisor")
            ],
            "linked_reports": []
        },
        {
            "category": "Infrastructure",
            "title": "Loose exterior staircase handrail near emergency exit",
            "description": "The metal railing on the 3rd floor emergency stairwell is wobbling and missing two anchor bolts.",
            "location": "Science Block",
            "specific_area": "Staircase B, 3rd Floor",
            "priority": "High",
            "priority_score": 70,
            "priority_rationale": "Physical fall hazard along emergency route; High impact",
            "status": "Resolved",
            "privacy_mode": "Private",
            "is_anonymous": 1,
            "reporter_contact": "",
            "photo_url": "/static/sample_photos/stair_rail.svg",
            "people_affected": 18,
            "assigned_to": "Civil Works & Structural Maintenance",
            "created_hours_ago": 72.0,
            "updated_hours_ago": 24.0,
            "resolved_hours_ago": 24.0,
            "timeline": [
                ("Reported", "Reported by safety patrol", "Campus Security"),
                ("Smart Analyzed", "Auto-classified: Infrastructure · Priority: High (Score: 70/100)", "FixIt Smart Engine"),
                ("In Progress", "Civil engineer re-drilled and anchor-bolted the railing base.", "Civil Team"),
                ("Resolved", "Structural test passed. Handrail firm and secure.", "Safety Inspector")
            ],
            "linked_reports": []
        }
    ]

    with conn:
        for idx, item in enumerate(demo_issues):
            issue_code = f"FIX-{1040 + idx}"
            created_dt = now - timedelta(hours=item["created_hours_ago"])
            updated_dt = now - timedelta(hours=item["updated_hours_ago"])
            resolved_dt = (now - timedelta(hours=item["resolved_hours_ago"])) if item["resolved_hours_ago"] else None

            cursor.execute("""
                INSERT INTO issues (
                    issue_code, category, title, description, location, specific_area,
                    priority, priority_score, priority_rationale, status, privacy_mode,
                    is_anonymous, reporter_contact, photo_url, people_affected,
                    assigned_to, created_at, updated_at, resolved_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                issue_code,
                item["category"],
                item["title"],
                item["description"],
                item["location"],
                item["specific_area"],
                item["priority"],
                item["priority_score"],
                item["priority_rationale"],
                item["status"],
                item["privacy_mode"],
                item["is_anonymous"],
                item["reporter_contact"],
                item["photo_url"],
                item["people_affected"],
                item["assigned_to"],
                created_dt.isoformat(),
                updated_dt.isoformat(),
                resolved_dt.isoformat() if resolved_dt else None
            ))
            issue_id = cursor.lastrowid

            # Add timeline entries
            for stage, action, actor in item["timeline"]:
                t_time = created_dt + timedelta(minutes=15)
                cursor.execute("""
                    INSERT INTO issue_timeline (issue_id, stage, action, notes, actor, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (issue_id, stage, action, "", actor, t_time.isoformat()))

            # Add linked reports if any
            for note in item["linked_reports"]:
                cursor.execute("""
                    INSERT INTO linked_reports (parent_issue_id, reporter_note, created_at)
                    VALUES (?, ?, ?)
                """, (issue_id, note, (created_dt + timedelta(hours=1)).isoformat()))

    conn.close()

def reset_and_reseed():
    """Wipe database and re-seed clean demo state."""
    conn = get_db()
    with conn:
        conn.execute("DELETE FROM linked_reports")
        conn.execute("DELETE FROM issue_timeline")
        conn.execute("DELETE FROM issues")
        try:
            conn.execute("DELETE FROM sqlite_sequence WHERE name IN ('issues', 'issue_timeline', 'linked_reports')")
        except Exception:
            pass
    conn.close()
    seed_demo_data()
