import os
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth_utils import hash_password
from app.config import settings
from app.database import Base, engine, SessionLocal
from app.interview_ws import router as ws_router
from app.migrate import run_sql_migrations
from app.models import User
from app.routers import admin, auth, rounds, sessions, subscriptions

app = FastAPI(title="InterviewAI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(subscriptions.router)
app.include_router(sessions.router)
app.include_router(rounds.router)
app.include_router(admin.router)
app.include_router(ws_router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    run_sql_migrations()
    os.makedirs(settings.upload_dir, exist_ok=True)
    db = SessionLocal()
    try:
        admin_email = "admin@gmail.com"
        existing = db.query(User).filter(User.email == admin_email).first()
        if not existing:
            db.add(
                User(
                    email=admin_email,
                    hashed_password=hash_password("admin123"),
                    is_admin=True,
                    full_name="Administrator",
                    subscription_tier="enterprise",
                    subscription_starts_at=datetime.utcnow(),
                    subscription_ends_at=datetime(2099, 12, 31, 23, 59, 59),
                )
            )
            db.commit()
        else:
            u = existing
            if u.is_admin and (
                u.subscription_ends_at is None
                or not u.subscription_tier
                or u.subscription_tier == "free"
            ):
                u.subscription_tier = "enterprise"
                u.subscription_starts_at = u.subscription_starts_at or datetime.utcnow()
                u.subscription_ends_at = datetime(2099, 12, 31, 23, 59, 59)
                db.commit()
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok"}
