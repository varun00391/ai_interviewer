from app.services.groq_service import groq_service

_EVALUATOR_RUBRIC: dict[str, str] = {
    "hr_screening": (
        "This was an HR / screening round. Weight communication_clarity, professional_presence, and role_fit heavily; "
        "technical_knowledge only where relevant to the role. problem_solving may reflect general judgment, not algorithms."
    ),
    "technical": (
        "This was a technical round. Weight technical_knowledge and problem_solving heavily; "
        "communication_clarity for how well they explain reasoning; role_fit for alignment to the stack/role."
    ),
    "managerial": (
        "This was a managerial / leadership round. Weight professional_presence, problem_solving (judgment, prioritization), "
        "and role_fit for leadership scope; technical_knowledge only if the role requires hands-on depth."
    ),
    "general": (
        "Score all dimensions fairly for the role and round title."
    ),
}


def evaluate_round(
    *,
    job_title: str,
    round_title: str,
    round_kind: str,
    focus_areas: list[str] | None,
    transcript: str,
    integrity_summary: str,
    engagement_block: str = "",
    technical_appendix: str = "",
) -> str:
    kind = (round_kind or "general").lower()
    rubric = _EVALUATOR_RUBRIC.get(kind, _EVALUATOR_RUBRIC["general"])
    areas = focus_areas or []
    areas_line = ", ".join(areas) if areas else "n/a"

    system = (
        "You are a strict evaluation agent for a voice-based job interview. "
        f"Round rubric: {rubric}\n\n"
        "CALIBRATION — overall score must reflect substance and correctness, not politeness alone:\n"
        "- 0–18: No real answers, evasion, nonsense, or repeated “I don’t know” with no reasoning; or technical answers that are clearly wrong on the core question.\n"
        "- 19–35: Minimal engagement; mostly incorrect, off-topic, or far too shallow to assess skill.\n"
        "- 36–50: Some attempt but major gaps, wrong conclusions, or missing key ideas.\n"
        "- 51–62: Partial credit; mixed correctness; needs follow-up to trust.\n"
        "- 63–74: Adequate for level; mostly reasonable with noticeable gaps.\n"
        "- 75–87: Strong; clear reasoning and largely correct.\n"
        "- 88–100: Exceptional depth, accuracy, and communication.\n\n"
        "For technical rounds: if answers are wrong or do not address the question, technical_knowledge and problem_solving "
        "must be low (often below 40) and overall score must reflect that—do not award mid scores for fluency alone.\n\n"
        "Return plain JSON only (no markdown fences) with keys:\n"
        "- score: number 0-100 (overall; follow calibration)\n"
        "- passed: boolean (true only if score >= 58 AND the candidate meaningfully engaged with the questions)\n"
        "- answer_quality: string (one sentence: e.g. absent / weak / partial / adequate / strong)\n"
        "- strengths: string[]\n"
        "- gaps: string[]\n"
        "- rationale: string (3-5 sentences; mention correctness vs vagueness)\n"
        "- parameter_scores: object with numeric scores 0-100 each and a one-line \"note\" per key:\n"
        "  technical_knowledge, communication_clarity, problem_solving, professional_presence, role_fit\n"
        "- integrity_comment: string (how tab blur, absent face, multiple faces, or identity mismatch affected trust)\n"
        "Consider integrity signals as risk factors; do not auto-fail solely on them if answers were strong."
    )
    user = (
        f"Role: {job_title}\n"
        f"Round: {round_title}\n"
        f"Round type: {kind}\n"
        f"Declared focus areas: {areas_line}\n"
        f"{engagement_block}\n"
        f"Integrity summary:\n{integrity_summary}\n\n"
        f"{technical_appendix}\n"
        f"Transcript:\n{transcript[:16000]}"
    )
    return groq_service.complete(agent_name="EvaluatorAgent", system=system, user=user, temperature=0.15)


def cheating_assessment_llm(*, events_summary: str, transcript_excerpt: str) -> str:
    system = (
        "You assess interview integrity from behavioral signals. "
        "Return JSON: risk_level (low|medium|high), explanation (string), suggested_actions (string[]). "
        "Signals may include tab blur counts, multiple faces, low face match vs enrollment. No markdown."
    )
    user = f"Signals:\n{events_summary}\n\nTranscript excerpt:\n{transcript_excerpt[:4000]}"
    return groq_service.complete(agent_name="IntegrityAnalystAgent", system=system, user=user, temperature=0.2)
