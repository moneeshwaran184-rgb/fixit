import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from app.config import (
    APP_TITLE, APP_DESCRIPTION, APP_VERSION,
    STATIC_DIR, IS_VERCEL
)
from app.database import init_db
from app.seed_data import seed_demo_data
from app.routers import issues, smart, analytics, auth
from app.supabase_service import is_supabase_active

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic:
    # On Vercel / serverless production, data persists in Supabase, and the filesystem is read-only.
    # Therefore, skip local SQLite disk initialization on Vercel.
    if not IS_VERCEL and not is_supabase_active():
        try:
            init_db()
            seed_demo_data()
        except Exception as exc:
            logger.warning("Local SQLite init skipped: %s", exc)
    yield
    # Shutdown logic if needed

app = FastAPI(
    title=APP_TITLE,
    description=APP_DESCRIPTION,
    version=APP_VERSION,
    lifespan=lifespan
)

# Enable CORS for frontend and API flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(auth.router)
app.include_router(issues.router)
app.include_router(smart.router)
app.include_router(analytics.router)

# Mount Static Files (safe read-only mount)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
def serve_home():
    """Serve the Single-Page Application."""
    return FileResponse(str(STATIC_DIR / "index.html"))

@app.get("/api/health")
def health_check():
    """Health status and metadata."""
    backend_mode = "Supabase (Persistent Storage & Database)" if is_supabase_active() else "SQLite (Local Dev)"
    return {
        "status": "healthy",
        "app": APP_TITLE,
        "version": APP_VERSION,
        "environment": "Vercel Production" if IS_VERCEL else "Local Development",
        "database": backend_mode,
        "smart_engine": "Active (Zero-Cost Local Heuristics & Pluggable AI)"
    }
