import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
APP_DIR = BASE_DIR / "app"
STATIC_DIR = BASE_DIR / "static"
UPLOAD_DIR = STATIC_DIR / "uploads"
DB_PATH = BASE_DIR / "fixit.db"

# Environment Detection
IS_VERCEL = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))

# Safe upload directory helper (never run directory creation unconditionally at module import)
def ensure_upload_dir() -> bool:
    """Ensure upload directory exists on a writable local filesystem."""
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        return True
    except OSError:
        return False

# Image upload config
MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

# Supabase Configurations
# Server-side operations in production use Supabase Storage and PostgreSQL
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://utxasuzwdmdelknbozkl.supabase.co").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "sb_publishable_DDRf7MD5l8kZimRq44VDAQ_KvJ9XG3k")
# SUPABASE_SERVICE_ROLE_KEY should only be set in server-side Vercel Environment Variables
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
# Backend key priority: service role key if configured, else public/anon key
SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY or os.getenv("SUPABASE_KEY", "") or SUPABASE_ANON_KEY
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "report-photos")

# AI API Configurations (Optional - with local fallback)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# App Info
APP_TITLE = "FixIt — Campus Maintenance Reporting System"
APP_DESCRIPTION = "Privacy-first, intelligent campus maintenance reporting and issue tracking platform"
APP_VERSION = "1.0.0"
