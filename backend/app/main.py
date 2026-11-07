import asyncio
import logging
import mimetypes
import os
import re
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text

from app.api.router import api_router
from app.core.config import settings
from app.services.errors import ConflictError, NotFoundError, PeriodError, ValidationError

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
logger = logging.getLogger("uvicorn.error")


def run_startup_migrations() -> None:
    """Safely verify and run Alembic migrations on startup in development environments.
    In production environments (e.g. Render), migrations are exclusively executed
    by the deployment release/startCommand to prevent concurrent migration execution.
    """
    if not settings.run_startup_migrations or os.environ.get("RUN_STARTUP_MIGRATIONS", "").lower() in ("0", "false", "no"):
        logger.info("Startup migrations skipped (managed by deployment pipeline).")
        return

    from alembic import command
    from alembic.config import Config

    alembic_ini_path = Path(__file__).resolve().parents[1] / "alembic.ini"
    if not alembic_ini_path.exists():
        alembic_ini_path = Path(__file__).resolve().parents[2] / "alembic.ini"

    if alembic_ini_path.exists():
        try:
            cfg = Config(str(alembic_ini_path))
            alembic_folder = alembic_ini_path.parent / "alembic"
            if alembic_folder.exists():
                cfg.set_main_option("script_location", str(alembic_folder.resolve()))
            command.upgrade(cfg, "head")
            logger.info("Database schema verified and upgraded to latest Alembic revision (head).")
        except Exception as exc:
            err_msg = str(exc)
            if "@" in err_msg:
                err_msg = re.sub(r"://[^@]+@", "://****:****@", err_msg)
            logger.error(f"CRITICAL: Alembic startup migration failed: {err_msg}")
            raise RuntimeError(f"Database migration failed on startup: {err_msg}") from None


def seed_default_expense_types() -> None:
    """Ensure standard default expense types exist without overriding existing custom types."""
    from app.db.session import SessionLocal
    from app.models.expense_type import ExpenseType
    from app.services.expense_types import name_key

    default_types = [
        {"name": "Food & Dining", "category": "Food", "icon": "utensils", "color": "#0F766E"},
        {"name": "Groceries", "category": "Food", "icon": "shopping-cart", "color": "#10B981"},
        {"name": "Transportation", "category": "Travel", "icon": "bus", "color": "#4F46E5"},
        {"name": "Fuel", "category": "Travel", "icon": "fuel", "color": "#D97706"},
        {"name": "Utilities", "category": "Utilities", "icon": "zap", "color": "#DC2626"},
        {"name": "Mobile Recharge", "category": "Other", "icon": "smartphone", "color": "#0284C7"},
        {"name": "Shopping", "category": "Shopping", "icon": "shopping-bag", "color": "#EA580C"},
        {"name": "Medical", "category": "Health", "icon": "heart", "color": "#E11D48"},
        {"name": "Entertainment", "category": "Entertainment", "icon": "film", "color": "#7C3AED"},
        {"name": "Rent & Maintenance", "category": "Housing", "icon": "home", "color": "#6366F1"},
        {"name": "Education", "category": "Education", "icon": "book-open", "color": "#2563EB"},
        {"name": "Other", "category": "Other", "icon": "tag", "color": "#64748B"},
    ]

    try:
        with SessionLocal() as db:
            existing_keys = {t.name_key for t in db.query(ExpenseType).all()}
            added = 0
            for item in default_types:
                k = name_key(item["name"])
                if k not in existing_keys:
                    db.add(
                        ExpenseType(
                            name=item["name"],
                            name_key=k,
                            category=item["category"],
                            icon=item["icon"],
                            color=item["color"],
                            is_archived=False,
                        )
                    )
                    existing_keys.add(k)
                    added += 1
            if added > 0:
                db.commit()
                logger.info("Seeded %d standard default expense types.", added)
    except Exception as exc:
        logger.warning("Could not seed default expense types on startup: %s", exc)


