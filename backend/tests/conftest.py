# backend/tests/conftest.py
"""
Fixtures partagées pour tous les tests CipherFlow.

- SQLite in-memory (StaticPool) → isolation par test
- TestClient FastAPI avec injection DB de test via dependency_override
- Helpers : test_agency, test_user, auth_token, auth_headers
"""
import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from unittest.mock import patch

# ── Env vars AVANT tout import app ────────────────────────────────────────────
# Doit être positionné ici (module-level) avant le premier import de l'app.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-for-testing-only-32c")
os.environ.setdefault("OAUTH_STATE_SECRET", "test-oauth-state-secret-key-for-hmac")
os.environ.setdefault("FERNET_KEY", "RrdcRxBr2IIxHpfU6EBYxNPAp0Hk_j0-z-9nEaFWJgo=")
os.environ.setdefault("WATCHER_SECRET", "test-watcher-secret")
os.environ.setdefault("MISTRAL_API_KEY", "test-mistral-api-key")
os.environ.setdefault("RESEND_API_KEY", "test-resend-api-key")
os.environ.setdefault("RESEND_FROM_EMAIL", "noreply@test.com")
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_SECRET", "test-google-client-secret")
os.environ.setdefault("GOOGLE_OAUTH_REDIRECT_URL", "http://localhost:8000/auth/google/callback")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
os.environ.setdefault("BACKEND_URL", "http://localhost:8000")
# Désactive le worker RGPD et Redis en tests
os.environ["ENABLE_RETENTION_WORKER"] = "false"

from app.database.database import get_db
from app.database.models import Base, Agency, User, UserRole, AppSettings
from app.security import get_password_hash
from app.main import app

# ── Désactive le rate limiter slowapi pour toute la suite de tests ────────────
# Les décorateurs @rate_limit sont appliqués à l'import avec l'instance _limiter
# de auth_routes. On désactive cette instance + app.state.limiter pour éviter 429.
try:
    import app.api.auth_routes as _auth_mod
    if hasattr(_auth_mod, "_limiter"):
        _auth_mod._limiter.enabled = False  # désactive l'instance auth_routes
except Exception:
    pass
try:
    if hasattr(app.state, "limiter"):
        app.state.limiter.enabled = False   # désactive le limiter global app
except Exception:
    pass

TEST_USER_EMAIL = "admin@test.com"
TEST_USER_PASSWORD = "TestPass123!"
WATCHER_SECRET = os.environ["WATCHER_SECRET"]


# ══════════════════════════════════════════════════════════════════════════════
# 🗄️  Fixtures base de données
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="function")
def test_engine():
    """
    Moteur SQLite in-memory avec StaticPool (connexion unique → données
    partagées dans le même processus, isolation entre tests).
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db_session(test_engine):
    """Session SQLAlchemy sur la DB de test."""
    Session = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = Session()
    yield session
    session.close()


# ══════════════════════════════════════════════════════════════════════════════
# 🌐 Client FastAPI
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="function")
def client(db_session):
    """
    TestClient FastAPI avec :
    - DB de test injectée via dependency_override
    - Mocks : send_verification_email, send_reset_password_email
    """
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    mock_verify  = patch("app.api.auth_routes.send_verification_email")
    mock_reset   = patch("app.api.auth_routes.send_reset_password_email")

    mock_verify.start()
    mock_reset.start()
    with TestClient(app) as c:
        yield c
    mock_verify.stop()
    mock_reset.stop()
    app.dependency_overrides.clear()


# ══════════════════════════════════════════════════════════════════════════════
# 👤 Fixtures données
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def test_agency(db_session) -> Agency:
    """Agence de test."""
    agency = Agency(name="Test Agency", email_alias="testagency")
    db_session.add(agency)
    db_session.commit()
    db_session.refresh(agency)
    return agency


@pytest.fixture
def test_user(db_session, test_agency) -> User:
    """Utilisateur agency_admin vérifié."""
    user = User(
        email=TEST_USER_EMAIL,
        hashed_password=get_password_hash(TEST_USER_PASSWORD),
        agency_id=test_agency.id,
        role=UserRole.AGENCY_ADMIN,
        email_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_app_settings(db_session, test_agency) -> AppSettings:
    """AppSettings pour l'agence de test."""
    s = AppSettings(
        agency_id=test_agency.id,
        company_name="Test Agency",
        tone="professionnel",
        signature="Cordialement,",
        auto_reply_enabled=False,
        auto_reply_delay_minutes=0,
    )
    db_session.add(s)
    db_session.commit()
    db_session.refresh(s)
    return s


@pytest.fixture
def auth_token(client, test_user) -> str:
    """JWT access token via login."""
    resp = client.post("/auth/login", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD,
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture
def auth_headers(auth_token) -> dict:
    """Headers Bearer pour les requêtes authentifiées."""
    return {"Authorization": f"Bearer {auth_token}"}
