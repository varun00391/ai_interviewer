from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import require_admin
from app.models import Interview, InterviewRound, User
from app.schemas import InvitationCreate, InterviewOut
from app.services.interview_flow import create_round_invitation

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/interviews")
async def list_interviews(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    on_date: datetime | None = Query(None, description="UTC date filter (scheduled rounds)"),
) -> list[dict]:
    res = await db.execute(
        select(Interview)
        .options(selectinload(Interview.rounds), selectinload(Interview.candidate))
        .order_by(Interview.id.desc())
    )
    rows = res.scalars().unique().all()
    out = []
    for inv in rows:
        cand = inv.candidate
        out.append(
            {
                "id": inv.id,
                "candidate_email": cand.email if cand else "",
                "candidate_name": cand.full_name if cand else "",
                "job_title": inv.job_title,
                "status": inv.status.value,
                "current_round_index": inv.current_round_index,
                "created_at": inv.created_at.isoformat(),
                "rounds": [
                    {
                        "id": r.id,
                        "round_number": r.round_number,
                        "title": r.title,
                        "status": r.status.value,
                        "scheduled_at": r.scheduled_at.isoformat() if r.scheduled_at else None,
                        "score": r.score,
                        "passed": r.pass_recommendation,
                    }
                    for r in sorted(inv.rounds, key=lambda x: x.round_number)
                ],
                "has_report": bool(inv.final_report_markdown),
            }
        )
    if on_date:
        d = on_date.date()
        filtered = []
        for item in out:
            for r in item["rounds"]:
                if r["scheduled_at"]:
                    sd = datetime.fromisoformat(r["scheduled_at"].replace("Z", "+00:00")).date()
                    if sd == d:
                        filtered.append(item)
                        break
        out = filtered
    return out


@router.get("/interviews/{interview_id}", response_model=InterviewOut)
async def admin_get_interview(
    interview_id: int,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Interview:
    res = await db.execute(
        select(Interview)
        .options(selectinload(Interview.rounds))
        .where(Interview.id == interview_id)
    )
    inv = res.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Not found")
    return inv


@router.post("/interviews/{interview_id}/rounds/{round_number}/invite")
async def invite_round(
    interview_id: int,
    round_number: int,
    body: InvitationCreate,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    inv = await db.get(Interview, interview_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Interview not found")
    res = await db.execute(
        select(InterviewRound).where(
            InterviewRound.interview_id == inv.id,
            InterviewRound.round_number == round_number,
        )
    )
    rr = res.scalar_one_or_none()
    if not rr:
        raise HTTPException(status_code=404, detail="Round not found")
    invitation = await create_round_invitation(
        db,
        interview=inv,
        round_row=rr,
        to_email=str(body.email),
        proposed_slot_utc=body.proposed_slot_utc,
    )
    await db.commit()
    return {"invitation_token": invitation.token, "email": invitation.email}
