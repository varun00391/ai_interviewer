from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models import InterviewRound, InterviewSession, SessionStatus, User
from app.schemas import AdminMetrics, AdminUserSummary, SessionOut, RoundOut
from app.services.subscription import effective_tier

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/metrics", response_model=AdminMetrics)
def metrics(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_sessions = db.query(func.count(InterviewSession.id)).scalar() or 0
    completed_sessions = (
        db.query(func.count(InterviewSession.id))
        .filter(InterviewSession.status == SessionStatus.completed.value)
        .scalar()
        or 0
    )
    rounds_completed = (
        db.query(func.count(InterviewRound.id))
        .filter(InterviewRound.completed_at.isnot(None))
        .scalar()
        or 0
    )
    avg = db.query(func.avg(InterviewRound.score_overall)).filter(
        InterviewRound.score_overall.isnot(None)
    ).scalar()
    return AdminMetrics(
        total_users=total_users,
        total_sessions=total_sessions,
        completed_sessions=completed_sessions,
        rounds_completed=rounds_completed,
        avg_round_score=float(avg) if avg is not None else None,
    )


@router.get("/users", response_model=list[AdminUserSummary])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    out: list[AdminUserSummary] = []
    for u in users:
        cnt = (
            db.query(func.count(InterviewSession.id))
            .filter(InterviewSession.user_id == u.id)
            .scalar()
            or 0
        )
        out.append(
            AdminUserSummary(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                is_admin=u.is_admin,
                created_at=u.created_at,
                session_count=cnt,
                subscription_tier=effective_tier(u),
                subscription_tier_stored=u.subscription_tier or "free",
                subscription_starts_at=u.subscription_starts_at,
                subscription_ends_at=u.subscription_ends_at,
            )
        )
    return out


@router.get("/sessions", response_model=list[SessionOut])
def all_sessions(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return (
        db.query(InterviewSession).order_by(InterviewSession.created_at.desc()).limit(200).all()
    )


@router.get("/sessions/{session_id}/rounds", response_model=list[RoundOut])
def session_rounds(
    session_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return (
        db.query(InterviewRound)
        .filter(InterviewRound.session_id == session_id)
        .order_by(InterviewRound.id.asc())
        .all()
    )
