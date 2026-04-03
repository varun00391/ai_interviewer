import re
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import InterviewSession, User

FREE_TOTAL_INTERVIEWS = 3
STANDARD_DAILY = 3
ENTERPRISE_DAILY = 20
SUBSCRIPTION_LENGTH_DAYS = 30


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_utc_naive(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def effective_tier(user: User) -> str:
    if user.is_admin:
        return "enterprise"
    tier = (user.subscription_tier or "free").lower()
    if tier not in ("free", "standard", "enterprise"):
        tier = "free"
    if tier in ("standard", "enterprise"):
        end = _as_utc_naive(user.subscription_ends_at)
        if end and utc_now_naive() > end:
            return "free"
    return tier


def allocate_username(db: Session, email: str, requested: str | None) -> str:
    existing = db.query(User).filter(User.email == email).first()
    if existing and existing.username:
        return existing.username
    raw = (requested or email.split("@")[0]).strip()
    base = re.sub(r"[^a-zA-Z0-9_]", "_", raw)[:40].strip("_") or "user"
    cand = base
    n = 0
    while db.query(User.id).filter(User.username == cand).first():
        n += 1
        cand = f"{base}_{n}"
    return cand


def backfill_missing_usernames(db: Session) -> None:
    for u in db.query(User).filter(User.username.is_(None)).all():
        u.username = allocate_username(db, u.email, None)
    db.commit()


def app_access_blocked(user: User, db: Session) -> tuple[bool, str | None]:
    if user.is_admin:
        return False, None
    stored = (user.subscription_tier or "free").lower()
    end = _as_utc_naive(user.subscription_ends_at)
    if stored in ("standard", "enterprise") and end is not None:
        if utc_now_naive() > end:
            return True, (
                "Your monthly subscription has ended. Start a subscription again to regain "
                "access to InterviewAI."
            )
    if stored == "free":
        total = count_sessions_total(db, user.id)
        if total >= FREE_TOTAL_INTERVIEWS:
            return True, (
                "Your free interview quota is finished. Start a subscription again to continue "
                "using InterviewAI."
            )
    return False, None


def assert_app_access_allowed(user: User, db: Session) -> None:
    from fastapi import HTTPException

    blocked, msg = app_access_blocked(user, db)
    if blocked:
        raise HTTPException(status_code=403, detail=msg or "Access denied")


def count_sessions_total(db: Session, user_id: int) -> int:
    return (
        db.query(func.count(InterviewSession.id))
        .filter(InterviewSession.user_id == user_id)
        .scalar()
        or 0
    )


def count_sessions_today_utc(db: Session, user_id: int) -> int:
    now = utc_now_naive()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(func.count(InterviewSession.id))
        .filter(
            InterviewSession.user_id == user_id,
            InterviewSession.created_at >= day_start,
        )
        .scalar()
        or 0
    )


def assert_can_create_session(db: Session, user: User) -> None:
    from fastapi import HTTPException

    if user.is_admin:
        return
    tier = effective_tier(user)
    if tier == "free":
        total = count_sessions_total(db, user.id)
        if total >= FREE_TOTAL_INTERVIEWS:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Free plan includes 3 practice interviews total. "
                    "Upgrade to continue with a paid subscription."
                ),
            )
    elif tier == "standard":
        today_n = count_sessions_today_utc(db, user.id)
        if today_n >= STANDARD_DAILY:
            raise HTTPException(
                status_code=403,
                detail=(
                    "You have reached today’s limit (3 interviews) on the Standard plan. "
                    "Try again tomorrow or upgrade to Enterprise."
                ),
            )
    elif tier == "enterprise":
        today_n = count_sessions_today_utc(db, user.id)
        if today_n >= ENTERPRISE_DAILY:
            raise HTTPException(
                status_code=403,
                detail=(
                    "You have reached today’s limit (20 interviews) on the Enterprise plan. "
                    "Try again tomorrow."
                ),
            )


def apply_new_subscription(user: User, tier: str) -> None:
    tier = tier.lower()
    if tier not in ("standard", "enterprise"):
        return
    now = utc_now_naive()
    user.subscription_tier = tier
    user.subscription_starts_at = now
    user.subscription_ends_at = now + timedelta(days=SUBSCRIPTION_LENGTH_DAYS)


def set_free_tier(user: User) -> None:
    user.subscription_tier = "free"
    user.subscription_starts_at = None
    user.subscription_ends_at = None


def user_me_payload(user: User, db: Session) -> dict[str, Any]:
    tier = effective_tier(user)
    total = count_sessions_total(db, user.id)
    today = count_sessions_today_utc(db, user.id)
    daily_limit: int | None = None
    total_limit: int | None = None
    if tier == "free":
        total_limit = FREE_TOTAL_INTERVIEWS
    elif tier == "standard":
        daily_limit = STANDARD_DAILY
    elif tier == "enterprise":
        daily_limit = ENTERPRISE_DAILY

    blocked, lock_msg = app_access_blocked(user, db)

    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "is_admin": user.is_admin,
        "full_name": user.full_name,
        "created_at": user.created_at,
        "subscription_tier": tier,
        "subscription_tier_stored": user.subscription_tier or "free",
        "subscription_starts_at": user.subscription_starts_at,
        "subscription_ends_at": user.subscription_ends_at,
        "interviews_total": total,
        "interviews_today": today,
        "interviews_total_limit": total_limit,
        "interviews_daily_limit": daily_limit,
        "app_access_blocked": blocked,
        "app_access_message": lock_msg,
    }
