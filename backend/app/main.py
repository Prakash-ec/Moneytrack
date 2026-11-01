import mimetypes
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse

from sqlalchemy import text
from app.api.router import api_router
from app.core.config import settings
from app.services.errors import ConflictError, NotFoundError, PeriodError

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

app = FastAPI(
    title="MoneyTrack API",
    version=settings.app_version,
    description=(
        "Local-first expenditure tracking API. All financial aggregates are calculated "
        "from persisted transactions. Amounts are stored as integer paise.\n\n"
        "This prototype is intended for private local use and does not include "
        "authentication. Do not expose it to the public internet without adding auth."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Length",
        "Content-Range",
        "Content-Disposition",
        "X-Idempotent-Replay",
    ],
    max_age=600,
)
app.add_middleware(GZipMiddleware, minimum_size=800)


@app.middleware("http")
async def security_headers(request: Request, call_next):  # noqa: ANN001
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

    path = request.url.path
    if path.startswith("/assets/"):
        response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
    elif path == "/sw.js":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Service-Worker-Allowed"] = "/"
    elif (
        path in {"/", "/index.html", "/manifest.webmanifest"}
        or (
            not path.startswith("/assets/")
            and response.headers.get("content-type", "").startswith("text/html")
        )
    ):
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


@app.exception_handler(NotFoundError)
async def handle_not_found(request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": exc.message})


@app.exception_handler(ConflictError)
async def handle_conflict(request: Request, exc: ConflictError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": exc.message})


@app.exception_handler(PeriodError)
async def handle_period_error(request: Request, exc: PeriodError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": exc.message})


app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/health", include_in_schema=False)
def root_health():
    """Root health endpoint for Render health checks, load balancers, and monitoring."""
    db_status = "connected"
    try:
        from app.db.session import SessionLocal

        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
    except Exception:
        db_status = "unavailable"

    dialect = "sqlite" if settings.is_sqlite else "postgresql"
    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "application": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "database": db_status,
        "dialect": dialect,
    }


if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        from fastapi.staticfiles import StaticFiles

        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(request: Request, full_path: str):
    """Serve the built SPA when available; otherwise show a helpful API root."""
    if full_path.startswith("api/") or full_path == "api":
        raise HTTPException(status_code=404, detail="API route not found.")

    accept = request.headers.get("accept", "")
    # If client is strictly requesting JSON (e.g. API client), do not serve index.html
    if "application/json" in accept and "text/html" not in accept:
        raise HTTPException(status_code=404, detail=f"Endpoint '/{full_path}' not found.")

    if settings.serve_frontend and FRONTEND_DIST.exists():
        dist_root = FRONTEND_DIST.resolve()
        if full_path:
            candidate = (FRONTEND_DIST / full_path).resolve()
            try:
                candidate.relative_to(dist_root)
            except ValueError as exc:
                raise HTTPException(status_code=404, detail="Not found.") from exc
            if candidate.is_file():
                return FileResponse(candidate)
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(index)

    if full_path == "":
        return {
            "application": settings.app_name,
            "version": settings.app_version,
            "message": "MoneyTrack API is running. The frontend build was not found.",
            "docs": "/docs",
            "health": "/api/health",
        }
    raise HTTPException(status_code=404, detail="Not found.")
