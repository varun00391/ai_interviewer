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


def extract_resume_structure(resume_text: str) -> dict[str, Any]:
    """LLM JSON extraction: employers, roles, dates, education, skills, certs."""
    from app.services.resume_structure import offline_extract_stub

    text = (resume_text or "")[:14000]
    if not _client():
        return offline_extract_stub(text)

    schema = """Return JSON only with this shape:
{
  "candidate_name": string | null,
  "headline_or_summary_one_line": string | null,
  "work_experience": [
    {
      "company": string,
      "title": string,
      "location": string | null,
      "start_date": string | null,
      "end_date": string | null,
      "is_current": boolean,
      "highlights": string[]
    }
  ],
  "education": [
    { "institution": string, "degree": string | null, "field": string | null, "end_year": number | null }
  ],
  "skills": string[],
  "certifications": string[],
  "languages": string[]
}
Use ISO-like dates when possible (YYYY-MM). is_current true only for present role."""

    data = _chat_json(
        [
            {
                "role": "system",
                "content": "You extract structured resume facts. Be conservative; use null if unknown.",
            },
            {"role": "user", "content": f"Resume text:\n\n{text}\n\n{schema}"},
        ],
        temperature=0.1,
    )
    if not data or not isinstance(data, dict):
        return offline_extract_stub(text)
    for key in ("work_experience", "education", "skills", "certifications", "languages"):
        if not isinstance(data.get(key), list):
            data[key] = []
    return data


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


def _default_follow_up_question(round_type: str, question_asked: str) -> str:
    _ = round_type
    q = (question_asked or "").strip()[:120]
    tail = f' Regarding "{q}",' if q else ""
    return (
        f"{tail} could you give one concrete example—with what you did, a challenge you hit, "
        "and a measurable or clear outcome?"
    ).strip()


def decide_follow_up(
    round_type: str,
    role_title: str,
    resume_summary: str,
    question_text: str,
    answer_text: str,
) -> dict[str, Any]:
    """After a main (non–follow-up) answer, decide whether to ask one clarifying follow-up."""
    ans = (answer_text or "").strip()
    if len(ans) < 28:
        return {
            "use_follow_up": True,
            "follow_up_question": _default_follow_up_question(round_type, question_text),
        }

    vague_markers = (
        "maybe ",
        "not sure",
        "i think ",
        "kind of",
        "sort of",
        "probably ",
        "i guess",
        "hard to say",
    )
    low = ans.lower()
    looks_vague = any(m in low for m in vague_markers)
    if looks_vague and len(ans) < 160:
        return {
            "use_follow_up": True,
            "follow_up_question": _default_follow_up_question(round_type, question_text),
        }

    if not _client():
        if len(ans) < 90:
            return {
                "use_follow_up": True,
                "follow_up_question": _default_follow_up_question(round_type, question_text),
            }
        return {"use_follow_up": False, "follow_up_question": None}

    schema = """Return JSON only:
{
  "use_follow_up": boolean,
  "follow_up_question": "string or null — one short question only if use_follow_up is true"
}
Rules: The round is capped at a small number of questions total—avoid extra questions unless truly needed.
Ask at most one follow-up per main question. Prefer use_follow_up false unless the answer is clearly thin, generic, or missing specifics. If the answer is adequate, set use_follow_up false and follow_up_question null."""

    data = _chat_json(
        [
            {
                "role": "system",
                "content": "You are an expert interviewer. Decide if a brief follow-up would materially improve signal.",
            },
            {
                "role": "user",
                "content": f"""Round type: {round_type}
Role: {role_title}
Resume summary (context):
{(resume_summary or "")[:4000]}

Main question:
{question_text}

Candidate answer:
{ans[:6000]}

{schema}""",
            },
        ],
        temperature=0.2,
    )
    use_fu = bool(data.get("use_follow_up"))
    fq = data.get("follow_up_question")
    fq_s = str(fq).strip() if fq else ""
    if use_fu and not fq_s:
        fq_s = _default_follow_up_question(round_type, question_text)
    if not use_fu:
        fq_s = ""
    return {"use_follow_up": bool(use_fu and fq_s), "follow_up_question": fq_s or None}


