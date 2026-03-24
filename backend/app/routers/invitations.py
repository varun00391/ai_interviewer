from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import get_db
from app.models import Interview, InterviewRound, Invitation, InvitationStatus, InterviewStatus, RoundStatus

router = APIRouter(prefix="/invitations", tags=["invitations"])


@router.get("/{token}")
async def get_invitation(token: str, db: AsyncSession = Depends(get_db)) -> dict:
    res = await db.execute(select(Invitation).where(Invitation.token == token))
    inv = res.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return {
        "token": inv.token,
        "status": inv.status.value,
        "proposed_slot_utc": inv.proposed_slot_utc.isoformat() if inv.proposed_slot_utc else None,
        "email_body": inv.email_body,
        "accept_url": f"{settings.public_app_url}/invite/{token}",
    }


@router.post("/{token}/accept")
async def accept_invitation(token: str, db: AsyncSession = Depends(get_db)) -> dict:
    res = await db.execute(select(Invitation).where(Invitation.token == token))
    inv = res.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if inv.status != InvitationStatus.sent:
        raise HTTPException(status_code=400, detail="Invitation not actionable")

    inv.status = InvitationStatus.accepted
    if inv.round_id:
        rr = await db.get(InterviewRound, inv.round_id)
        if rr:
            rr.status = RoundStatus.scheduled
            rr.scheduled_at = inv.proposed_slot_utc or datetime.now(timezone.utc)
    if inv.interview_id:
        interview = await db.get(Interview, inv.interview_id)
        if interview:
            interview.status = InterviewStatus.scheduled

    await db.commit()
    return {"ok": True, "message": "Interview round scheduled. Sign in to your candidate dashboard to start."}
