import asyncio
import json
import secrets
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import (
    InterviewRound,
    InterviewSession,
    RoundType,
    SessionStatus,
    User,
)
from app.services.integrity import analyze_interview_frame_jpeg_b64
from app.services.llm import (
    decide_follow_up,
    generate_questions,
    score_full_interview,
    score_round_answers,
)
from app.services.subscription import assert_app_access_allowed

router = APIRouter()


def _token_from_ws(websocket: WebSocket) -> str | None:
    return websocket.query_params.get("token")


def _email_from_token(token: str) -> str | None:
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        sub = payload.get("sub")
        return str(sub) if sub else None
    except JWTError:
        return None


def _question_count() -> int:
    """Between 5 and 7 main questions (clamped even if env overrides are wrong)."""
    lo = max(5, min(settings.questions_per_round_min, 7))
    hi = max(lo, min(settings.questions_per_round_max, 7))
    return secrets.randbelow(hi - lo + 1) + lo


def _max_total_questions_per_round() -> int:
    """Hard ceiling for main + follow-up questions in one round (default 9)."""
    return min(max(int(settings.max_questions_per_round_total), 7), 9)


@dataclass
class LiveRound:
    session_id: int
    round_type: str
    questions: list[str]
    q_index: int = 0
    transcript: list[dict[str, Any]] = field(default_factory=list)
    answers: list[dict[str, Any]] = field(default_factory=list)
    technical_code: str = ""
    whiteboard_data_url: str | None = None
    db_round_id: int | None = None
    is_followup: list[bool] = field(default_factory=list)
    main_index_at: list[int] = field(default_factory=list)
    followups_used: list[int] = field(default_factory=list)


@dataclass
class ConnState:
    integrity_strikes: int = 0


async def _send(ws: WebSocket, payload: dict[str, Any]) -> None:
    await ws.send_text(json.dumps(payload))


def _strip_data_url(b64: str) -> str:
    if "," in b64 and b64.strip().startswith("data:"):
        return b64.split(",", 1)[1].strip()
    return b64.strip()


def _persist_hire_from_full(sess: InterviewSession, full: dict[str, Any]) -> None:
    hr = full.get("hire_recommendation")
    if isinstance(hr, dict):
        try:
            conf = float(hr.get("confidence", 0.5))
        except (TypeError, ValueError):
            conf = 0.5
        sess.hire_recommendation = {
            "verdict": str(hr.get("verdict") or "borderline"),
            "confidence": max(0.0, min(1.0, conf)),
            "rationale": str(hr.get("rationale") or ""),
        }
    else:
        sess.hire_recommendation = {
            "verdict": "borderline",
            "confidence": 0.5,
            "rationale": str(full.get("summary") or ""),
        }


