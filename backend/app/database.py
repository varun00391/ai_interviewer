from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    settings.database_url,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


def _sqlite_migrate_interview_rounds(connection) -> None:
    try:
        r = connection.execute(text("PRAGMA table_info(interview_rounds)"))
        cols = [row[1] for row in r.fetchall()]
        if not cols:
            return
        alters = [
            ("scores_breakdown_json", "ALTER TABLE interview_rounds ADD COLUMN scores_breakdown_json TEXT"),
            ("round_kind", "ALTER TABLE interview_rounds ADD COLUMN round_kind VARCHAR(32) DEFAULT 'general'"),
            ("focus_areas_json", "ALTER TABLE interview_rounds ADD COLUMN focus_areas_json TEXT"),
        ]
        for col, stmt in alters:
            if col not in cols:
                connection.execute(text(stmt))
                cols.append(col)
    except Exception:
        pass


async def init_db() -> None:
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if settings.database_url.startswith("sqlite"):
            await conn.run_sync(_sqlite_migrate_interview_rounds)
