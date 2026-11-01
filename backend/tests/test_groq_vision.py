"""Mocked tests for the Groq vision integration.

No live Groq API key is required. httpx.MockTransport is used to simulate
successful responses, timeouts, rate-limit (429) errors, malformed JSON, and
transport failures. Every failure path must fall back to Tesseract OCR.
"""

import httpx
import pytest

from app.services.groq_vision import (
    GroqRateLimitError,
    GroqResponseError,
    GroqUnavailableError,
    GroqVisionError,
    GroqVisionProvider,
)


def _make_client(status=200, json_body=None, exc=None, raw_text=None):
    """Build an httpx client backed by MockTransport with canned responses."""

    def handler(request: httpx.Request) -> httpx.Response:
        if exc is not None:
            raise exc
        if raw_text is not None:
            return httpx.Response(status, content=raw_text)
        return httpx.Response(status, json=json_body)

    return httpx.Client(transport=httpx.MockTransport(handler))


def _image() -> bytes:
    return b"\xff\xd8\xff\xe0\x00\x10JFIF" + (b"\x00" * 50)


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

def test_groq_unavailable_without_api_key(monkeypatch):
    from app.core import config as config_module

    monkeypatch.setattr(config_module.settings, "groq_api_key", None)
    monkeypatch.setattr(config_module.settings, "groq_api_key_fallback", None)
    provider = GroqVisionProvider(api_key=None, fallback_api_key=None)
    assert provider.is_available() is False
    with pytest.raises(GroqUnavailableError):
        provider.analyze_receipt(_image())


def test_groq_available_with_api_key():
    provider = GroqVisionProvider(api_key="test-key", http_client=_make_client())
    assert provider.is_available() is True


# ---------------------------------------------------------------------------
# Success
# ---------------------------------------------------------------------------

def test_groq_success_parses_receipt_fields():
    body = {
        "choices": [
            {
                "message": {
                    "content": (
                        '{"merchant":"KSRTC","expense_date":"2026-11-04",'
                        '"total_paise":1200,"currency":"INR",'
                        '"payment_method":"Cash","suggested_category":"Travel",'
                        '"confidence":{"merchant":0.9,"date":0.9,"amount":0.95,"type":0.8}}'
                    )
                }
            }
        ]
    }
    provider = GroqVisionProvider(
        api_key="test-key", model="qwen/qwen3.8-27b", http_client=_make_client(json_body=body)
    )
    result = provider.analyze_receipt(_image())
    assert result["merchant"] == "KSRTC"
    assert result["expense_date"] == "2026-11-04"
    assert result["total_paise"] == 1200  # ₹12.00
    assert result["currency"] == "INR"
    assert result["payment_method"] == "Cash"
    assert result["suggested_category"] == "Travel"
    assert result["confidence"]["amount"] == 0.95


# ---------------------------------------------------------------------------
# Failures that must fall back to Tesseract
# ---------------------------------------------------------------------------

def test_groq_rate_limit_raises():
    provider = GroqVisionProvider(
        api_key="test-key",
        http_client=_make_client(status=429, json_body={"error": "rate limited"}),
    )
    with pytest.raises(GroqRateLimitError):
        provider.analyze_receipt(_image())


def test_groq_invalid_key_raises():
    provider = GroqVisionProvider(
        api_key="bad-key",
        http_client=_make_client(status=401, json_body={"error": "invalid key"}),
    )
    with pytest.raises(GroqUnavailableError):
        provider.analyze_receipt(_image())


def test_groq_timeout_raises():
    provider = GroqVisionProvider(
        api_key="test-key",
        http_client=_make_client(exc=httpx.TimeoutException("read timeout")),
    )
    with pytest.raises(GroqVisionError):
        provider.analyze_receipt(_image())


def test_groq_network_error_raises():
    provider = GroqVisionProvider(
        api_key="test-key",
        http_client=_make_client(exc=httpx.TransportError("boom")),
    )
    with pytest.raises(GroqVisionError):
        provider.analyze_receipt(_image())


def test_groq_malformed_json_raises():
    provider = GroqVisionProvider(
        api_key="test-key",
        http_client=_make_client(status=200, raw_text=b"{not valid json"),
    )
    with pytest.raises(GroqResponseError):
        provider.analyze_receipt(_image())


def test_groq_empty_content_raises():
    provider = GroqVisionProvider(
        api_key="test-key",
        http_client=_make_client(
            status=200, json_body={"choices": [{"message": {"content": ""}}]}
        ),
    )
    with pytest.raises(GroqResponseError):
        provider.analyze_receipt(_image())


def test_groq_non_json_object_raises():
    provider = GroqVisionProvider(
        api_key="test-key",
        http_client=_make_client(
            status=200,
            json_body={"choices": [{"message": {"content": "[1,2,3]"}}]},
        ),
    )
    with pytest.raises(GroqResponseError):
        provider.analyze_receipt(_image())


# ---------------------------------------------------------------------------
# Amount sanity (bus ticket: TOTAL RS: 12 vs unrelated 149600)
# ---------------------------------------------------------------------------

def test_groq_normalizes_amount_to_paise():
    from app.services.groq_vision import _normalize_amount

    assert _normalize_amount(12) == 1200       # rupees -> paise
    assert _normalize_amount(12.00) == 1200
    assert _normalize_amount("12.00") == 1200
    assert _normalize_amount(1200) == 1200     # already paise
    assert _normalize_amount(149600) == 149600  # large but plausible value is kept as paise
    assert _normalize_amount(None) is None
    assert _normalize_amount("not-a-number") is None


