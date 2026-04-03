import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import InterviewSession, InterviewRound, SessionStatus, User
from app.schemas import SessionCreate, SessionOut, SessionUpdate
from app.services.llm import summarize_resume
from app.services.resume_parser import extract_text_from_bytes
from app.services.subscription import assert_can_create_session

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionOut)
def create_session(
    body: SessionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_can_create_session(db, user)
    mode = "full" if body.flow_type == "full" else "per_round"
    single = (
        body.single_round_type if body.flow_type == "single" else None
    )
    s = InterviewSession(
        user_id=user.id,
        role_title=body.role_title.strip() or "Practice session",
        mode=mode,
        flow_type=body.flow_type,
        single_round_type=single,
        status=SessionStatus.draft.value,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("", response_model=list[SessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(InterviewSession).filter(InterviewSession.user_id == user.id)
    return q.order_by(InterviewSession.created_at.desc()).all()


@router.get("/{session_id}", response_model=SessionOut)
def get_session(
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
    return s


@router.patch("/{session_id}", response_model=SessionOut)
def update_session(
    session_id: int,
    body: SessionUpdate,
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
    data = body.model_dump(exclude_unset=True)
    if "role_title" in data and data["role_title"] is not None:
        s.role_title = str(data["role_title"]).strip()
    if "mode" in data and data["mode"] is not None:
        s.mode = data["mode"]
    if "flow_type" in data and data["flow_type"] is not None:
        ft = data["flow_type"]
        s.flow_type = ft
        if ft == "full":
            s.mode = "full"
            if "single_round_type" not in data:
                s.single_round_type = None
        elif ft == "single":
            s.mode = "per_round"
    if "single_round_type" in data:
        s.single_round_type = data["single_round_type"]
    db.commit()
    db.refresh(s)
    return s


@router.post("/{session_id}/resume")
async def upload_resume(
    session_id: int,
    file: UploadFile = File(...),
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

    os.makedirs(settings.upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".txt"
    fname = f"{session_id}_{uuid.uuid4().hex}{ext}"
    dest = os.path.join(settings.upload_dir, fname)
    data = await file.read()
    with open(dest, "wb") as f:
        f.write(data)

    text = extract_text_from_bytes(data, file.filename or "resume.txt")
    summary = summarize_resume(text or "No text extracted.")

    s.resume_path = dest
    s.resume_text = text[:50000] if text else None
    s.resume_summary = summary
    db.commit()
    return {"ok": True, "summary": summary, "chars": len(text or "")}
