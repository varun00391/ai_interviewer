from app.services.groq_service import groq_service


def final_report(
    *,
    job_title: str,
    rounds_summary: str,
    per_round_evaluations: str,
) -> str:
    system = (
        "Write a professional hiring report in Markdown for recruiters. "
        "Include: Executive summary, Per-round summary, Skill gaps, "
        "Integrity / identity notes, and Hire recommendation (strong yes / yes / no / strong no) with reasoning."
    )
    user = (
        f"Job: {job_title}\n\nRounds summary:\n{rounds_summary}\n\n"
        f"Evaluations JSON/text:\n{per_round_evaluations[:20000]}"
    )
    return groq_service.complete(agent_name="ReportAgent", system=system, user=user, temperature=0.3)
