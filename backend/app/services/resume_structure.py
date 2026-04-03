"""Structured resume extraction helpers + seniority/tenure inference from structured fields."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

_YEAR = re.compile(r"(19|20)\d{2}")


def _years_from_span(start_s: str | None, end_s: str | None, is_current: bool) -> tuple[float | None, float | None]:
    """Approximate start/end as year floats for duration math."""
    if not start_s:
        return None, None
    sm = _YEAR.search(str(start_s))
    start_y = float(sm.group(0)) if sm else None
    if is_current or (end_s and str(end_s).lower().strip() in ("present", "current", "now")):
        end_y = float(datetime.utcnow().year)
    else:
        em = _YEAR.search(str(end_s or ""))
        end_y = float(em.group(0)) if em else None
    return start_y, end_y


def _seniority_from_title(title: str) -> int:
    """Rough rank 0–6 for ordering (higher = more senior)."""
    t = (title or "").lower()
    if any(x in t for x in ("vp", "vice president", "cto", "cfo", "ceo", "chief ", "director")):
        return 6
    if any(x in t for x in ("principal", "distinguished", "fellow")):
        return 5
    if "staff" in t or "architect" in t:
        return 4
    if "senior" in t or "sr." in t or "sr " in t or "lead" in t:
        return 3
    if any(x in t for x in ("manager", "head of", "engineering manager", "product manager")):
        return 4
    if "junior" in t or "jr." in t or "intern" in t or "graduate" in t:
        return 1
    if "associate" in t or "mid" in t:
        return 2
    return 2


def _label_from_rank(rank: float) -> str:
    if rank <= 1.2:
        return "intern_or_entry"
    if rank <= 2.2:
        return "junior"
    if rank <= 2.9:
        return "mid_level"
    if rank <= 3.6:
        return "senior"
    if rank <= 4.8:
        return "staff_or_lead"
    return "principal_or_executive"


def infer_seniority_tenure(extracted: dict[str, Any]) -> dict[str, Any]:
    """
    Derive seniority label, estimated years in industry, and tenure notes from
    structured work_experience (no extra LLM required).
    """
    work = extracted.get("work_experience")
    if not isinstance(work, list):
        work = []

    total_years = 0.0
    role_months: list[tuple[str, float]] = []
    current_title = ""
    current_company = ""
    current_tenure_m: float | None = None

    now_y = float(datetime.utcnow().year)
    now_m = datetime.utcnow().month

    for w in work:
        if not isinstance(w, dict):
            continue
        title = str(w.get("title") or "").strip()
        company = str(w.get("company") or "").strip()
        start = w.get("start_date")
        end = w.get("end_date")
        is_cur = bool(w.get("is_current"))
        sy, ey = _years_from_span(
            str(start) if start is not None else None,
            str(end) if end is not None else None,
            is_cur,
        )
        if sy is not None and ey is not None and ey >= sy:
            yrs = ey - sy
            total_years += yrs
            role_months.append((title or company or "Role", max(yrs * 12, 0)))
        if is_cur and title:
            current_title = title
            current_company = company
            if sy is not None:
                frac = (now_m / 12.0) if ey == now_y else 0
                current_tenure_m = max(0.0, (now_y - sy) * 12 + frac)

    titles = [str(w.get("title") or "") for w in work if isinstance(w, dict)]
    ranks = [_seniority_from_title(t) for t in titles if t]
    avg_rank = sum(ranks) / len(ranks) if ranks else 2.0
    peak_rank = max(ranks) if ranks else 2.0
    blended = 0.45 * avg_rank + 0.55 * peak_rank
    seniority_label = _label_from_rank(blended)

    skills_n = len(extracted.get("skills") or []) if isinstance(extracted.get("skills"), list) else 0
    if total_years == 0 and skills_n > 8:
        total_years = min(3.0, 1.0 + skills_n * 0.15)

    notes_parts = []
    if current_title:
        cc = f" at {current_company}" if current_company else ""
        notes_parts.append(f"Most recent position: {current_title}{cc}.")
    if current_tenure_m is not None and current_tenure_m > 0:
        notes_parts.append(
            f"Approx. tenure in current role: {current_tenure_m / 12:.1f} years."
        )
    if total_years > 0:
        notes_parts.append(
            f"Approx. cumulative time in listed roles: {total_years:.1f} years "
            "(from parsed dates; gaps not modeled)."
        )
    else:
        notes_parts.append(
            "Could not infer precise tenure from dates—treat experience depth as uncertain."
        )

    return {
        "inferred_seniority": seniority_label,
        "seniority_score_hint": round(blended, 2),
        "estimated_years_professional": round(min(total_years, 45.0), 2),
        "current_role_title": current_title or None,
        "current_company": current_company or None,
        "current_role_tenure_months": round(current_tenure_m, 1) if current_tenure_m else None,
        "tenure_summary": " ".join(notes_parts),
    }


def offline_extract_stub(resume_text: str) -> dict[str, Any]:
    """Minimal structure when no LLM is configured."""
    snippet = (resume_text or "")[:800].replace("\n", " ").strip()
    return {
        "candidate_name": None,
        "headline_or_summary_one_line": None,
        "work_experience": [],
        "education": [],
        "skills": [],
        "certifications": [],
        "languages": [],
        "extraction_note": "Structured extraction requires GROQ_API_KEY; showing text snippet only.",
        "raw_text_snippet": snippet[:400],
    }


def merge_profile(extracted: dict[str, Any], inference: dict[str, Any]) -> dict[str, Any]:
    return {
        "extracted": extracted,
        "inference": inference,
        "extracted_at": datetime.utcnow().isoformat() + "Z",
    }


def format_for_llm_prompt(profile: dict[str, Any] | None) -> str:
    if not profile or not isinstance(profile, dict):
        return ""
    inf = profile.get("inference") or {}
    ex = profile.get("extracted") or {}
    lines = []
    if inf.get("inferred_seniority"):
        lines.append(f"Inferred seniority band: {inf['inferred_seniority']}.")
    if inf.get("estimated_years_professional") is not None:
        lines.append(
            f"Estimated professional span from roles: ~{inf['estimated_years_professional']} years."
        )
    if inf.get("tenure_summary"):
        lines.append(str(inf["tenure_summary"]))
    skills = ex.get("skills") if isinstance(ex.get("skills"), list) else []
    if skills:
        lines.append("Key skills: " + ", ".join(str(s) for s in skills[:25]))
    certs = ex.get("certifications") if isinstance(ex.get("certifications"), list) else []
    if certs:
        lines.append("Certifications: " + ", ".join(str(c) for c in certs[:15]))
    if not lines:
        return ""
    return "\nStructured profile signals:\n" + "\n".join(f"• {x}" for x in lines if x)
