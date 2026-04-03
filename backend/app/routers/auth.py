from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth_utils import create_access_token, hash_password, verify_password
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import LoginRequest, Token, UserCreate, UserMeOut
from app.services.subscription import user_me_payload

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserMeOut)
def register(body: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    tier = body.subscription_plan
    starts = ends = None
    if tier in ("standard", "enterprise"):
        starts = datetime.utcnow()
        ends = starts + timedelta(days=30)
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        is_admin=False,
        subscription_tier=tier,
        subscription_starts_at=starts,
        subscription_ends_at=ends,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_me_payload(user, db)


@router.post("/login", response_model=Token)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    return Token(access_token=create_access_token(user.email))


@router.get("/me", response_model=UserMeOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_me_payload(user, db)
