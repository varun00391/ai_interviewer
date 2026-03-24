import math
from typing import Any


def _as_float_list(d: dict[str, Any], key: str = "embedding") -> list[float] | None:
    raw = d.get(key) or d.get("descriptor")
    if isinstance(raw, list) and raw and all(isinstance(x, (int, float)) for x in raw):
        return [float(x) for x in raw]
    return None


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def face_match_score(enrollment_descriptor: dict[str, Any], live_descriptor: dict[str, Any]) -> float:
    a = _as_float_list(enrollment_descriptor)
    b = _as_float_list(live_descriptor)
    if not a or not b:
        return 0.0
    sim = cosine_similarity(a, b)
    return max(0.0, min(1.0, (sim + 1) / 2))
