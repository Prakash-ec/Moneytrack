from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import SetupStatusRead, Token, UserCreate, UserLogin, UserRead
from app.services import auth as service
from app.services.errors import ConflictError

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/setup-status", response_model=SetupStatusRead, summary="Check instance configuration status")
def setup_status(db: Session = Depends(get_db)) -> SetupStatusRead:
    return service.get_setup_status(db)


@router.post(
    "/register",
    response_model=Token,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
def register(data: UserCreate, db: Session = Depends(get_db)) -> Token:
    try:
        user, token = service.register_user(db, data)
    except ConflictError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    expires_in = settings.access_token_expire_minutes * 60
    return Token(
        access_token=token,
        token_type="bearer",
        expires_in_seconds=expires_in,
        user=UserRead.model_validate(user),
    )


@router.post("/login", response_model=Token, summary="Log in with email and password")
def login(data: UserLogin, db: Session = Depends(get_db)) -> Token:
    try:
        user, token = service.authenticate_user(db, data)
    except service.AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

    expires_in = settings.access_token_expire_minutes * 60
    return Token(
        access_token=token,
        token_type="bearer",
        expires_in_seconds=expires_in,
        user=UserRead.model_validate(user),
    )


@router.get("/me", response_model=UserRead, summary="Get current authenticated user profile")
def me(current_user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(current_user)
