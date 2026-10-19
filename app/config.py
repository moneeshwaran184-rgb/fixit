import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
APP_DIR = BASE_DIR / "app"
STATIC_DIR = BASE_DIR / "static"
UPLOAD_DIR = Path("/tmp/fixit-uploads") if os.getenv("VERCEL") else STATIC_DIR / "uploads"
DB_PATH = Path("/tmp/fixit.db") if os.getenv("VERCEL") else BASE_DIR / "fixit.db"

# Ensure upload directory exists
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Image upload config
MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

# AI API Configurations (Optional - with local fallback)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# App Info
APP_TITLE = "FixIt — Campus Maintenance Reporting System"
APP_DESCRIPTION = "Privacy-first, intelligent campus maintenance reporting and issue tracking platform"
APP_VERSION = "1.0.0"
