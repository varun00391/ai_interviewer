import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InterviewMode(str, enum.Enum):
    full = "full"
    per_round = "per_round"


class RoundType(str, enum.Enum):
    hr = "hr"
    technical = "technical"
    managerial = "managerial"


class SessionStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    completed = "completed"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subscription_tier: Mapped[str] = mapped_column(String(32), default="free")
    subscription_starts_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    subscription_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sessions: Mapped[list["InterviewSession"]] = relationship(back_populates="user")


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    role_title: Mapped[str] = mapped_column(String(512))
    resume_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    resume_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    resume_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    mode: Mapped[str] = mapped_column(String(32), default=InterviewMode.full.value)
    flow_type: Mapped[str] = mapped_column(String(16), default="full")
    single_round_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default=SessionStatus.draft.value)
    disqualified: Mapped[bool] = mapped_column(Boolean, default=False)
    disqualify_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    integrity_score: Mapped[float] = mapped_column(Float, default=0.0)
    integrity_events: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped["User"] = relationship(back_populates="sessions")
    rounds: Mapped[list["InterviewRound"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class InterviewRound(Base):
    __tablename__ = "interview_rounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"))
    round_type: Mapped[str] = mapped_column(String(32))
    questions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    transcript: Mapped[list | None] = mapped_column(JSON, default=list)
    answers: Mapped[list | None] = mapped_column(JSON, default=list)
    score_overall: Mapped[float | None] = mapped_column(nullable=True)
    score_breakdown: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    improvements: Mapped[list | None] = mapped_column(JSON, nullable=True)
    analytics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    technical_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    whiteboard_data_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    session: Mapped["InterviewSession"] = relationship(back_populates="rounds")
