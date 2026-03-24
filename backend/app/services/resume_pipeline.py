from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.planner import parse_resume_nlp
from app.models import CandidateProfile, User
from app.utils.jsonutil import try_parse_json


async def save_and_parse_resume(db: AsyncSession, user: User, resume_text: str) -> dict:
    await db.refresh(user, attribute_names=["profile"])
    parsed_raw = parse_resume_nlp(resume_text)
    data = try_parse_json(parsed_raw) if parsed_raw else None
    skills = None
    summary = parsed_raw
    if isinstance(data, dict):
        summary = str(data.get("summary") or summary)
        skills = data.get("skills")
    prof = user.profile
    if not prof:
        prof = CandidateProfile(
            user_id=user.id,
            resume_text=resume_text,
            parsed_summary=summary,
            skills_json=skills if isinstance(skills, list) else None,
        )
        db.add(prof)
    else:
        prof.resume_text = resume_text
        prof.parsed_summary = summary
        prof.skills_json = skills if isinstance(skills, list) else prof.skills_json
    await db.commit()
    return {"ok": True, "parsed_preview": (summary or "")[:500], "chars_extracted": len(resume_text)}
