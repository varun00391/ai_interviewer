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

    deepgram_api_key: str | None = None  # DEEPGRAM_API_KEY — STT + TTS (Aura)
    # Voice model for /v1/speak — see https://developers.deepgram.com/docs/tts-models
    deepgram_tts_model: str = "aura-2-thalia-en"

    upload_dir: str = "/app/uploads"
    silence_ms_hint: int = 5000
    questions_per_round_min: int = 5
    questions_per_round_max: int = 7
    # Main questions are 5–7; follow-ups may add more but total per round never exceeds this.
    max_questions_per_round_total: int = 9

    integrity_warn_severity: float = 6.0
    integrity_disqualify_severity: float = 8.5
    integrity_strikes_to_dq: int = 3


settings = Settings()
