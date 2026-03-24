import json
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.evaluator import evaluate_round
from app.agents.planner import plan_interview_rounds
from app.agents.reporter import final_report
from app.config import settings
from app.models import (
    FaceEnrollment,
    Interview,
    InterviewRound,
    InterviewSession,
    InterviewStatus,
    Invitation,
    InvitationStatus,
    RoundStatus,
    User,
)
from app.services.email_service import send_invitation_email
from app.utils.jsonutil import try_parse_json
from app.utils.round_kind import coalesce_round_fields

_KIND_FOCUS_AND_DURATION: dict[str, tuple[list[str], int]] = {
    "hr_screening": (
        ["motivation", "communication", "culture fit", "resume walkthrough"],
        25,
    ),
    "technical": (
        ["role-relevant skills", "problem solving", "depth on resume claims"],
        40,
    ),
    "managerial": (
        ["leadership", "prioritization", "stakeholders", "judgment"],
        35,
    ),
    "general": (["role fit", "clarity", "problem solving"], 30),
}


def _title_for_explicit_round(kind: str, job_title: str, round_index: int, total: int) -> str:
    if total == 1:
        if kind == "hr_screening":
            return f"HR & screening — {job_title}"
        if kind == "technical":
            return f"Technical interview — {job_title}"
        if kind == "managerial":
            return f"Managerial & leadership — {job_title}"
        return f"Interview — {job_title}"
    labels = {
        "hr_screening": "HR & screening",
        "technical": "Technical",
        "managerial": "Managerial & leadership",
        "general": "Assessment",
    }
    lab = labels.get(kind, "Assessment")
    return f"Round {round_index}: {lab} — {job_title}"


def plan_from_explicit_rounds(kinds: list[str], job_title: str) -> dict:
    """Build planner-shaped plan without calling the LLM (candidate-chosen rounds)."""
    total = len(kinds)
    rounds: list[dict] = []
    for i, kind in enumerate(kinds):
        rn = i + 1
        areas, duration = _KIND_FOCUS_AND_DURATION.get(
            kind, _KIND_FOCUS_AND_DURATION["general"]
        )
        rounds.append(
            {
                "round_number": rn,
                "title": _title_for_explicit_round(kind, job_title, rn, total),
                "round_kind": kind,
                "focus_areas": list(areas),
                "duration_minutes": duration,
            }
        )
    return {
        "rounds": rounds,
        "email_invite_subject": f"Interview invitation — {job_title}",
        "email_invite_body": (
            "Hi {{candidate_name}},\n\n"
            "You are invited to an interview. Proposed time: {{slot}}.\n"
            "Accept: {{accept_link}}\n\n"
            "Good luck,\nHiring Team"
        ),
    }


def default_round_plan(total: int, job_title: str) -> dict:
    templates = [
        {
            "title": f"Round 1: HR & screening — {job_title}",
            "round_kind": "hr_screening",
            "focus_areas": ["motivation", "communication", "culture fit", "resume walkthrough"],
            "duration_minutes": 25,
        },
        {
            "title": f"Round 2: Technical — {job_title}",
            "round_kind": "technical",
            "focus_areas": ["role-relevant skills", "problem solving", "depth on resume claims"],
            "duration_minutes": 40,
        },
        {
            "title": "Round 3: Managerial & leadership",
            "round_kind": "managerial",
            "focus_areas": ["leadership", "prioritization", "stakeholders", "judgment"],
            "duration_minutes": 35,
        },
    ]
    rounds = []
    for i in range(total):
        if i < len(templates):
            tpl = {**templates[i], "round_number": i + 1}
        else:
            tpl = {
                "round_number": i + 1,
                "title": f"Round {i + 1}: Additional assessment — {job_title}",
                "round_kind": "general",
                "focus_areas": ["role fit", "clarity", "problem solving"],
                "duration_minutes": 30,
            }
        rounds.append(tpl)
    return {
        "rounds": rounds,
        "email_invite_subject": f"Interview invitation — {job_title}",
        "email_invite_body": (
            "Hi {{candidate_name}},\n\n"
            "You are invited to an interview. Proposed time: {{slot}}.\n"
            "Accept: {{accept_link}}\n\n"
            "Good luck,\nHiring Team"
        ),
    }


