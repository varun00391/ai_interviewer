"""Role title + resume text used for LLM interview prompts."""

from app.models import InterviewSession
from app.services.resume_structure import format_for_llm_prompt


def effective_role_title(role_title: str | None) -> str:
    t = (role_title or "").strip()
    if len(t) >= 2:
        return t
    return "Practice session (target role not specified yet)"


def resume_text_for_prompt(sess: InterviewSession) -> str:
    base = (sess.resume_summary or "").strip()
    extra = format_for_llm_prompt(sess.resume_structured)
    if extra and base:
        return base + "\n" + extra
    if extra:
        return extra
    return base or "No resume summary available."
