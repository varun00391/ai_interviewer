import json
import re
from typing import Any

from openai import OpenAI

from app.config import settings


def _vision_client() -> OpenAI | None:
    if not settings.groq_api_key:
        return None
    return OpenAI(
        api_key=settings.groq_api_key,
        base_url=settings.groq_base_url,
    )


def analyze_interview_frame_jpeg_b64(jpeg_b64: str) -> dict[str, Any]:
    """
    Returns keys: severity (0-10), cheating_likely (bool), flags (list str), action (warn|review|disqualify|none), notes (str).
    """
    if not _vision_client() or not jpeg_b64:
        return {
            "severity": 0.0,
            "cheating_likely": False,
            "flags": [],
            "action": "none",
            "notes": "No vision API configured.",
        }

    data_url = (
        jpeg_b64
        if jpeg_b64.startswith("data:")
        else f"data:image/jpeg;base64,{jpeg_b64}"
    )

    schema = """Return JSON only:
{
  "severity": number 0-10,
  "cheating_likely": boolean,
  "flags": ["multiple_faces"|"another_person_visible"|"phone_or_notes"|"reading_off_screen"|"suspicious_gaze"|"none"],
  "action": "none"|"warn"|"review"|"disqualify",
  "notes": "one short sentence"
}
Rules: 0-2 normal single candidate facing camera; raise severity if a second person, phone, large cheat sheets, or clear whispering/helper; be conservative if unsure."""

    client = _vision_client()
    assert client is not None
    try:
        r = client.chat.completions.create(
            model=settings.groq_vision_model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "You are an integrity monitor for a live video interview. Inspect this frame.\n"
                            + schema,
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url},
                        },
                    ],
                }
            ],
            temperature=0.1,
            max_tokens=400,
        )
        raw = (r.choices[0].message.content or "").strip()
    except Exception as e:
        return {
            "severity": 0.0,
            "cheating_likely": False,
            "flags": [],
            "action": "none",
            "notes": f"Vision call failed: {e!s}"[:200],
        }

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        if m:
            try:
                return json.loads(m.group())
            except json.JSONDecodeError:
                pass
    return {
        "severity": 0.0,
        "cheating_likely": False,
        "flags": [],
        "action": "none",
        "notes": "Unparseable vision output.",
    }
