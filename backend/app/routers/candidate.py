import io
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import FaceEnrollment, User
from app.schemas import CandidateMeOut, FaceEnrollmentIn
from app.services.resume_extract import extract_resume_text
from app.services.resume_pipeline import save_and_parse_resume

router = APIRouter(prefix="/me", tags=["candidate"])
logger = logging.getLogger(__name__)

ALLOWED_RESUME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

MAX_RESUME_BYTES = 8 * 1024 * 1024


@router.get("", response_model=CandidateMeOut)
async def me(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CandidateMeOut:
    await db.refresh(user, attribute_names=["profile"])
    return CandidateMeOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        has_resume=bool(user.profile and (user.profile.resume_text or "").strip()),
    )


@router.post("/resume/file")
async def upload_resume_file(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    fn = file.filename.lower()
    ok_ext = fn.endswith(".pdf") or fn.endswith(".docx")
    ct = (file.content_type or "").split(";")[0].strip().lower()
    if not ok_ext and ct not in ALLOWED_RESUME_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Upload a PDF or Word (.docx) file only.",
        )
    try:
        raw = await file.read()
        if len(raw) > MAX_RESUME_BYTES:
            raise HTTPException(status_code=413, detail="Resume file too large (max 8 MB).")
        text = extract_resume_text(filename=file.filename, fileobj=io.BytesIO(raw))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error during resume file upload")
        raise HTTPException(
            status_code=400,
            detail="Could not process this file. Try another PDF or a valid .docx export from Word.",
        ) from e
    try:
        return await save_and_parse_resume(db, user, text)
    except Exception as e:
        logger.exception("save_and_parse_resume failed")
        raise HTTPException(
            status_code=500,
            detail="Resume was read but saving or AI parsing failed. Check GROQ_API_KEY and server logs.",
        ) from e


@router.post("/face-enrollment")
async def enroll_face(
    body: FaceEnrollmentIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    await db.refresh(user, attribute_names=["face_enrollment"])
    existing = user.face_enrollment
    if existing:
        existing.descriptor_json = body.descriptor_json
    else:
        db.add(FaceEnrollment(user_id=user.id, descriptor_json=body.descriptor_json))
    await db.commit()
    return {"ok": True, "note": "Face embedding stored for identity checks during interview."}
