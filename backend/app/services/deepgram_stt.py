"""Deepgram pre-recorded transcription (Nova-2)."""

from typing import Any

import httpx

from app.config import settings


def transcribe_audio_bytes(audio: bytes, mime_type: str | None = None) -> str:
    key = settings.deepgram_api_key
    if not key or not audio:
        return ""
    ct = mime_type or "audio/webm"
    url = "https://api.deepgram.com/v1/listen"
    params = {"model": "nova-2", "smart_format": "true"}
    headers = {
        "Authorization": f"Token {key}",
        "Content-Type": ct,
    }
    try:
        with httpx.Client(timeout=120.0) as client:
            r = client.post(url, params=params, headers=headers, content=audio)
            r.raise_for_status()
            data: dict[str, Any] = r.json()
    except Exception:
        return ""

    try:
        ch = (data.get("results") or {}).get("channels") or []
        if not ch:
            return ""
        alts = (ch[0].get("alternatives") or [])
        if not alts:
            return ""
        return str(alts[0].get("transcript") or "").strip()
    except (TypeError, KeyError, IndexError):
        return ""