async def build_interview_from_resume(
    db: AsyncSession,
    *,
    candidate: User,
    job_title: str,
    total_rounds: int,
    round_kinds: list[str] | None = None,
) -> Interview:
    resume = ""
    if candidate.profile:
        resume = candidate.profile.resume_text or ""

    if round_kinds:
        plan = plan_from_explicit_rounds(round_kinds, job_title)
        total_rounds = len(round_kinds)
        rounds_data = plan["rounds"]
    else:
        plan_raw = plan_interview_rounds(
            resume_excerpt=resume or "No resume on file.",
            job_title=job_title,
            num_rounds=total_rounds,
        )
        plan = try_parse_json(plan_raw) or default_round_plan(total_rounds, job_title)
        if not isinstance(plan, dict):
            plan = default_round_plan(total_rounds, job_title)
        rounds_data = plan.get("rounds")
        if not isinstance(rounds_data, list) or not rounds_data:
            plan = default_round_plan(total_rounds, job_title)
            rounds_data = plan["rounds"]

    interview = Interview(
        candidate_id=candidate.id,
        job_title=job_title,
        status=InterviewStatus.draft,
        total_rounds_planned=total_rounds,
        current_round_index=1,
        planner_plan_json=plan if isinstance(plan, dict) else None,
    )
    db.add(interview)
    await db.flush()

    for r in rounds_data[:total_rounds]:
        if not isinstance(r, dict):
            continue
        num = int(r.get("round_number", 0)) or len(interview.rounds) + 1
        title = str(r.get("title", f"Round {num}"))
        kind, areas = coalesce_round_fields({**r, "title": title})
        ir = InterviewRound(
            interview_id=interview.id,
            round_number=num,
            title=title,
            round_kind=kind,
            focus_areas_json=areas,
            status=RoundStatus.pending,
        )
        db.add(ir)

    await db.commit()
    await db.refresh(interview)
    return interview


def _invite_body_from_plan(plan: dict | None, accept_link: str, candidate_name: str, slot: str) -> tuple[str, str]:
    subject = f"Interview invitation"
    body = (
        f"Hi {candidate_name},\n\n"
        f"Please join your interview using this link:\n{accept_link}\n\n"
        f"Proposed slot (UTC): {slot}\n"
    )
    if plan and isinstance(plan, dict):
        subject = str(plan.get("email_invite_subject") or subject)
        tpl = plan.get("email_invite_body")
        if isinstance(tpl, str):
            body = (
                tpl.replace("{{accept_link}}", accept_link)
                .replace("{{candidate_name}}", candidate_name)
                .replace("{{slot}}", slot)
            )
    return subject, body


