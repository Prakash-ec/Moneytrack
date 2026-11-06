import pytest
from sqlalchemy import Column, Integer, String, create_engine, select
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.profiler import (
    ProfilingContext,
    _normalize_statement,
    attach_profiling_listeners,
    profile_queries,
)

Base = declarative_base()


class SampleModel(Base):
    __tablename__ = "sample_models"
    id = Column(Integer, primary_key=True)
    name = Column(String(50))


@pytest.fixture()
def profiled_engine():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    attach_profiling_listeners(engine, slow_threshold_ms=10.0)
    return engine


def test_statement_normalization_masks_values():
    raw = "SELECT * FROM expenses WHERE amount_paise = 45000 AND note = 'secret password 123'"
    normalized = _normalize_statement(raw)
    assert "45000" not in normalized
    assert "secret password" not in normalized
    assert "?" in normalized


def test_profile_queries_captures_count_and_timing(profiled_engine):
    Session = sessionmaker(bind=profiled_engine)
    session = Session()

    with profile_queries(slow_threshold_ms=50.0) as profiler:
        session.add(SampleModel(name="test1"))
        session.add(SampleModel(name="test2"))
        session.commit()
        results = session.execute(select(SampleModel)).scalars().all()
        assert len(results) == 2

    assert profiler.query_count >= 1
    assert profiler.total_query_time_ms >= 0.0
    session.close()


def test_n_plus_one_detection():
    ctx = ProfilingContext(active=True)
    normalized = "SELECT ? FROM ? WHERE id = ?"
    for _ in range(5):
        ctx.query_patterns[normalized] = ctx.query_patterns.get(normalized, 0) + 1

    n_plus_one = ctx.potential_n_plus_one
    assert len(n_plus_one) == 1
    assert n_plus_one[0][0] == normalized
    assert n_plus_one[0][1] == 5
