from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from app.config import (
    APP_TITLE, APP_DESCRIPTION, APP_VERSION,
    STATIC_DIR, UPLOAD_DIR
)
from app.database import init_db
from app.seed_data import seed_demo_data
from app.routers import issues, smart, analytics, auth

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure tables exist and seed demo data
    init_db()
    seed_demo_data()
    yield
    # Shutdown logic if needed

app = FastAPI(
    title=APP_TITLE,
    description=APP_DESCRIPTION,
    version=APP_VERSION,
    lifespan=lifespan
)

# Enable CORS for local testing/development flexibility
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

# Mount Static Files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
def serve_home():
    """Serve the Single-Page Application."""
    return FileResponse(str(STATIC_DIR / "index.html"))

@app.get("/api/health")
def health_check():
    """Health status and metadata."""
    return {
        "status": "healthy",
        "app": APP_TITLE,
        "version": APP_VERSION,
        "database": "SQLite (Connected)",
        "smart_engine": "Active (Zero-Cost Local Heuristics & Pluggable AI)"
    }