async def create_round_invitation(
    db: AsyncSession,
    *,
    interview: Interview,
    round_row: InterviewRound,
    to_email: str,
    proposed_slot_utc: datetime | None,
) -> Invitation:
    token = secrets.token_urlsafe(32)
    slot = (
        proposed_slot_utc.astimezone(timezone.utc).isoformat()
        if proposed_slot_utc
        else (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    )
    accept_link = f"{settings.public_app_url}/invite/{token}"
    cand = await db.get(User, interview.candidate_id)
    name = cand.full_name if cand else "Candidate"
    subject, body = _invite_body_from_plan(interview.planner_plan_json, accept_link, name, slot)
    inv = Invitation(
        token=token,
        email=to_email,
        interview_id=interview.id,
        round_id=round_row.id,
        status=InvitationStatus.sent,
        proposed_slot_utc=proposed_slot_utc,
        email_body=body,
    )
    db.add(inv)
    interview.status = InterviewStatus.invited
    await db.flush()
    await db.refresh(inv)
    send_invitation_email(to_email, subject, body)
    return inv


async def summarize_integrity(db: AsyncSession, session_id: int) -> str:
    from app.models import IntegrityEvent

    res = await db.execute(select(IntegrityEvent).where(IntegrityEvent.session_id == session_id))
    events = res.scalars().all()
    counts: dict[str, int] = {}
    for e in events:
        counts[e.event_type] = counts.get(e.event_type, 0) + 1
    return json.dumps({"event_counts": counts, "total": len(events)})


def _engagement_from_transcript(transcript: list | None) -> dict[str, int]:
    cand_contents: list[str] = []
    for m in transcript or []:
        if not isinstance(m, dict):
            continue
        if str(m.get("role", "")).lower() != "candidate":
            continue
        c = str(m.get("content", "")).strip()
        if c:
            cand_contents.append(c)
    fillers = frozenset(
        {
            "yes",
            "yeah",
            "yep",
            "no",
            "nope",
            "ok",
            "okay",
            "sure",
            "hi",
            "hello",
            "i don't know",
            "idk",
            "skip",
            "nothing",
        }
    )
    substantive: list[str] = []
    for c in cand_contents:
        low = c.lower().strip(" .!?")
        if len(c) >= 14 and low not in fillers:
            substantive.append(c)
    return {
        "candidate_turns": len(cand_contents),
        "substantive_turns": len(substantive),
        "total_candidate_chars": sum(len(x) for x in cand_contents),
    }


def _engagement_prompt_block(stats: dict[str, int]) -> str:
    return (
        "AUTOMATED TRANSCRIPT METRICS (cross-check with the transcript):\n"
        f"- candidate_message_turns: {stats['candidate_turns']}\n"
        f"- substantive_answer_turns: {stats['substantive_turns']} "
        "(non-trivial text, excluding bare yes/no / filler)\n"
        f"- total_candidate_chars: {stats['total_candidate_chars']}\n"
        "If substantive_answer_turns is 0, overall score must be at most ~20 unless the transcript clearly has long "
        "candidate answers that were fragmented across messages (rare).\n"
    )


def _apply_engagement_cap(
    score: float | None,
    stats: dict[str, int],
) -> tuple[float | None, str | None]:
    if score is None:
        return None, None
    s = float(score)
    st = stats["substantive_turns"]
    tc = stats["total_candidate_chars"]
    cap: float | None = None
    if st == 0:
        cap = 18.0
    elif st == 1 and tc < 45:
        cap = 24.0
    elif st <= 1 and tc < 100:
        cap = 32.0
    elif st < 2 and tc < 200:
        cap = 44.0
    elif st < 3 and tc < 450:
        cap = 58.0
    if cap is not None and s > cap:
        return cap, f"Engagement ceiling applied ({cap:.0f}): few substantive candidate responses."
    return s, None


def _technical_eval_appendix(
    *,
    round_kind: str | None,
    technical_code_snapshot: str | None,
    whiteboard_was_used: bool,
) -> str:
    if (round_kind or "").lower() != "technical":
        return ""
    chunks: list[str] = []
    code = (technical_code_snapshot or "").strip()
    if code:
        chunks.append(
            "--- Candidate code editor snapshot (end of session; compare with what they explained aloud) ---\n"
            f"{code[:12000]}"
        )
    wb_line = (
        "The candidate drew on the on-screen whiteboard at least once."
        if whiteboard_was_used
        else "Whiteboard: no drawing activity was recorded for this session."
    )
    chunks.append(
        "--- Whiteboard ---\n"
        f"{wb_line} Strokes are not sent as images to this evaluator—only this flag and the voice transcript "
        f"describe diagrams.\n"
    )
    return "\n\n".join(chunks)


async def finalize_session(
    db: AsyncSession,
    *,
    session: InterviewSession,
    job_title: str,
    round_row: InterviewRound,
    technical_code_snapshot: str | None = None,
    whiteboard_was_used: bool = False,
) -> InterviewRound:
    transcript = session.transcript_json or []
    text = "\n".join(f"{m.get('role','?')}: {m.get('content','')}" for m in transcript if isinstance(m, dict))
    integrity_summary = await summarize_integrity(db, session.id)
    engagement_stats = _engagement_from_transcript(transcript if isinstance(transcript, list) else [])
    engagement_block = _engagement_prompt_block(engagement_stats)
    technical_appendix = _technical_eval_appendix(
        round_kind=round_row.round_kind,
        technical_code_snapshot=technical_code_snapshot,
        whiteboard_was_used=whiteboard_was_used,
    )

    eval_raw = evaluate_round(
        job_title=job_title,
        round_title=round_row.title,
        round_kind=round_row.round_kind or "general",
        focus_areas=round_row.focus_areas_json,
        transcript=text,
        integrity_summary=integrity_summary,
        engagement_block=engagement_block,
        technical_appendix=technical_appendix,
    )
    parsed = try_parse_json(eval_raw) or {}
    score = float(parsed.get("score", 0)) if isinstance(parsed.get("score"), (int, float)) else None
    score, cap_note = _apply_engagement_cap(score, engagement_stats)
    if cap_note:
        parsed["score"] = score

    passed = bool(parsed.get("passed")) if "passed" in parsed else (score is not None and score >= 58)
    if score is not None and score < 58:
        passed = False
    if cap_note:
        passed = False

    rationale = str(parsed.get("rationale", ""))
    breakdown = {
        "parameter_scores": parsed.get("parameter_scores"),
        "integrity_comment": parsed.get("integrity_comment"),
        "strengths": parsed.get("strengths"),
        "gaps": parsed.get("gaps"),
        "answer_quality": parsed.get("answer_quality"),
        "overall_rationale": rationale,
        "engagement_stats": engagement_stats,
        "calibration_note": cap_note,
    }

    round_row.score = score
    round_row.pass_recommendation = passed
    round_row.evaluator_notes = rationale
    round_row.scores_breakdown_json = breakdown
    round_row.status = RoundStatus.passed if passed else RoundStatus.failed
    session.ended_at = datetime.now(timezone.utc)

    interview = await db.get(Interview, round_row.interview_id)
    if interview:
        if passed:
            next_num = round_row.round_number + 1
            nxt = await db.execute(
                select(InterviewRound).where(
                    InterviewRound.interview_id == interview.id,
                    InterviewRound.round_number == next_num,
                )
            )
            next_round = nxt.scalar_one_or_none()
            if next_round:
                interview.current_round_index = next_num
                interview.status = InterviewStatus.scheduled
                now = datetime.now(timezone.utc)
                next_round.status = RoundStatus.scheduled
                next_round.scheduled_at = now
                await db.flush()
            else:
                interview.status = InterviewStatus.completed
                await generate_final_report(db, interview=interview)
        else:
            interview.status = InterviewStatus.rejected

    await db.commit()
    await db.refresh(round_row)
    return round_row


async def generate_final_report(db: AsyncSession, *, interview: Interview) -> None:
    await db.refresh(interview, attribute_names=["rounds"])
    rounds_summary = [
        {
            "round": r.round_number,
            "title": r.title,
            "round_kind": r.round_kind,
            "focus_areas": r.focus_areas_json,
            "status": r.status.value,
            "score": r.score,
            "passed": r.pass_recommendation,
            "scores_breakdown": r.scores_breakdown_json,
        }
        for r in sorted(interview.rounds, key=lambda x: x.round_number)
    ]
    report = final_report(
        job_title=interview.job_title,
        rounds_summary=json.dumps(rounds_summary),
        per_round_evaluations=json.dumps(rounds_summary),
    )
    interview.final_report_markdown = report
    await db.flush()
