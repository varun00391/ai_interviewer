from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.config import settings
from app.deps import require_app_unlocked
from app.models import User
from app.services.deepgram_tts import synthesize_speech_mp3

router = APIRouter(prefix="/tts", tags=["tts"])


class TTSSpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


@router.post("/speak")
def speak_tts(
    body: TTSSpeakIn,
    _: User = Depends(require_app_unlocked),
):
    if not settings.deepgram_api_key:
        raise HTTPException(
            status_code=503,
            detail="Text-to-speech is not configured (set DEEPGRAM_API_KEY).",
        )
    audio = synthesize_speech_mp3(body.text)
    if not audio:
        raise HTTPException(
            status_code=502,
            detail="Could not generate speech. Check Deepgram account and TTS access.",
        )
    return Response(content=audio, media_type="audio/mpeg")
