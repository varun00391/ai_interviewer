from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent


def _default_database_url() -> str:
    data_dir = _BACKEND_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return f"sqlite+aiosqlite:///{data_dir / 'interview.db'}"


def _default_prompt_root() -> Path:
    """Monorepo (sibling `frontend/`) → repo root; Docker image (no sibling) → `/app`."""
    parent = _BACKEND_DIR.parent
    if (parent / "frontend").is_dir():
        return parent
    return _BACKEND_DIR


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = Field(default_factory=_default_database_url)
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    mail_from: str = "noreply@localhost"
    public_app_url: str = "http://localhost:5173"

    prompt_log_path: str | None = None

    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8080,http://127.0.0.1:8080"
    )

    def resolved_prompt_log_path(self) -> Path:
        if self.prompt_log_path:
            return Path(self.prompt_log_path)
        return _default_prompt_root() / "prompt.md"

    def cors_origins_list(self) -> list[str]:
        origins = [x.strip() for x in self.cors_origins.split(",") if x.strip()]
        if self.public_app_url and self.public_app_url not in origins:
            origins.append(self.public_app_url)
        return origins


settings = Settings()
