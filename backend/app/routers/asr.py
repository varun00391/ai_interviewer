from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.config import settings
from app.deps import require_app_unlocked
from app.models import User
from app.services.deepgram_stt import transcribe_audio_bytes

router = APIRouter(prefix="/asr", tags=["asr"])


@router.post("/transcribe")
async def transcribe_answer_audio(
    file: UploadFile = File(...),
    _: User = Depends(require_app_unlocked),
):
    if not settings.deepgram_api_key:
        raise HTTPException(
            status_code=503,
            detail="Speech-to-text service is not configured (set DEEPGRAM_API_KEY).",
        )
    data = await file.read()
    if len(data) < 200:
        raise HTTPException(status_code=400, detail="Audio too short or empty.")
    mime = file.content_type or "audio/webm"
    text = transcribe_audio_bytes(data, mime)
    return {"text": text}