def _normalize_hire_verdict(raw: str | None) -> str:
    x = (raw or "").lower().replace(" ", "_").replace("-", "_")
    if x in ("hire", "yes", "strong_hire", "stronghire", "recommended"):
        return "hire"
    if x in ("no_hire", "nohire", "no", "reject", "not_recommended", "notrecommended"):
        return "no_hire"
    return "borderline"


def score_round_answers(
    round_type: str,
    role_title: str,
    qa_pairs: list[dict[str, str]],
    technical_code: str | None,
    whiteboard_note: str | None,
) -> dict[str, Any]:
    if not qa_pairs:
        z = {
            "relevance": 0.0,
            "clarity": 0.0,
            "depth": 0.0,
            "structure": 0.0,
            "technical_accuracy": 0.0,
        }
        return {
            "overall_score": 0.0,
            "breakdown": z,
            "improvements": [
                "No answers were captured for this round before it ended.",
                "Next time, respond to at least one question (voice or text) before finishing.",
            ],
            "analytics": {
                "strengths": [],
                "focus_next": ["Submit answers so scoring can reflect your performance"],
                "estimated_readiness": "Insufficient data",
            },
        }

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
        scores = [float(r.get("overall_score") or 7) for r in rounds_summary]
        avg = sum(scores) / max(len(scores), 1)
        if avg >= 7.8:
            verdict, conf = "hire", min(0.92, 0.55 + (avg - 7) * 0.08)
        elif avg <= 5.8:
            verdict, conf = "no_hire", min(0.9, 0.55 + (7 - avg) * 0.08)
        else:
            verdict, conf = "borderline", 0.55
        return {
            "overall_score": round(avg, 1),
            "summary": "Solid performance across rounds. Keep practicing structured answers.",
            "hire_recommendation": {
                "verdict": verdict,
                "confidence": round(conf, 2),
                "rationale": (
                    f"Practice-mode synthesis from average round score ({avg:.1f}/10). "
                    "This is illustrative only—not a substitute for human hiring decisions."
                ),
            },
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
                "content": (
                    "You synthesize multi-round interview results for hiring stakeholders. "
                    "Be fair and evidence-based; note this is AI-assisted practice, not a legal hiring decision."
                ),
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
  "hire_recommendation": {{
    "verdict": "hire" | "no_hire" | "borderline",
    "confidence": number 0-1,
    "rationale": "2-4 sentences for a hiring manager: why this verdict, key strengths/risks, and what would change your mind."
  }},
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
    if data.get("overall_score") is None:
        return {
            "overall_score": 7.0,
            "summary": "Review individual round scores.",
            "hire_recommendation": {
                "verdict": "borderline",
                "confidence": 0.5,
                "rationale": "Insufficient data to complete synthesis.",
            },
            "analytics": {},
            "improvements": [],
        }

    hr = data.get("hire_recommendation")
    if not isinstance(hr, dict):
        avg = float(data.get("overall_score") or 7)
        if avg >= 7.5:
            v = "hire"
        elif avg <= 6.0:
            v = "no_hire"
        else:
            v = "borderline"
        data["hire_recommendation"] = {
            "verdict": v,
            "confidence": 0.55,
            "rationale": data.get("summary") or "See summary above.",
        }
    else:
        hr["verdict"] = _normalize_hire_verdict(hr.get("verdict"))
        try:
            c = float(hr.get("confidence", 0.6))
        except (TypeError, ValueError):
            c = 0.6
        hr["confidence"] = max(0.0, min(1.0, c))
        hr["rationale"] = str(hr.get("rationale") or "").strip() or (
            str(data.get("summary") or "See overall summary.")
        )
        data["hire_recommendation"] = hr
    return data
