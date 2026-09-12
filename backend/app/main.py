"""Main FastAPI Application Entrypoint for MaxAudioEditor."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.app.config import settings
from backend.app.logging_config import logger
from backend.app.api import system, projects, media, jobs, analysis, websocket, stems, time_pitch, export, spectrogram, pitch


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifespan handler."""
    logger.info("==================================================")
    logger.info(f"Starting {settings.APP_NAME} v{settings.VERSION}")
    logger.info(f"Host: http://{settings.HOST}:{settings.PORT}")
    logger.info(f"Base Directory: {settings.BASE_DIR}")
    logger.info(f"Data Directory: {settings.DATA_DIR}")
    logger.info("==================================================")
    yield
    logger.info(f"Shutting down {settings.APP_NAME}")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Fully Local, GPU-Accelerated, AI-Native Browser-Based Audio Editor & DAW",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Prevent browser caching of frontend static assets in local DAW
@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if not request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)},
    )


# Include API Routers
app.include_router(system.router)
app.include_router(projects.router)
app.include_router(media.router)
app.include_router(jobs.router)
app.include_router(analysis.router)
app.include_router(stems.router)
app.include_router(time_pitch.router)
app.include_router(export.router)
app.include_router(spectrogram.router)
app.include_router(pitch.router)
app.include_router(websocket.router)

# Mount Frontend static files
if settings.FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(settings.FRONTEND_DIR), html=True), name="frontend")
