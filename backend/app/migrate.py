from sqlalchemy import text

from app.database import engine


def run_sql_migrations() -> None:
    """Add columns for existing PostgreSQL databases (create_all does not alter)."""
    stmts = [
        "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS flow_type VARCHAR(16) DEFAULT 'full'",
        "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS single_round_type VARCHAR(32)",
        "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS disqualified BOOLEAN DEFAULT FALSE",
        "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS disqualify_reason TEXT",
        "ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS integrity_score DOUBLE PRECISION DEFAULT 0",
        """ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS integrity_events JSONB DEFAULT '[]'::jsonb""",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(32) DEFAULT 'free'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_starts_at TIMESTAMP",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(80)",
    ]
    try:
        with engine.begin() as conn:
            for s in stmts:
                conn.execute(text(s))
    except Exception:
        pass
