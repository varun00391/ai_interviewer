from groq import Groq

from app.config import settings
from app.services.prompt_log import append_prompt_entry


class GroqService:
    def __init__(self) -> None:
        self._client: Groq | None = None
        if settings.groq_api_key:
            self._client = Groq(api_key=settings.groq_api_key)

    def is_configured(self) -> bool:
        return self._client is not None

    def complete(
        self,
        *,
        agent_name: str,
        system: str,
        user: str,
        temperature: float = 0.4,
        log_full_response: bool = True,
    ) -> str:
        if not self._client:
            fallback = (
                "[GROQ_API_KEY not set] Placeholder response. "
                "Configure GROQ_API_KEY in backend/.env to enable live LLM output."
            )
            append_prompt_entry(
                agent_name=agent_name,
                prompt=f"SYSTEM:\n{system}\n\nUSER:\n{user}",
                response=fallback,
                metadata="LLM disabled",
            )
            return fallback

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        chat = self._client.chat.completions.create(
            model=settings.groq_model,
            messages=messages,
            temperature=temperature,
        )
        content = (chat.choices[0].message.content or "").strip()
        append_prompt_entry(
            agent_name=agent_name,
            prompt=f"SYSTEM:\n{system}\n\nUSER:\n{user}",
            response=content if log_full_response else "[omitted — set log_full_response True]",
            metadata=f"model={settings.groq_model}",
        )
        return content


groq_service = GroqService()
