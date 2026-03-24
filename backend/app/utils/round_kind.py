"""Normalize interview round type from planner output or round title."""

VALID_KINDS = frozenset({"hr_screening", "technical", "managerial", "general"})

_ALIASES: dict[str, str] = {
    "hr": "hr_screening",
    "hr_screening": "hr_screening",
    "screening": "hr_screening",
    "behavioral": "hr_screening",
    "culture": "hr_screening",
    "technical": "technical",
    "tech": "technical",
    "coding": "technical",
    "engineering": "technical",
    "managerial": "managerial",
    "management": "managerial",
    "manager": "managerial",
    "leadership": "managerial",
    "executive": "managerial",
    "general": "general",
}


def _infer_from_text(text: str) -> str:
    t = text.lower()
    if any(
        w in t
        for w in (
            "hr ",
            "human resource",
            "screening",
            "behavioral",
            "culture fit",
            "background check",
        )
    ):
        return "hr_screening"
    if any(
        w in t
        for w in (
            "technical",
            "coding",
            "system design",
            "algorithm",
            "engineering interview",
            "deep dive",
        )
    ):
        return "technical"
    if any(
        w in t
        for w in (
            "managerial",
            "hiring manager",
            "leadership",
            "executive",
            "director",
            "people management",
        )
    ):
        return "managerial"
    return "general"


def normalize_round_kind(raw: str | None, title: str = "") -> str:
    if raw and isinstance(raw, str):
        key = raw.strip().lower().replace(" ", "_").replace("-", "_")
        if key in _ALIASES:
            return _ALIASES[key]
        if key in VALID_KINDS:
            return key
    return _infer_from_text(f"{raw or ''} {title}")


def parse_focus_areas(value: object) -> list[str] | None:
    if value is None:
        return None
    if isinstance(value, list):
        out = [str(x).strip() for x in value if str(x).strip()]
        return out or None
    return None


def coalesce_round_fields(round_dict: dict) -> tuple[str, list[str] | None]:
    title = str(round_dict.get("title", "") or "")
    raw_kind = round_dict.get("round_kind") or round_dict.get("kind") or round_dict.get("type")
    kind = normalize_round_kind(str(raw_kind) if raw_kind else None, title)
    areas = parse_focus_areas(round_dict.get("focus_areas"))
    return kind, areas