async def keep_alive_worker() -> None:
    """Periodic background task that pings the public Render URL to prevent idling.
    Render Free tier spins down web services after 15 minutes of inactivity.
    An outbound HTTP ping across the internet to the public domain resets Render's idle timer.
    """
    # Wait 45 seconds after container startup before first ping so migrations and server binding are fully settled
    await asyncio.sleep(45)

    interval_seconds = max(60, settings.keep_alive_interval_minutes * 60)

    while True:
        try:
            target = (
                os.environ.get("RENDER_EXTERNAL_URL")
                or settings.keep_alive_url
                or "https://moneytrack-backend-g5is.onrender.com"
            )
            if target and target.startswith("http") and "localhost" not in target and "127.0.0.1" not in target:
                ping_url = f"{target.rstrip('/')}/health"
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.get(ping_url)
                    logger.info("Keep-alive self-ping to %s completed with status %d", ping_url, resp.status_code)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning("Keep-alive self-ping encountered an error: %s", exc)

        try:
            await asyncio.sleep(interval_seconds)
        except asyncio.CancelledError:
            break


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_startup_migrations()
    seed_default_expense_types()

    if settings.sql_profiling_enabled:
        from app.core.profiler import attach_profiling_listeners
        from app.db.session import engine

        attach_profiling_listeners(engine, settings.slow_query_threshold_ms)
        logger.info("SQL query profiling activated (threshold: %.1f ms)", settings.slow_query_threshold_ms)

    keep_alive_task = None
    is_test = "pytest" in sys.modules or os.environ.get("PYTEST_CURRENT_TEST")
    if settings.keep_alive_enabled and not is_test:
        target = (
            os.environ.get("RENDER_EXTERNAL_URL")
            or settings.keep_alive_url
            or "https://moneytrack-backend-g5is.onrender.com"
        )
        if target and target.startswith("http") and "localhost" not in target and "127.0.0.1" not in target:
            keep_alive_task = asyncio.create_task(keep_alive_worker())
            logger.info(
                "Keep-alive worker registered for %s (interval: %d min).",
                target,
                settings.keep_alive_interval_minutes,
            )

    yield

    if keep_alive_task and not keep_alive_task.done():
        keep_alive_task.cancel()
        try:
            await keep_alive_task
        except asyncio.CancelledError:
            pass

    try:
        from app.db.session import engine
        engine.dispose()
    except Exception:
        pass


app = FastAPI(
    title="MoneyTrack API",
    version=settings.app_version,
    lifespan=lifespan,
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

if settings.sql_profiling_enabled:
    from app.core.profiler import SQLProfilingMiddleware

    app.add_middleware(
        SQLProfilingMiddleware,
        enabled=True,
        slow_threshold_ms=settings.slow_query_threshold_ms,
    )


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


@app.exception_handler(ValidationError)
async def handle_validation_error(request: Request, exc: ValidationError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": exc.message})


app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/health", include_in_schema=False)
def root_health():
    """Root health endpoint for Render health checks, load balancers, and monitoring."""
    db_status = "connected"
    schema_status = "ready"
    current_rev = None
    try:
        from app.db.session import SessionLocal

        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
            try:
                rev_row = session.execute(text("SELECT version_num FROM alembic_version")).first()
                current_rev = rev_row[0] if rev_row else None
            except Exception:
                current_rev = None
            session.execute(text("SELECT 1 FROM expense_types LIMIT 1"))
    except Exception as exc:
        err_msg = str(exc).lower()
        if "no such table" in err_msg or "does not exist" in err_msg or "undefined_table" in err_msg:
            db_status = "connected"
            schema_status = "degraded"
        else:
            db_status = "unavailable"
            schema_status = "unavailable"

    dialect = settings.database_dialect
    provider = settings.database_provider
    is_ok = db_status == "connected" and schema_status == "ready"
    return {
        "status": "ok" if is_ok else "degraded",
        "application": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "database": db_status,
        "provider": provider,
        "dialect": dialect,
        "schema_status": schema_status,
        "current_revision": current_rev,
    }


@app.get("/health/db", include_in_schema=False)
def root_health_db():
    """Root database status endpoint."""
    from app.api.routes.health import database_health
    from app.db.session import SessionLocal

    with SessionLocal() as session:
        return database_health(db=session)


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
