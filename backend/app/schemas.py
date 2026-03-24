from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models import InterviewStatus, InvitationStatus, RoundStatus, UserRole
from app.utils.round_kind import VALID_KINDS, normalize_round_kind


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = ""


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole

    model_config = {"from_attributes": True}


class CandidateMeOut(BaseModel):
    """GET /me — includes whether a resume is already stored (for dashboard state)."""

    id: int
    email: str
    full_name: str
    role: UserRole
    has_resume: bool


class FaceEnrollmentIn(BaseModel):
    descriptor_json: dict[str, Any]


class IntegrityEventIn(BaseModel):
    event_type: str
    payload_json: dict[str, Any] | None = None


class InterviewCreate(BaseModel):
    job_title: str = "Software Engineer"
    total_rounds: int = Field(default=3, ge=1, le=6)
    round_kinds: list[str] | None = Field(
        default=None,
        description="If set, interview has exactly these rounds in order; AI planner is skipped.",
    )

    @model_validator(mode="after")
    def _normalize_explicit_rounds(self):
        if self.round_kinds is None:
            return self
        if len(self.round_kinds) < 1:
            raise ValueError("round_kinds must include at least one round")
        if len(self.round_kinds) > 6:
            raise ValueError("round_kinds may include at most 6 rounds")
        normalized: list[str] = []
        for raw in self.round_kinds:
            k = normalize_round_kind(str(raw), "")
            if k not in VALID_KINDS:
                raise ValueError(f"Invalid round kind: {raw!r}")
            normalized.append(k)
        self.round_kinds = normalized
        self.total_rounds = len(normalized)
        return self


class InvitationCreate(BaseModel):
    email: EmailStr
    proposed_slot_utc: datetime | None = None


class ChatMessageIn(BaseModel):
    content: str = ""


class SessionEndIn(BaseModel):
    """Optional payload when ending a session (e.g. technical round workspace)."""

    technical_code_snapshot: str | None = Field(default=None, max_length=50000)
    whiteboard_was_used: bool = False


class RoundOut(BaseModel):
    id: int
    round_number: int
    title: str
    round_kind: str | None = None
    focus_areas_json: list[str] | None = None
    status: RoundStatus
    scheduled_at: datetime | None
    score: float | None
    pass_recommendation: bool | None
    scores_breakdown_json: dict[str, Any] | None = None

    model_config = {"from_attributes": True}


class InterviewOut(BaseModel):
    id: int
    job_title: str
    status: InterviewStatus
    total_rounds_planned: int
    current_round_index: int
    rounds: list[RoundOut] = []

    model_config = {"from_attributes": True}


class AdminInterviewListItem(BaseModel):
    id: int
    candidate_email: str
    candidate_name: str
    job_title: str
    status: InterviewStatus
    current_round_index: int
    created_at: datetime

    model_config = {"from_attributes": True}


class InvitationPublicOut(BaseModel):
    token: str
    status: InvitationStatus
    proposed_slot_utc: datetime | None
    email_body: str | None
    accept_url: str
