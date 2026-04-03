from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import InterviewRound, InterviewSession, User
from app.schemas import RoundOut

router = APIRouter(prefix="/sessions", tags=["rounds"])


@router.get("/{session_id}/rounds", response_model=list[RoundOut])
def list_my_rounds(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    s = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id, InterviewSession.user_id == user.id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return (
        db.query(InterviewRound)
        .filter(InterviewRound.session_id == session_id)
        .order_by(InterviewRound.id.asc())
        .all()
    )
