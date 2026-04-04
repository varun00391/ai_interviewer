"""Deepgram Aura text-to-speech (REST)."""

import httpx

from app.config import settings


def synthesize_speech_mp3(text: str) -> bytes:
    """
    Return MP3 audio bytes. Empty if not configured or on failure.
    Docs: POST https://api.deepgram.com/v1/speak
    """
    key = settings.deepgram_api_key
    if not key:
        return b""
    t = (text or "").strip()
    if not t:
        return b""
    t = t[:8000]
    model = settings.deepgram_tts_model
    url = "https://api.deepgram.com/v1/speak"
    params = {"model": model, "encoding": "mp3"}
    headers = {
        "Authorization": f"Token {key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=120.0) as client:
            r = client.post(url, params=params, headers=headers, json={"text": t})
            if r.status_code != 200:
                return b""
            # Response body is raw audio (e.g. audio/mpeg)
            data = r.content
            if len(data) < 100:
                return b""
            return data
    except Exception:
        return b""
