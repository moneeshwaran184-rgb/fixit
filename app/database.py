import sqlite3
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from app.config import DB_PATH

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    """Initialize database tables and indexes."""
    conn = get_db()
    with conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS issues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_code TEXT UNIQUE NOT NULL,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            location TEXT NOT NULL,
            specific_area TEXT DEFAULT '',
            priority TEXT NOT NULL CHECK(priority IN ('Critical', 'High', 'Medium', 'Low')),
            priority_score INTEGER DEFAULT 50,
            priority_rationale TEXT DEFAULT '',
            status TEXT NOT NULL CHECK(status IN ('Pending', 'In Progress', 'Resolved')) DEFAULT 'Pending',
            privacy_mode TEXT DEFAULT 'Private',
            is_anonymous INTEGER DEFAULT 1,
            reporter_contact TEXT DEFAULT '',
            photo_url TEXT DEFAULT '',
            people_affected INTEGER DEFAULT 1,
            assigned_to TEXT DEFAULT 'Campus Maintenance Dept',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            resolved_at TEXT DEFAULT NULL
        );

        CREATE TABLE IF NOT EXISTS issue_timeline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_id INTEGER NOT NULL,
            stage TEXT NOT NULL,
            action TEXT NOT NULL,
            notes TEXT DEFAULT '',
            actor TEXT DEFAULT 'System',
            created_at TEXT NOT NULL,
            FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS linked_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_issue_id INTEGER NOT NULL,
            reporter_note TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (parent_issue_id) REFERENCES issues(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
        CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority);
        CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category);
        CREATE INDEX IF NOT EXISTS idx_issues_created ON issues(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_timeline_issue ON issue_timeline(issue_id);
        """)
    conn.close()

def generate_issue_code(cursor) -> str:
    """Generate human-readable ID like FIX-1042."""
    cursor.execute("SELECT MAX(id) FROM issues")
    row = cursor.fetchone()
    next_id = (row[0] or 0) + 1
    return f"FIX-{1000 + next_id}"

def dict_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    return dict(row)
