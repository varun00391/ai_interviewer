from datetime import datetime, timezone

from app.config import settings


def append_prompt_entry(
    *,
    agent_name: str,
    prompt: str,
    response: str | None = None,
    metadata: str | None = None,
) -> None:
    path = settings.resolved_prompt_log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [
        "",
        f"## {ts} — {agent_name}",
        "",
        "### Prompt",
        "",
        prompt.strip(),
        "",
    ]
    if response is not None:
        lines.extend(["### Response", "", response.strip(), ""])
    if metadata:
        lines.extend(["### Metadata", "", metadata.strip(), ""])
    lines.append("---")
    lines.append("")
    with path.open("a", encoding="utf-8") as f:
        f.write("\n".join(lines))
