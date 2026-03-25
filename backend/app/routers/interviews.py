from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.interviewer import next_question
from app.database import get_db
from app.deps import get_current_user
from app.models import (
    IntegrityEvent,
    Interview,
    InterviewSession,
    InterviewStatus,
    InterviewRound,
    RoundStatus,
    User,
    UserRole,
)
from app.schemas import (
    ChatMessageIn,
    ChatMessageOut,
    IntegrityEventIn,
    InterviewCreate,
    InterviewOut,
    SessionEndIn,
)
from app.services.identity import face_match_score
from app.services.interview_flow import build_interview_from_resume, finalize_session

router = APIRouter(prefix="/interviews", tags=["interviews"])

ROUND_QUESTION_CLOSING = (
    "Thank you—that completes all questions planned for this round. "
    "When you are ready, tap End and get scores to finish and receive your evaluation."
)


def _interviewer_turn_count(transcript: list) -> int:
    return sum(1 for m in transcript if isinstance(m, dict) and m.get("role") == "interviewer")


def _session_reached_question_closing(transcript: list) -> bool:
    if not transcript:
        return False
    last = transcript[-1]
    if not isinstance(last, dict) or last.get("role") != "interviewer":
        return False
    return str(last.get("content") or "").strip().startswith("Thank you—that completes all questions planned")


def _question_cap_for_session(session_id: int) -> int:
    """Deterministic cap in [7, 10] so each session has a bounded interview length."""
    return 7 + (session_id % 4)


def _require_candidate(user: User) -> None:
    if user.role != UserRole.candidate:
        raise HTTPException(status_code=403, detail="Candidates only")


