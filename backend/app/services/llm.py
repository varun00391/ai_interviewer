import json
import random
import re
from typing import Any

from openai import OpenAI

from app.config import settings


def _client() -> OpenAI | None:
    if not settings.groq_api_key:
        return None
    return OpenAI(
        api_key=settings.groq_api_key,
        base_url=settings.groq_base_url,
    )


def _chat_json(
    messages: list[dict[str, Any]],
    temperature: float = 0.3,
) -> dict[str, Any]:
    client = _client()
    if not client:
        return {}
    kwargs: dict[str, Any] = {
        "model": settings.groq_model,
        "messages": messages,
        "temperature": temperature,
    }
    try:
        r = client.chat.completions.create(
            **kwargs,
            response_format={"type": "json_object"},
        )
    except Exception:
        r = client.chat.completions.create(**kwargs)
    raw = (r.choices[0].message.content or "").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        if m:
            try:
                return json.loads(m.group())
            except json.JSONDecodeError:
                pass
    return {}


def _chat_text(
    messages: list[dict[str, Any]],
    temperature: float = 0.3,
) -> str:
    client = _client()
    if not client:
        return ""
    r = client.chat.completions.create(
        model=settings.groq_model,
        messages=messages,
        temperature=temperature,
    )
    return (r.choices[0].message.content or "").strip()


def summarize_resume(resume_text: str) -> str:
    text = resume_text[:12000]
    if not _client():
        return (
            "Summary (offline): resume received; set GROQ_API_KEY for AI summary. "
            f"Snippet: {text[:400]}..."
        )
    out = _chat_text(
        [
            {
                "role": "system",
                "content": "Summarize the resume in 5-8 bullet points for an interviewer. Plain language.",
            },
            {"role": "user", "content": text},
        ],
        temperature=0.3,
    )
    return out or (
        f"Summary (fallback): {text[:500]}..."
    )


def generate_questions(
    round_type: str,
    role_title: str,
    resume_summary: str,
    count: int,
) -> list[str]:
    if not _client():
        return _fallback_questions(round_type, role_title, count)

    system = {
        "hr": "You generate HR screening questions: culture, motivation, teamwork, communication.",
        "technical": "You generate technical interview questions tailored to the role and resume.",
        "managerial": "You generate senior/manager-style questions: leadership, trade-offs, stakeholder management, strategy.",
    }.get(round_type, "You generate interview questions.")

    prompt = f"""Role: {role_title}
Resume summary:
{resume_summary}

Generate exactly {count} distinct interview questions for a {round_type.upper()} round.
Return JSON only: {{"questions": ["...", "..."]}}"""

    data = _chat_json(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        temperature=0.5,
    )
    qs = data.get("questions") or []
    if isinstance(qs, list) and len(qs) >= count:
        return [str(q) for q in qs[:count]]
    return _fallback_questions(round_type, role_title, count)


def _fallback_questions(round_type: str, role: str, count: int) -> list[str]:
    pools = {
        "hr": [
            "Tell me about yourself and what drew you to this field.",
            "Describe a time you worked with a difficult teammate.",
            "How do you prioritize when everything feels urgent?",
            "What kind of work environment helps you do your best?",
            "Where do you see yourself professionally in two years?",
            "How do you handle constructive criticism?",
            "Why are you interested in this type of role?",
        ],
        "technical": [
            f"Walk through how you would design a small feature for a {role} role.",
            "Explain a technical challenge you solved recently and how you validated the fix.",
            "How do you approach debugging an issue you cannot reproduce locally?",
            "Compare trade-offs between speed of delivery and long-term maintainability.",
            "Describe how you test your work before release.",
            "What tools or practices help you stay productive?",
            "How would you explain a complex technical topic to a non-technical stakeholder?",
        ],
        "managerial": [
            "Tell me about a time you had to align conflicting priorities across teams.",
            "How do you measure success for a project you lead?",
            "Describe a decision you made with incomplete information.",
            "How do you coach someone who is underperforming?",
            "What is your approach to stakeholder communication?",
            "How do you handle a missed deadline?",
            "Share an example of driving change in an organization.",
        ],
    }
    base = pools.get(round_type, pools["hr"])
    random.shuffle(base)
    out: list[str] = []
    while len(out) < count:
        out.extend(base)
    return out[:count]


