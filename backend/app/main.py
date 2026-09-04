"""
Energy Intelligence Platform — FastAPI application entry point.

Production mode (SERVE_FRONTEND=true):
  The built React app lives at /app/frontend/dist (copied by Dockerfile).
  FastAPI serves it as static files and catches all non-API routes so the
  React SPA handles client-side routing correctly.

Development mode (default):
  Static file serving is disabled; Vite dev server runs separately on :5173.
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import engine, Base

# Import all models so Base.metadata is fully populated before create_all
import app.models  # noqa: F401

# API routes
from app.api.routes import (
    plants, sheds, sections, machines, meters,
    energy, alerts, metrics, reports,
)
from app.api.websocket import router as ws_router

# Auth/Admin routes
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse
from app.auth.router import router as auth_router
from app.admin.router import router as admin_router

# Background service
from app.services.energy_service import polling_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ── Static frontend path ───────────────────────────────────────────────
# In the Docker image the Dockerfile copies frontend/dist to this location.
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
SERVE_FRONTEND = os.getenv("SERVE_FRONTEND", "false").lower() == "true"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Energy Intelligence Platform...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables verified/created.")

    task = asyncio.create_task(polling_loop())
    logger.info("Simulation polling loop started.")

    yield

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    logger.info("Shutdown complete.")


app = FastAPI(
    title=settings.APP_TITLE,
    version=settings.APP_VERSION,
    description="Energy Intelligence Platform for Cable Manufacturing Plant",
    lifespan=lifespan,
    # Hide docs in production to reduce attack surface (optional)
    docs_url="/docs",
    redoc_url="/redoc",
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "ERROR", "message": str(detail), "details": None},
    )


# CORS — in production the frontend is served from the same origin so this
# only matters for external API consumers and local dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API routes ─────────────────────────────────────────────────────────
prefix = settings.API_PREFIX
app.include_router(plants.router,   prefix=prefix)
app.include_router(sheds.router,    prefix=prefix)
app.include_router(sections.router, prefix=prefix)
app.include_router(machines.router, prefix=prefix)
app.include_router(meters.router,   prefix=prefix)
app.include_router(energy.router,   prefix=prefix)
app.include_router(alerts.router,   prefix=prefix)
app.include_router(metrics.router,  prefix=prefix)
app.include_router(reports.router,  prefix=prefix)
app.include_router(auth_router,     prefix=prefix)
app.include_router(admin_router,    prefix=prefix)

# WebSocket
app.include_router(ws_router)


@app.get("/health", tags=["System"])
def health_check():
    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "simulation_mode": settings.SIMULATION_MODE,
    }


# ── Frontend static serving (production only) ──────────────────────────
if SERVE_FRONTEND and FRONTEND_DIST.exists():
    logger.info(f"Serving frontend from {FRONTEND_DIST}")

    # Serve static assets (JS/CSS/images) from /assets
    app.mount(
        "/assets",
        StaticFiles(directory=str(FRONTEND_DIST / "assets")),
        name="assets",
    )

    # Catch-all: serve index.html for every non-API, non-ws path so that
    # React Router (client-side routing) works on full page refresh.
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(request: Request, full_path: str):
        # Let API and WebSocket paths through (they're already registered above)
        if full_path.startswith("api/") or full_path.startswith("ws/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(str(index))
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Frontend not built")

else:
    @app.get("/", tags=["System"])
    def root():
        return {
            "message": "Energy Intelligence Platform API",
            "docs": "/docs",
            "health": "/health",
            "frontend": "Run 'npm run dev' in /frontend for the UI",
        }