def test_groq_rejects_invalid_date():
    from app.services.groq_vision import _normalize_date
    from datetime import date

    assert _normalize_date("2026-11-04") == date(2026, 11, 4)
    assert _normalize_date("not-a-date") is None
    assert _normalize_date("2026-13-40") is None  # impossible date
    assert _normalize_date(None) is None


def test_groq_normalizes_category():
    from app.services.groq_vision import _normalize_category

    assert _normalize_category("Travel") == "Travel"
    assert _normalize_category("travel") == "Travel"
    assert _normalize_category("Food") == "Food"
    assert _normalize_category("Random") is None
    assert _normalize_category(None) is None


def test_groq_normalizes_amount_edge_cases():
    from app.services.groq_vision import _normalize_amount

    assert _normalize_amount(12) == 1200       # rupees -> paise
    assert _normalize_amount(12.00) == 1200
    assert _normalize_amount("12.00") == 1200
    assert _normalize_amount(1200) == 1200     # already paise
    assert _normalize_amount(149600) == 149600  # large but plausible value kept as paise
    assert _normalize_amount(None) is None
    assert _normalize_amount("not-a-number") is None
    assert _normalize_amount(-5) is None        # negative amounts rejected
    assert _normalize_amount(0) is None         # zero is not a valid expense


def test_groq_rejects_invalid_date():
    from app.services.groq_vision import _normalize_date
    from datetime import date

    assert _normalize_date("2026-11-04") == date(2026, 11, 4)
    assert _normalize_date("not-a-date") is None
    assert _normalize_date("2026-13-40") is None  # impossible date
    assert _normalize_date(None) is None


# --------------------------------------------------------------------------- #
# Fallback API key behaviour
# --------------------------------------------------------------------------- #

def _success_body():
    return {
        "choices": [
            {
                "message": {
                    "content": (
                        '{"merchant":"KSRTC","expense_date":"2026-11-04",'
                        '"total_paise":1200,"currency":"INR",'
                        '"payment_method":"Cash","suggested_category":"Travel",'
                        '"confidence":{"merchant":0.9,"date":0.9,"amount":0.95,"type":0.8}}'
                    )
                }
            }
        ]
    }


def test_groq_fallback_primary_success_no_fallback_call():
    body = _success_body()
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(200, json=body)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = GroqVisionProvider(
        api_key="primary-key", fallback_api_key="fallback-key", http_client=client
    )
    result = provider.analyze_receipt(_image())
    assert result["merchant"] == "KSRTC"
    assert calls["n"] == 1


def test_groq_fallback_rate_limit_then_success():
    body = _success_body()
    calls = {"n": 0}
    auths = []

    def handler(request):
        calls["n"] += 1
        auths.append(request.headers.get("authorization"))
        if calls["n"] == 1:
            return httpx.Response(429, json={"error": "rate limited"})
        return httpx.Response(200, json=body)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = GroqVisionProvider(
        api_key="primary-key", fallback_api_key="fallback-key", http_client=client
    )
    result = provider.analyze_receipt(_image())
    assert result["merchant"] == "KSRTC"
    assert calls["n"] == 2
    assert auths[0] == "Bearer primary-key"
    assert auths[1] == "Bearer fallback-key"


def test_groq_fallback_service_error_then_success():
    body = _success_body()
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(500, json={"error": "boom"})
        return httpx.Response(200, json=body)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = GroqVisionProvider(
        api_key="primary-key", fallback_api_key="fallback-key", http_client=client
    )
    result = provider.analyze_receipt(_image())
    assert result["merchant"] == "KSRTC"
    assert calls["n"] == 2


def test_groq_fallback_both_keys_fail_raises_rate_limit():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(429, json={"error": "rate limited"})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = GroqVisionProvider(
        api_key="primary-key", fallback_api_key="fallback-key", http_client=client
    )
    with pytest.raises(GroqRateLimitError):
        provider.analyze_receipt(_image())
    assert calls["n"] == 2


def test_groq_fallback_missing_fallback_key_raises():
    provider = GroqVisionProvider(
        api_key="primary-key",
        fallback_api_key=None,
        http_client=_make_client(status=429, json_body={"error": "rate limited"}),
    )
    with pytest.raises(GroqRateLimitError):
        provider.analyze_receipt(_image())


def test_groq_fallback_invalid_primary_credentials_no_retry():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(401, json={"error": "invalid key"})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = GroqVisionProvider(
        api_key="primary-key", fallback_api_key="fallback-key", http_client=client
    )
    with pytest.raises(GroqUnavailableError):
        provider.analyze_receipt(_image())
    assert calls["n"] == 1


def test_groq_fallback_connection_error_then_success():
    body = _success_body()
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ConnectError("boom")
        return httpx.Response(200, json=body)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = GroqVisionProvider(
        api_key="primary-key", fallback_api_key="fallback-key", http_client=client
    )
    result = provider.analyze_receipt(_image())
    assert result["merchant"] == "KSRTC"
    assert calls["n"] == 2


def test_groq_fallback_timeout_then_success():
    body = _success_body()
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.TimeoutException("slow")
        return httpx.Response(200, json=body)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = GroqVisionProvider(
        api_key="primary-key", fallback_api_key="fallback-key", http_client=client
    )
    result = provider.analyze_receipt(_image())
    assert result["merchant"] == "KSRTC"
    assert calls["n"] == 2


def test_groq_fallback_5xx_both_fail_raises():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(503, json={"error": "unavailable"})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = GroqVisionProvider(
        api_key="primary-key", fallback_api_key="fallback-key", http_client=client
    )
    with pytest.raises(GroqVisionError):
        provider.analyze_receipt(_image())
    assert calls["n"] == 2
