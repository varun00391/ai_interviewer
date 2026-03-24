import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    candidate = "candidate"


class InterviewStatus(str, enum.Enum):
    draft = "draft"
    invited = "invited"
    scheduled = "scheduled"
    in_progress = "in_progress"
    completed = "completed"
    rejected = "rejected"


class RoundStatus(str, enum.Enum):
    pending = "pending"
    scheduled = "scheduled"
    in_progress = "in_progress"
    passed = "passed"
    failed = "failed"
    skipped = "skipped"


class InvitationStatus(str, enum.Enum):
    sent = "sent"
    accepted = "accepted"
    declined = "declined"
    expired = "expired"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255), default="")
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.candidate)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    profile: Mapped["CandidateProfile | None"] = relationship(back_populates="user", uselist=False)
    interviews: Mapped[list["Interview"]] = relationship(back_populates="candidate")
    face_enrollment: Mapped["FaceEnrollment | None"] = relationship(
        back_populates="user", uselist=False
    )


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    resume_text: Mapped[str] = mapped_column(Text, default="")
    parsed_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    skills_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="profile")


class FaceEnrollment(Base):
    """Reference face descriptor from onboarding (client computes; server stores for comparison)."""

    __tablename__ = "face_enrollments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    descriptor_json: Mapped[dict] = mapped_column(JSON)
    enrolled_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="face_enrollment")


class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    job_title: Mapped[str] = mapped_column(String(255), default="General")
    status: Mapped[InterviewStatus] = mapped_column(Enum(InterviewStatus), default=InterviewStatus.draft)
    total_rounds_planned: Mapped[int] = mapped_column(Integer, default=3)
    current_round_index: Mapped[int] = mapped_column(Integer, default=1)
    planner_plan_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    final_report_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    candidate: Mapped["User"] = relationship(back_populates="interviews")
    rounds: Mapped[list["InterviewRound"]] = relationship(
        back_populates="interview", order_by="InterviewRound.round_number"
    )
    invitations: Mapped[list["Invitation"]] = relationship(back_populates="interview")


class InterviewRound(Base):
    __tablename__ = "interview_rounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.id"), index=True)
    round_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255), default="")
    round_kind: Mapped[str] = mapped_column(String(32), default="general")
    focus_areas_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    status: Mapped[RoundStatus] = mapped_column(Enum(RoundStatus), default=RoundStatus.pending)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    evaluator_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    pass_recommendation: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    scores_breakdown_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    interview: Mapped["Interview"] = relationship(back_populates="rounds")
    sessions: Mapped[list["InterviewSession"]] = relationship(back_populates="round")


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    round_id: Mapped[int] = mapped_column(ForeignKey("interview_rounds.id"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    transcript_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    integrity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    identity_match_avg: Mapped[float | None] = mapped_column(Float, nullable=True)

    round: Mapped["InterviewRound"] = relationship(back_populates="sessions")
    integrity_events: Mapped[list["IntegrityEvent"]] = relationship(back_populates="session")


class IntegrityEvent(Base):
    __tablename__ = "integrity_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(64))
    payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["InterviewSession"] = relationship(back_populates="integrity_events")


class Invitation(Base):
    __tablename__ = "invitations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    interview_id: Mapped[int | None] = mapped_column(ForeignKey("interviews.id"), nullable=True)
    round_id: Mapped[int | None] = mapped_column(ForeignKey("interview_rounds.id"), nullable=True)
    status: Mapped[InvitationStatus] = mapped_column(Enum(InvitationStatus), default=InvitationStatus.sent)
    proposed_slot_utc: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    email_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    interview: Mapped["Interview | None"] = relationship(back_populates="invitations")