def score_round_answers(
    round_type: str,
    role_title: str,
    qa_pairs: list[dict[str, str]],
    technical_code: str | None,
    whiteboard_note: str | None,
) -> dict[str, Any]:
    payload = {
        "round": round_type,
        "role": role_title,
        "qa": qa_pairs,
        "code_submitted": technical_code or "",
        "whiteboard_note": whiteboard_note or "",
    }
    if not _client():
        overall = 6.5 + random.random() * 1.5
        return {
            "overall_score": round(overall, 1),
            "breakdown": {
                "relevance": 7.0,
                "clarity": 6.5,
                "depth": 6.8,
                "structure": 6.7,
                "technical_accuracy": 7.2 if round_type == "technical" else 6.5,
            },
            "improvements": [
                "Add more concrete examples with measurable outcomes.",
                "Structure behavioral answers with situation, action, result.",
                "For technical prompts, state assumptions before diving into solution.",
            ],
            "analytics": {
                "strengths": ["Clear communication tone", "Good problem framing"],
                "focus_next": ["Specific metrics", "Edge cases"],
                "estimated_readiness": "On track with practice",
            },
        }

    schema_hint = """Return JSON only:
{
  "overall_score": number 0-10,
  "breakdown": {
    "relevance": number,
    "clarity": number,
    "depth": number,
    "structure": number,
    "technical_accuracy": number
  },
  "improvements": ["string", ...],
  "analytics": {
    "strengths": ["string"],
    "focus_next": ["string"],
    "estimated_readiness": "string"
  }
}"""

    data = _chat_json(
        [
            {
                "role": "system",
                "content": "You are an expert interviewer scoring answers with rubrics: relevance, clarity, STAR structure, depth, technical accuracy when applicable.",
            },
            {
                "role": "user",
                "content": f"Score this interview round.\n{json.dumps(payload, ensure_ascii=False)[:14000]}\n\n{schema_hint}",
            },
        ],
        temperature=0.2,
    )
    if data.get("overall_score") is not None:
        return data
    return {
        "overall_score": 7.0,
        "breakdown": {
            "relevance": 7,
            "clarity": 7,
            "depth": 7,
            "structure": 7,
            "technical_accuracy": 7,
        },
        "improvements": ["Could not parse model output; retry scoring later."],
        "analytics": {"strengths": [], "focus_next": [], "estimated_readiness": "Unknown"},
    }


def score_full_interview(
    role_title: str,
    rounds_summary: list[dict[str, Any]],
) -> dict[str, Any]:
    if not _client():
        scores = [r.get("overall_score") or 7 for r in rounds_summary]
        avg = sum(scores) / max(len(scores), 1)
        return {
            "overall_score": round(avg, 1),
            "summary": "Solid performance across rounds. Keep practicing structured answers.",
            "analytics": {
                "trend": "Stable",
                "best_round": rounds_summary[0].get("round") if rounds_summary else "n/a",
                "growth_areas": ["Deeper technical examples", "Executive communication"],
            },
            "improvements": [
                "Tie answers to business impact.",
                "Prepare two STAR stories per competency.",
            ],
        }

    data = _chat_json(
        [
            {
                "role": "system",
                "content": "You synthesize multi-round interview results for a candidate.",
            },
            {
                "role": "user",
                "content": f"""Role: {role_title}
Rounds JSON:
{json.dumps(rounds_summary, ensure_ascii=False)[:12000]}

Return JSON only:
{{
  "overall_score": number 0-10,
  "summary": "2-3 sentences",
  "analytics": {{
    "trend": "string",
    "best_round": "hr|technical|managerial",
    "growth_areas": ["string"]
  }},
  "improvements": ["string"]
}}""",
            },
        ],
        temperature=0.2,
    )
    return data if data.get("overall_score") is not None else {
        "overall_score": 7.0,
        "summary": "Review individual round scores.",
        "analytics": {},
        "improvements": [],
    }
