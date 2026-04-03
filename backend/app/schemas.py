from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str | None = None
    username: str | None = Field(default=None, max_length=80)
    subscription_plan: str = Field(
        default="free",
        pattern="^(free|standard|enterprise)$",
    )


class UserMeOut(BaseModel):
    id: int
    email: str
    username: str | None
    is_admin: bool
    full_name: str | None
    created_at: datetime
    subscription_tier: str
    subscription_tier_stored: str
    subscription_starts_at: datetime | None
    subscription_ends_at: datetime | None
    interviews_total: int
    interviews_today: int
    interviews_total_limit: int | None
    interviews_daily_limit: int | None
    app_access_blocked: bool
    app_access_message: str | None


class SubscriptionActivate(BaseModel):
    tier: str = Field(pattern="^(standard|enterprise)$")


class UserOut(BaseModel):
    id: int
    email: str
    is_admin: bool
    full_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SessionCreate(BaseModel):
    role_title: str = Field(default="Practice session", max_length=512)
    flow_type: str = Field(default="full", pattern="^(full|single)$")
    single_round_type: str | None = None


class SessionUpdate(BaseModel):
    role_title: str | None = Field(default=None, min_length=2, max_length=512)
    mode: str | None = Field(default=None, pattern="^(full|per_round)$")
    flow_type: str | None = Field(default=None, pattern="^(full|single)$")
    single_round_type: str | None = None


class SessionOut(BaseModel):
    id: int
    user_id: int
    role_title: str
    resume_summary: str | None
    mode: str
    flow_type: str | None = None
    single_round_type: str | None = None
    status: str
    disqualified: bool | None = None
    disqualify_reason: str | None = None
    integrity_score: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RoundOut(BaseModel):
    id: int
    session_id: int
    round_type: str
    score_overall: float | None
    score_breakdown: dict[str, Any] | None
    improvements: list[str] | None
    analytics: dict[str, Any] | None
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class AdminUserSummary(BaseModel):
    id: int
    email: str
    username: str | None
    password_storage: str
    full_name: str | None
    is_admin: bool
    created_at: datetime
    session_count: int
    subscription_tier: str
    subscription_tier_stored: str | None
    subscription_starts_at: datetime | None
    subscription_ends_at: datetime | None

    model_config = {"from_attributes": True}


class AdminMetrics(BaseModel):
    total_users: int
    total_sessions: int
    completed_sessions: int
    rounds_completed: int
    avg_round_score: float | None
