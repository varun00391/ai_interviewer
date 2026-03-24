from app.services.groq_service import groq_service


def plan_interview_rounds(
    *,
    resume_excerpt: str,
    job_title: str,
    num_rounds: int = 3,
) -> str:
    system = (
        "You are an interview planner agent. Output a concise JSON plan with keys: "
        "rounds (array of objects, one per round), each with: "
        "round_number (int), title (string), round_kind (string, MUST be one of: hr_screening, technical, managerial, general), "
        "focus_areas (string[] of 3-6 topics for that round), duration_minutes (int). "
        "Typical multi-round flow: round 1 hr_screening (motivation, culture, communication), "
        "round 2 technical (skills, problem-solving, depth on resume), "
        "round 3 managerial (leadership, prioritization, stakeholders) when 3+ rounds. "
        "Also include email_invite_subject, email_invite_body (plain text with placeholders {{accept_link}}, {{candidate_name}}). "
        "No markdown fences."
    )
    user = (
        f"Job title: {job_title}\n"
        f"Target number of rounds: {num_rounds}\n"
        f"Resume excerpt:\n{resume_excerpt[:8000]}\n"
    )
    return groq_service.complete(agent_name="InterviewPlannerAgent", system=system, user=user)


def parse_resume_nlp(resume_text: str) -> str:
    system = (
        "Extract structured candidate info. Return plain JSON with keys: "
        "summary (string), skills (string[]), years_experience (number|null), "
        "education_highlights (string[]). No markdown."
    )
    user = f"Resume:\n{resume_text[:12000]}"
    return groq_service.complete(agent_name="ResumeParserAgent", system=system, user=user)
