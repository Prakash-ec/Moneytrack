from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps import get_current_user
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import User


def test_password_hashing():
    pw = "SuperSecurePassword123!"
    hashed = hash_password(pw)
    assert hashed != pw
    assert verify_password(pw, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_token_creation_and_decoding():
    token = create_access_token(subject=42, extra_claims={"email": "user42@example.com"})
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "42"
    assert payload["email"] == "user42@example.com"
    assert "exp" in payload


def test_auth_register_and_login_flow(tmp_path):
    # Standalone isolated client without dependency overrides on get_current_user
    url = f"sqlite:///{(tmp_path / 'auth-test.db').as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # Explicitly remove mock get_current_user so real JWT verification executes
    if get_current_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_user]

    try:
        with TestClient(app) as test_client:
            # Register new user
            reg_payload = {
                "email": "fresh_user@example.com",
                "password": "Password12345!",
                "full_name": "Fresh User",
            }
            reg_resp = test_client.post("/api/auth/register", json=reg_payload)
            assert reg_resp.status_code == 201, reg_resp.text
            reg_data = reg_resp.json()
            assert "access_token" in reg_data
            assert reg_data["user"]["email"] == "fresh_user@example.com"

            # Login with valid credentials
            login_payload = {
                "email": "fresh_user@example.com",
                "password": "Password12345!",
            }
            login_resp = test_client.post("/api/auth/login", json=login_payload)
            assert login_resp.status_code == 200, login_resp.text
            login_data = login_resp.json()
            token = login_data["access_token"]

            # Verify /me endpoint with authorization token
            me_resp = test_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
            assert me_resp.status_code == 200, me_resp.text
            me_data = me_resp.json()
            assert me_data["email"] == "fresh_user@example.com"

            # Accessing /me with invalid token returns 401
            bad_resp = test_client.get("/api/auth/me", headers={"Authorization": "Bearer bad.token.here"})
            assert bad_resp.status_code == 401

            # Accessing /me without Authorization header returns 401
            no_auth_resp = test_client.get("/api/auth/me")
            assert no_auth_resp.status_code == 401
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