async def _finalize_and_notify_round(
    websocket: WebSocket,
    db: Session,
    live: LiveRound,
    *,
    end_entire_session: bool,
) -> None:
    sess = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == live.session_id)
        .first()
    )
    row = (
        db.query(InterviewRound)
        .filter(InterviewRound.id == live.db_round_id)
        .first()
    )
    if not row or not sess:
        return

    qa_pairs = [{"q": a["question"], "a": a["answer"]} for a in live.answers]
    planned_n = len(live.questions)
    answered_n = len(qa_pairs)
    early_exit = end_entire_session or answered_n < planned_n

    scored = score_round_answers(
        live.round_type,
        sess.role_title,
        qa_pairs,
        live.technical_code if live.round_type == RoundType.technical.value else None,
        "[whiteboard image attached]" if live.whiteboard_data_url else None,
    )
    overall = float(scored.get("overall_score") or 0)
    row.transcript = live.transcript
    row.answers = live.answers
    row.questions = list(live.questions)
    row.score_overall = overall
    row.score_breakdown = scored.get("breakdown")
    row.improvements = scored.get("improvements")
    row.analytics = scored.get("analytics")
    row.technical_code = live.technical_code or None
    row.whiteboard_data_url = live.whiteboard_data_url
    row.completed_at = datetime.utcnow()
    db.commit()

    await _send(
        websocket,
        {
            "type": "round_complete",
            "round_type": live.round_type,
            "score_overall": overall,
            "breakdown": scored.get("breakdown"),
            "improvements": scored.get("improvements"),
            "analytics": scored.get("analytics"),
            "early_exit": early_exit,
        },
    )

    db.refresh(sess)
    mode = sess.mode
    completed_types = {
        r.round_type for r in sess.rounds if r.completed_at is not None
    }
    all_three = {
        RoundType.hr.value,
        RoundType.technical.value,
        RoundType.managerial.value,
    }

    if end_entire_session:
        rounds_payload = []
        for r in sorted(sess.rounds, key=lambda x: x.id):
            if r.completed_at and r.score_overall is not None:
                rounds_payload.append(
                    {
                        "round": r.round_type,
                        "overall_score": r.score_overall,
                        "analytics": r.analytics,
                    }
                )
        if rounds_payload:
            full = score_full_interview(sess.role_title, rounds_payload)
            _persist_hire_from_full(sess, full)
        else:
            full = {
                "overall_score": 0,
                "summary": "The interview was ended before scored answers were available.",
                "analytics": {
                    "trend": "n/a",
                    "best_round": "n/a",
                    "growth_areas": [],
                },
                "improvements": [
                    "Complete at least one answer next time for meaningful feedback.",
                ],
                "hire_recommendation": {
                    "verdict": "borderline",
                    "confidence": 0.35,
                    "rationale": "Not enough interview signal to recommend hire or no-hire.",
                },
            }
            sess.hire_recommendation = full["hire_recommendation"]
        sess.status = SessionStatus.completed.value
        db.commit()
        await _send(
            websocket,
            {
                "type": "interview_complete",
                "overall_score": full.get("overall_score"),
                "summary": full.get("summary"),
                "analytics": full.get("analytics"),
                "improvements": full.get("improvements"),
                "hire_recommendation": sess.hire_recommendation,
                "session_ended_early": True,
            },
        )
        return

    if completed_types >= all_three:
        rounds_payload = []
        for r in sorted(sess.rounds, key=lambda x: x.id):
            if r.completed_at and r.score_overall is not None:
                rounds_payload.append(
                    {
                        "round": r.round_type,
                        "overall_score": r.score_overall,
                        "analytics": r.analytics,
                    }
                )
        full = score_full_interview(sess.role_title, rounds_payload)
        _persist_hire_from_full(sess, full)
        sess.status = SessionStatus.completed.value
        db.commit()
        await _send(
            websocket,
            {
                "type": "interview_complete",
                "overall_score": full.get("overall_score"),
                "summary": full.get("summary"),
                "analytics": full.get("analytics"),
                "improvements": full.get("improvements"),
                "hire_recommendation": sess.hire_recommendation,
            },
        )
    elif mode == "full":
        nxt = None
        order = [
            RoundType.hr.value,
            RoundType.technical.value,
            RoundType.managerial.value,
        ]
        for rt in order:
            if rt not in completed_types:
                nxt = rt
                break
        if nxt:
            await _send(
                websocket,
                {
                    "type": "continue_round",
                    "next_round_type": nxt,
                    "message": f"Round complete. When you are ready, start the {nxt} round.",
                },
            )


