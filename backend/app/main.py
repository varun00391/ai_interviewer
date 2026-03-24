import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal, engine, init_db
from app.models import User, UserRole
from app.routers import admin, auth, candidate, interviews, invitations
from app.security import hash_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def seed_admin() -> None:
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(User).where(User.role == UserRole.admin))
        admins = list(r.scalars().all())
        for u in admins:
            if u.email == "admin@demo.local":
                u.email = "admin@gmail.com"
                u.hashed_password = hash_password("admin123")
                await db.commit()
                logger.info("Admin login updated to admin@gmail.com / admin123")
                return
        if admins:
            return
        admin_user = User(
            email="admin@gmail.com",
            hashed_password=hash_password("admin123"),
            full_name="Admin",
            role=UserRole.admin,
        )
        db.add(admin_user)
        await db.commit()
        logger.info("Seeded admin user: admin@gmail.com / admin123")


@asynccontextmanager
async def lifespan(app: FastAPI):
    prompt_path = settings.resolved_prompt_log_path()
    prompt_path.parent.mkdir(parents=True, exist_ok=True)
    if not prompt_path.exists():
        prompt_path.write_text(
            "# Prompt log\n\nAll LLM prompts and responses are appended here by the backend.\n\n",
            encoding="utf-8",
        )
    await init_db()
    await seed_admin()
    yield
    await engine.dispose()


app = FastAPI(title="AI Interviewer API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(candidate.router)
app.include_router(interviews.router)
app.include_router(admin.router)
app.include_router(invitations.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
