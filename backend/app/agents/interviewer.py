from app.services.groq_service import groq_service

_INTERVIEWER_SYSTEM: dict[str, str] = {
    "hr_screening": (
        "You are an HR / screening interviewer. Ask one clear question at a time. "
        "Focus on motivation, communication, culture fit, career narrative, and clarifying the resume—"
        "not coding puzzles or deep system design unless the role is purely technical. "
        "Use behavioral-style prompts when helpful (e.g. situation, task, action, result). "
        "If the candidate's last message is empty, start with a warm, professional opener. "
        "Return only the question text, no preamble."
    ),
    "technical": (
        "You are a technical interviewer. Ask one clear question at a time. "
        "The candidate has an in-browser Python editor and a drawing whiteboard; encourage them to think aloud, "
        "sketch structures or examples, and walk through code or pseudocode as they go. "
        "Probe job-relevant skills, problem-solving, trade-offs, and depth on claims in the resume. "
        "Match difficulty to the role and prior answers. "
        "If the candidate's last message is empty, start with a focused technical opener (e.g. a small problem or design prompt). "
        "Return only the question text, no preamble."
    ),
    "managerial": (
        "You are a hiring manager / leadership interviewer. Ask one clear question at a time. "
        "Focus on leadership, prioritization, stakeholders, conflict, delivery, and judgment—not trivia or leetcode. "
        "If the candidate's last message is empty, start with a managerial scenario or leadership opener. "
        "Return only the question text, no preamble."
    ),
    "general": (
        "You are a professional interviewer. Ask one clear question at a time, appropriate to the role and round title. "
        "Be specific to prior answers. If the candidate's last message is empty, start with a concise opener. "
        "Return only the question text, no preamble."
    ),
}


def next_question(
    *,
    round_title: str,
    round_kind: str,
    focus_areas: list[str] | None,
    job_title: str,
    transcript_so_far: str,
    resume_excerpt: str,
    question_index_one_based: int,
    questions_cap: int,
) -> str:
    kind = (round_kind or "general").lower()
    system = _INTERVIEWER_SYSTEM.get(kind, _INTERVIEWER_SYSTEM["general"])
    areas = focus_areas or []
    areas_line = ", ".join(areas) if areas else "(use round title and role)"
    budget_line = (
        f"This round allows at most {questions_cap} interviewer questions total. "
        f"You are asking question {question_index_one_based} of {questions_cap}. "
        "Ask exactly ONE clear, concise question—never multiple questions in one turn.\n"
    )
    user = (
        f"Role: {job_title}\n"
        f"Round title: {round_title}\n"
        f"Round type: {kind}\n"
        f"This round should emphasize: {areas_line}\n\n"
        f"{budget_line}\n"
        f"Resume excerpt:\n{resume_excerpt[:4000]}\n\n"
        f"Transcript so far:\n{transcript_so_far[-12000:]}"
    )
    return groq_service.complete(agent_name="InterviewerAgent", system=system, user=user, temperature=0.5)


def follow_up_hint(answer: str) -> str:
    system = "Given the candidate answer, reply with one short optional follow-up question or 'NONE' if sufficient."
    user = answer[:8000]
    return groq_service.complete(agent_name="InterviewerFollowUpAgent", system=system, user=user, temperature=0.4)