@router.post("", response_model=InterviewOut)
async def create_interview(
    body: InterviewCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Interview:
    _require_candidate(user)
    await db.refresh(user, attribute_names=["profile"])
    interview = await build_interview_from_resume(
        db,
        candidate=user,
        job_title=body.job_title,
        total_rounds=body.total_rounds,
        round_kinds=body.round_kinds,
    )
    res = await db.execute(
        select(Interview)
        .options(selectinload(Interview.rounds))
        .where(Interview.id == interview.id)
    )
    inv = res.scalar_one()
    if inv.rounds:
        first = sorted(inv.rounds, key=lambda r: r.round_number)[0]
        now = datetime.now(timezone.utc)
        first.status = RoundStatus.scheduled
        first.scheduled_at = now
        inv.status = InterviewStatus.scheduled
        await db.commit()
        res = await db.execute(
            select(Interview)
            .options(selectinload(Interview.rounds))
            .where(Interview.id == inv.id)
        )
        inv = res.scalar_one()
    return inv


@router.get("/mine", response_model=list[InterviewOut])
async def list_mine(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[Interview]:
    _require_candidate(user)
    res = await db.execute(
        select(Interview)
        .options(selectinload(Interview.rounds))
        .where(Interview.candidate_id == user.id)
        .order_by(Interview.id.desc())
    )
    return list(res.scalars().unique().all())


@router.get("/{interview_id}", response_model=InterviewOut)
async def get_interview(
    interview_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Interview:
    res = await db.execute(
        select(Interview)
        .options(selectinload(Interview.rounds))
        .where(Interview.id == interview_id)
    )
    inv = res.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role == UserRole.candidate and inv.candidate_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return inv


@router.post("/{interview_id}/rounds/{round_id}/sessions/start")
async def start_session(
    interview_id: int,
    round_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _require_candidate(user)
    inv = await db.get(Interview, interview_id)
    if not inv or inv.candidate_id != user.id:
        raise HTTPException(status_code=404, detail="Interview not found")
    rr = await db.get(InterviewRound, round_id)
    if not rr or rr.interview_id != inv.id:
        raise HTTPException(status_code=404, detail="Round not found")
    if rr.status != RoundStatus.scheduled:
        raise HTTPException(
            status_code=400,
            detail="Round must be scheduled — accept the email invitation first.",
        )
    sess = InterviewSession(round_id=rr.id, transcript_json=[])
    db.add(sess)
    rr.status = RoundStatus.in_progress
    inv.status = InterviewStatus.in_progress
    await db.commit()
    await db.refresh(sess)
    return {"session_id": sess.id, "round_id": rr.id}


@router.post("/{interview_id}/rounds/{round_id}/sessions/{session_id}/message", response_model=ChatMessageOut)
async def post_message(
    interview_id: int,
    round_id: int,
    session_id: int,
    body: ChatMessageIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatMessageOut:
    _require_candidate(user)
    inv = await db.get(Interview, interview_id)
    if not inv or inv.candidate_id != user.id:
        raise HTTPException(status_code=404, detail="Interview not found")
    rr = await db.get(InterviewRound, round_id)
    if not rr or rr.interview_id != inv.id:
        raise HTTPException(status_code=404, detail="Round not found")
    sess = await db.get(InterviewSession, session_id)
    if not sess or sess.round_id != rr.id:
        raise HTTPException(status_code=404, detail="Session not found")
    transcript = list(sess.transcript_json or [])

    if _session_reached_question_closing(transcript):
        await db.commit()
        return ChatMessageOut(
            reply=ROUND_QUESTION_CLOSING,
            transcript_length=len(transcript),
            question_limit_reached=True,
        )

    if body.content.strip():
        transcript.append({"role": "candidate", "content": body.content.strip()})

    cap = _question_cap_for_session(session_id)
    n_i = _interviewer_turn_count(transcript)

    if n_i >= cap:
        transcript.append({"role": "interviewer", "content": ROUND_QUESTION_CLOSING})
        sess.transcript_json = transcript
        await db.commit()
        return ChatMessageOut(
            reply=ROUND_QUESTION_CLOSING,
            transcript_length=len(transcript),
            question_limit_reached=True,
        )

    await db.refresh(user, attribute_names=["profile"])
    resume_excerpt = user.profile.resume_text if user.profile else ""
    t_text = "\n".join(f"{m['role']}: {m['content']}" for m in transcript if isinstance(m, dict))
    q = next_question(
        round_title=rr.title,
        round_kind=rr.round_kind or "general",
        focus_areas=rr.focus_areas_json,
        job_title=inv.job_title,
        transcript_so_far=t_text,
        resume_excerpt=resume_excerpt,
        question_index_one_based=n_i + 1,
        questions_cap=cap,
    )
    transcript.append({"role": "interviewer", "content": q})
    sess.transcript_json = transcript
    await db.commit()
    return ChatMessageOut(reply=q, transcript_length=len(transcript), question_limit_reached=False)


@router.post("/{interview_id}/rounds/{round_id}/sessions/{session_id}/integrity")
async def post_integrity(
    interview_id: int,
    round_id: int,
    session_id: int,
    body: IntegrityEventIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _require_candidate(user)
    inv = await db.get(Interview, interview_id)
    if not inv or inv.candidate_id != user.id:
        raise HTTPException(status_code=404, detail="Interview not found")
    rr = await db.get(InterviewRound, round_id)
    if not rr or rr.interview_id != inv.id:
        raise HTTPException(status_code=404, detail="Round not found")
    sess = await db.get(InterviewSession, session_id)
    if not sess or sess.round_id != rr.id:
        raise HTTPException(status_code=404, detail="Session not found")
    db.add(
        IntegrityEvent(
            session_id=sess.id,
            event_type=body.event_type,
            payload_json=body.payload_json,
        )
    )
    await db.commit()
    return {"ok": True}


@router.post("/{interview_id}/rounds/{round_id}/sessions/{session_id}/face-check")
async def face_check(
    interview_id: int,
    round_id: int,
    session_id: int,
    body: dict,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Client sends live descriptor { embedding: number[] }; compared to enrolled face."""
    _require_candidate(user)
    inv = await db.get(Interview, interview_id)
    if not inv or inv.candidate_id != user.id:
        raise HTTPException(status_code=404, detail="Interview not found")
    rr = await db.get(InterviewRound, round_id)
    if not rr or rr.interview_id != inv.id:
        raise HTTPException(status_code=404, detail="Round not found")
    sess = await db.get(InterviewSession, session_id)
    if not sess or sess.round_id != rr.id:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.refresh(user, attribute_names=["face_enrollment"])
    if not user.face_enrollment:
        return {"match_score": None, "note": "No enrollment on file"}
    score = face_match_score(user.face_enrollment.descriptor_json, body)
    prev = sess.identity_match_avg
    sess.identity_match_avg = float(score) if prev is None else (float(prev) * 0.7 + score * 0.3)
    if score < 0.35:
        db.add(
            IntegrityEvent(
                session_id=sess.id,
                event_type="face_mismatch",
                payload_json={"match_score": score},
            )
        )
    await db.commit()
    return {"match_score": score}


@router.post("/{interview_id}/rounds/{round_id}/sessions/{session_id}/end")
async def end_session(
    interview_id: int,
    round_id: int,
    session_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    payload: SessionEndIn | None = Body(default=None),
) -> dict:
    _require_candidate(user)
    inv = await db.get(Interview, interview_id)
    if not inv or inv.candidate_id != user.id:
        raise HTTPException(status_code=404, detail="Interview not found")
    rr = await db.get(InterviewRound, round_id)
    if not rr or rr.interview_id != inv.id:
        raise HTTPException(status_code=404, detail="Round not found")
    sess = await db.get(InterviewSession, session_id)
    if not sess or sess.round_id != rr.id:
        raise HTTPException(status_code=404, detail="Session not found")
    end_body = payload or SessionEndIn()
    rr = await finalize_session(
        db,
        session=sess,
        job_title=inv.job_title,
        round_row=rr,
        technical_code_snapshot=end_body.technical_code_snapshot,
        whiteboard_was_used=end_body.whiteboard_was_used,
    )
    out = {
        "round_status": rr.status.value,
        "score": rr.score,
        "passed": rr.pass_recommendation,
        "scores_breakdown": rr.scores_breakdown_json,
        "next_step": "Start the next round from your dashboard when you are ready." if rr.pass_recommendation else "Process ended for this track.",
    }
    return out


@router.get("/{interview_id}/report")
async def get_report(
    interview_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    inv = await db.get(Interview, interview_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role == UserRole.candidate and inv.candidate_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"markdown": inv.final_report_markdown or ""}
