import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import require_app_unlocked
from app.models import InterviewRound, InterviewSession, SessionStatus, User
from app.schemas import (
    RoundRecapOut,
    SessionCreate,
    SessionOut,
    SessionRecapOut,
    SessionUpdate,
)
from app.services.llm import extract_resume_structure, summarize_resume
from app.services.resume_structure import infer_seniority_tenure, merge_profile
from app.services.resume_parser import extract_text_from_bytes
from app.services.subscription import assert_can_create_session

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionOut)
def create_session(
    body: SessionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_app_unlocked),
):
    assert_can_create_session(db, user)
    mode = "full" if body.flow_type == "full" else "per_round"
    single = (
        body.single_round_type if body.flow_type == "single" else None
    )
    s = InterviewSession(
        user_id=user.id,
        role_title=body.role_title.strip(),
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
    user: User = Depends(require_app_unlocked),
):
    q = db.query(InterviewSession).filter(InterviewSession.user_id == user.id)
    return q.order_by(InterviewSession.created_at.desc()).all()


@router.get("/{session_id}", response_model=SessionOut)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_app_unlocked),
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
    user: User = Depends(require_app_unlocked),
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


@router.get("/{session_id}/recap", response_model=SessionRecapOut)
def get_session_recap(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_app_unlocked),
):
    s = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id, InterviewSession.user_id == user.id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    rows = (
        db.query(InterviewRound)
        .filter(InterviewRound.session_id == session_id)
        .order_by(InterviewRound.id.asc())
        .all()
    )
    recap_rounds: list[RoundRecapOut] = []
    scores: list[float] = []
    for r in rows:
        if r.completed_at is None:
            continue
        code = r.technical_code
        prev = None
        if code:
            prev = code[:500] + ("…" if len(code) > 500 else "")
        recap_rounds.append(
            RoundRecapOut(
                id=r.id,
                round_type=r.round_type,
                questions=r.questions,
                answers=r.answers,
                score_overall=r.score_overall,
                score_breakdown=r.score_breakdown,
                improvements=r.improvements,
                analytics=r.analytics,
                completed_at=r.completed_at,
                technical_code_preview=prev,
            )
        )
        if r.score_overall is not None:
            scores.append(float(r.score_overall))

    overall = round(sum(scores) / len(scores), 2) if scores else None

    return SessionRecapOut(
        id=s.id,
        role_title=s.role_title,
        status=s.status,
        flow_type=s.flow_type,
        hire_recommendation=s.hire_recommendation,
        overall_score_hint=overall,
        rounds=recap_rounds,
    )


@router.post("/{session_id}/resume")
async def upload_resume(
    session_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_app_unlocked),
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
    extracted = extract_resume_structure(text or "")
    inference = infer_seniority_tenure(extracted)
    structured = merge_profile(extracted, inference)

    s.resume_path = dest
    s.resume_text = text[:50000] if text else None
    s.resume_summary = summary
    s.resume_structured = structured
    db.commit()
    return {
        "ok": True,
        "summary": summary,
        "chars": len(text or ""),
        "resume_structured": structured,
    }
