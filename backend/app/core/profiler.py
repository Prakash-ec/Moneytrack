import contextvars
import logging
import re
import time
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

from fastapi import Request, Response
from sqlalchemy import event
from sqlalchemy.engine import Engine
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger("moneytrack.profiler")


@dataclass
class QueryRecord:
    statement: str
    duration_ms: float
    is_slow: bool = False


@dataclass
class ProfilingContext:
    active: bool = True
    queries: list[QueryRecord] = field(default_factory=list)
    query_patterns: dict[str, int] = field(default_factory=dict)
    transaction_count: int = 0
    total_query_time_ms: float = 0.0

    @property
    def query_count(self) -> int:
        return len(self.queries)

    @property
    def slow_query_count(self) -> int:
        return sum(1 for q in self.queries if q.is_slow)

    @property
    def potential_n_plus_one(self) -> list[tuple[str, int]]:
        """Identifies normalized SQL queries repeated more than 3 times in a single request."""
        return [(stmt, count) for stmt, count in self.query_patterns.items() if count > 3]


_current_context: contextvars.ContextVar[ProfilingContext | None] = contextvars.ContextVar(
    "current_profiling_context", default=None
)


def _normalize_statement(statement: str) -> str:
    """Mask literals, standardize whitespace, and truncate to prevent credential or personal data leakage."""
    cleaned = re.sub(r"\s+", " ", statement).strip()
    # Mask numeric and string literals
    cleaned = re.sub(r"'[^']*'", "'?'", cleaned)
    cleaned = re.sub(r"\b\d+\b", "?", cleaned)
    return cleaned[:300]


def attach_profiling_listeners(engine: Engine, slow_threshold_ms: float = 50.0) -> None:
    """Attaches SQLAlchemy event listeners to monitor query count, duration, and N+1 patterns."""
    if getattr(engine, "_profiler_listeners_attached", False):
        return

    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        conn.info.setdefault("query_start_time", []).append(time.perf_counter())

    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        start_times = conn.info.get("query_start_time")
        if start_times:
            elapsed_sec = time.perf_counter() - start_times.pop()
        else:
            elapsed_sec = 0.0

        duration_ms = round(elapsed_sec * 1000.0, 3)
        is_slow = duration_ms >= slow_threshold_ms

        ctx = _current_context.get()
        if ctx and ctx.active:
            normalized = _normalize_statement(statement)
            ctx.queries.append(QueryRecord(statement=normalized, duration_ms=duration_ms, is_slow=is_slow))
            ctx.total_query_time_ms += duration_ms
            ctx.query_patterns[normalized] = ctx.query_patterns.get(normalized, 0) + 1

        if is_slow:
            # Never log raw parameters to protect sensitive user financial data
            normalized_stmt = _normalize_statement(statement)
            logger.warning(
                "SLOW SQL QUERY [%.2f ms >= %.2f ms threshold]: %s",
                duration_ms,
                slow_threshold_ms,
                normalized_stmt,
            )

    setattr(engine, "_profiler_listeners_attached", True)


@contextmanager
def profile_queries(slow_threshold_ms: float = 50.0) -> Generator[ProfilingContext, None, None]:
    """Context manager for measuring SQL activity in a designated block of code or test."""
    ctx = ProfilingContext(active=True)
    token = _current_context.set(ctx)
    try:
        yield ctx
    finally:
        _current_context.reset(token)


class SQLProfilingMiddleware(BaseHTTPMiddleware):
    """Development-only FastAPI middleware for tracking endpoint query counts, slow queries,

    and response times without altering application or database behavior.
    """

    def __init__(self, app: Any, enabled: bool = False, slow_threshold_ms: float = 50.0) -> None:
        super().__init__(app)
        self.enabled = enabled
        self.slow_threshold_ms = slow_threshold_ms

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not self.enabled:
            return await call_next(request)

        ctx = ProfilingContext(active=True)
        token = _current_context.set(ctx)
        start_wall = time.perf_counter()

        try:
            response = await call_next(request)
        finally:
            elapsed_ms = round((time.perf_counter() - start_wall) * 1000.0, 2)
            _current_context.reset(token)

        # Attach telemetry headers for developer visibility
        response.headers["X-SQL-Query-Count"] = str(ctx.query_count)
        response.headers["X-SQL-Duration-Ms"] = f"{ctx.total_query_time_ms:.2f}"
        response.headers["X-Response-Time-Ms"] = f"{elapsed_ms:.2f}"

        # Detect potential N+1 query patterns
        n_plus_one = ctx.potential_n_plus_one
        if n_plus_one:
            for stmt, count in n_plus_one:
                logger.warning(
                    "POTENTIAL N+1 QUERY DETECTED in %s %s: Query repeated %d times: %s",
                    request.method,
                    request.url.path,
                    count,
                    stmt,
                )

        if ctx.query_count > 15:
            logger.info(
                "HIGH QUERY COUNT: %s %s triggered %d SQL queries in %.2f ms (SQL: %.2f ms)",
                request.method,
                request.url.path,
                ctx.query_count,
                elapsed_ms,
                ctx.total_query_time_ms,
            )

        return response
