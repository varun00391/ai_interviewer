from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        env_file_encoding="utf-8",
    )

    database_url: str = "postgresql://interview:interview@localhost:5432/interviewai"
    secret_key: str = "change-me-in-production-use-long-random-string"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    groq_api_key: str | None = None  # GROQ_API_KEY
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "meta-llama/llama-4-scout-17b-16e-instruct"
    groq_vision_model: str = "llama-3.2-11b-vision-preview"

    upload_dir: str = "/app/uploads"
    silence_ms_hint: int = 5000
    questions_per_round_min: int = 5
    questions_per_round_max: int = 7

    integrity_warn_severity: float = 6.0
    integrity_disqualify_severity: float = 8.5
    integrity_strikes_to_dq: int = 3


settings = Settings()