@router.websocket("/ws/interview")
async def interview_ws(websocket: WebSocket):
    await websocket.accept()
    token = _token_from_ws(websocket)
    if not token:
        await _send(websocket, {"type": "error", "detail": "missing token"})
        await websocket.close(code=4401)
        return
    email = _email_from_token(token)
    if not email:
        await _send(websocket, {"type": "error", "detail": "invalid token"})
        await websocket.close(code=4401)
        return

    live: LiveRound | None = None
    conn = ConnState()

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            mtype = msg.get("type")
            db: Session = SessionLocal()
            try:
                user = db.query(User).filter(User.email == email).first()
                if not user:
                    await _send(websocket, {"type": "error", "detail": "user missing"})
                    break

                if mtype != "ping" and not user.is_admin:
                    try:
                        assert_app_access_allowed(user, db)
                    except HTTPException as e:
                        detail = e.detail
                        msg = detail if isinstance(detail, str) else "Access denied"
                        await _send(
                            websocket,
                            {"type": "app_locked", "detail": msg},
                        )
                        await websocket.close(code=4403)
                        return

                if mtype == "camera_frame":
                    session_id = int(msg.get("session_id") or 0)
                    if live is None or live.session_id != session_id:
                        continue
                    sess = (
                        db.query(InterviewSession)
                        .filter(
                            InterviewSession.id == session_id,
                            InterviewSession.user_id == user.id,
                        )
                        .first()
                    )
                    if not sess or sess.disqualified:
                        continue
                    img = _strip_data_url(str(msg.get("image_jpeg") or msg.get("image") or ""))
                    if len(img) < 80:
                        continue
                    result = await asyncio.to_thread(
                        analyze_interview_frame_jpeg_b64, img
                    )
                    severity = float(result.get("severity") or 0)
                    events = list(sess.integrity_events or [])
                    events.append(
                        {
                            "severity": severity,
                            "flags": result.get("flags"),
                            "notes": result.get("notes"),
                            "action": result.get("action"),
                        }
                    )
                    sess.integrity_events = events
                    sess.integrity_score = max(float(sess.integrity_score or 0), severity)
                    db.commit()

                    await _send(
                        websocket,
                        {
                            "type": "integrity_update",
                            "severity": severity,
                            "flags": result.get("flags") or [],
                            "notes": result.get("notes"),
                            "action": result.get("action"),
                        },
                    )

                    dq = False
                    reason = ""
                    model_action = str(result.get("action") or "none")
                    if severity >= settings.integrity_disqualify_severity:
                        dq = True
                        reason = (
                            "Your session was stopped after a high-severity integrity "
                            "signal from the live camera review."
                        )
                    elif model_action == "disqualify" and severity >= 5:
                        dq = True
                        reason = (
                            "Your session was stopped based on automated integrity review."
                        )
                    elif severity >= settings.integrity_warn_severity:
                        conn.integrity_strikes += 1
                        if conn.integrity_strikes >= settings.integrity_strikes_to_dq:
                            dq = True
                            reason = (
                                "Your session was stopped after repeated integrity warnings."
                            )
                    if dq:
                        sess.disqualified = True
                        sess.disqualify_reason = reason
                        sess.status = SessionStatus.completed.value
                        db.commit()
                        await _send(
                            websocket,
                            {"type": "disqualified", "reason": reason},
                        )
                        await websocket.close(code=4003)
                        return

                elif mtype == "start_round":
                    session_id = int(msg["session_id"])
                    round_type = str(msg["round_type"])
                    sess = (
                        db.query(InterviewSession)
                        .filter(
                            InterviewSession.id == session_id,
                            InterviewSession.user_id == user.id,
                        )
                        .first()
                    )
                    if not sess:
                        await _send(websocket, {"type": "error", "detail": "session not found"})
                        continue
                    if sess.disqualified:
                        await _send(
                            websocket,
                            {
                                "type": "error",
                                "detail": "This session is disqualified and cannot continue.",
                            },
                        )
                        continue
                    if not sess.resume_summary:
                        await _send(
                            websocket,
                            {"type": "error", "detail": "upload resume first"},
                        )
                        continue

                    db.query(InterviewRound).filter(
                        InterviewRound.session_id == sess.id,
                        InterviewRound.round_type == round_type,
                        InterviewRound.completed_at.is_(None),
                    ).delete(synchronize_session=False)

                    n = _question_count()
                    qs = generate_questions(
                        round_type,
                        sess.role_title,
                        sess.resume_summary or "",
                        n,
                    )
                    if len(qs) > n:
                        qs = qs[:n]
                    row = InterviewRound(
                        session_id=sess.id,
                        round_type=round_type,
                        questions=qs,
                        transcript=[],
                        answers=[],
                    )
                    db.add(row)
                    sess.status = SessionStatus.active.value
                    db.commit()
                    db.refresh(row)

                    conn.integrity_strikes = 0
                    nq = len(qs)
                    live = LiveRound(
                        session_id=sess.id,
                        round_type=round_type,
                        questions=list(qs),
                        db_round_id=row.id,
                        is_followup=[False] * nq,
                        main_index_at=list(range(nq)),
                        followups_used=[0] * nq,
                    )
                    await _send(
                        websocket,
                        {
                            "type": "round_started",
                            "round_type": round_type,
                            "total_questions": nq,
                            "silence_ms": settings.silence_ms_hint,
                        },
                    )
                    first = live.questions[0]
                    live.transcript.append(
                        {"role": "assistant", "text": first, "kind": "question"}
                    )
                    await _send(
                        websocket,
                        {
                            "type": "ai_message",
                            "text": first,
                            "question_index": 0,
                            "is_question": True,
                            "is_follow_up": False,
                            "total_questions": nq,
                        },
                    )

                elif mtype == "technical_snapshot":
                    if live is None:
                        continue
                    live.technical_code = str(msg.get("code") or "")
                    wb = msg.get("whiteboard")
                    if wb:
                        live.whiteboard_data_url = str(wb)[:500_000]

                elif mtype == "user_final":
                    if live is None:
                        continue
                    sess = (
                        db.query(InterviewSession)
                        .filter(InterviewSession.id == live.session_id)
                        .first()
                    )
                    if sess and sess.disqualified:
                        await _send(
                            websocket,
                            {"type": "error", "detail": "disqualified"},
                        )
                        continue

                    text = str(msg.get("text") or "").strip()
                    if not text:
                        await _send(
                            websocket,
                            {"type": "hint", "text": "I did not catch that—please answer when ready."},
                        )
                        continue

                    qidx = live.q_index
                    qtext = live.questions[qidx]
                    live.transcript.append({"role": "user", "text": text})
                    live.answers.append({"question": qtext, "answer": text})

                    main_mid = live.main_index_at[qidx]
                    follow_up_q: str | None = None
                    cap_total = _max_total_questions_per_round()
                    if (
                        len(live.questions) < cap_total
                        and not live.is_followup[qidx]
                        and main_mid < len(live.followups_used)
                        and live.followups_used[main_mid] == 0
                    ):
                        decision = await asyncio.to_thread(
                            decide_follow_up,
                            live.round_type,
                            sess.role_title,
                            sess.resume_summary or "",
                            qtext,
                            text,
                        )
                        if decision.get("use_follow_up"):
                            fq = decision.get("follow_up_question")
                            if isinstance(fq, str) and fq.strip():
                                follow_up_q = fq.strip()

                    if follow_up_q and len(live.questions) < cap_total:
                        live.questions.insert(qidx + 1, follow_up_q)
                        live.is_followup.insert(qidx + 1, True)
                        live.main_index_at.insert(qidx + 1, main_mid)
                        live.followups_used[main_mid] = 1
                        upd_row = (
                            db.query(InterviewRound)
                            .filter(InterviewRound.id == live.db_round_id)
                            .first()
                        )
                        if upd_row:
                            upd_row.questions = list(live.questions)
                            db.commit()
                        live.q_index = qidx + 1
                        live.transcript.append(
                            {
                                "role": "assistant",
                                "text": follow_up_q,
                                "kind": "follow_up",
                            }
                        )
                        await _send(
                            websocket,
                            {
                                "type": "ai_message",
                                "text": follow_up_q,
                                "question_index": live.q_index,
                                "is_question": True,
                                "is_follow_up": True,
                                "total_questions": len(live.questions),
                            },
                        )
                    elif qidx + 1 < len(live.questions):
                        live.q_index = qidx + 1
                        nxt_q = live.questions[live.q_index]
                        kind = "follow_up" if live.is_followup[live.q_index] else "question"
                        live.transcript.append(
                            {"role": "assistant", "text": nxt_q, "kind": kind}
                        )
                        await _send(
                            websocket,
                            {
                                "type": "ai_message",
                                "text": nxt_q,
                                "question_index": live.q_index,
                                "is_question": True,
                                "is_follow_up": live.is_followup[live.q_index],
                                "total_questions": len(live.questions),
                            },
                        )
                    else:
                        await _finalize_and_notify_round(
                            websocket, db, live, end_entire_session=False
                        )
                        live = None

                elif mtype == "finish_interview":
                    if live is None:
                        continue
                    sess = (
                        db.query(InterviewSession)
                        .filter(InterviewSession.id == live.session_id)
                        .first()
                    )
                    if sess and sess.disqualified:
                        await _send(
                            websocket,
                            {"type": "error", "detail": "disqualified"},
                        )
                        continue
                    partial = str(msg.get("partial_answer") or "").strip()
                    if partial and live.questions and live.q_index < len(live.questions):
                        qidx = live.q_index
                        qtext = live.questions[qidx]
                        last_a = live.answers[-1].get("answer") if live.answers else None
                        if last_a != partial:
                            live.transcript.append({"role": "user", "text": partial})
                            live.answers.append({"question": qtext, "answer": partial})
                    end_sess = bool(msg.get("end_session", True))
                    await _finalize_and_notify_round(
                        websocket, db, live, end_entire_session=end_sess
                    )
                    live = None

                elif mtype == "ping":
                    await _send(websocket, {"type": "pong"})
            finally:
                db.close()

    except WebSocketDisconnect:
        return
