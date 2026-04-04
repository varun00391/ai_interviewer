# InterviewAI

InterviewAI is a practice interview web app. You upload a resume, pick a role, and go through three short rounds—**HR**, **Technical**, and **Managerial**. After each round you get a score out of 10, ideas to improve, and simple analytics. You can do **one round only** or a **full interview**.

## What is included

- **Subscriptions (demo billing):** **Free** — 3 practice interview sessions total; **Standard ($20/mo)** — 3 new sessions per day while active; **Enterprise ($100/mo)** — 20 new sessions per day. Paid tiers get a **30-day window** after sign-up or after using **Activate (demo)** on the dashboard. Admins are not quota-limited. If your plan or quota blocks the app, you see an **account locked** screen where you can renew (demo activate) while staying signed in.
- **Resume upload** (PDF, Word, or text) with an AI-written summary when **`GROQ_API_KEY`** is set (Groq LLM); otherwise a short offline fallback.
- **5–7 main questions per round**, generated from your resume and role, plus **optional LLM follow-ups**: after each **main** question, the server may insert **one** short clarifying question if your answer looks thin (capped so mains + follow-ups do not exceed **`MAX_QUESTIONS_PER_ROUND_TOTAL`** — default 9).
- **Voice-first flow** in the browser (Web Speech API): the AI speaks each question first, then the mic turns on; a **5 second pause** after you speak means “I’m done.” **Typed answers** are supported if the microphone is unavailable (including in the Technical round).
- **Optional server speech-to-text (Deepgram):** when **`DEEPGRAM_API_KEY`** is set, `/auth/me` reports `stt_deepgram_available` and the interview room can record short answer clips and call **`POST /asr/transcribe`** for transcription (Nova-2). Without it, only browser STT applies.
- **Technical round**: Monaco **code editor** and a **drawing whiteboard**; snapshots are sent with your answers for scoring context.
- **Camera (all rounds)**: optional live preview; periodic frames are analyzed for **integrity** (second person, phone, obvious cheating cues). Severe or repeated signals can **end the session** (disqualify).
- **Admin panel** for metrics, users, and sessions (`admin@gmail.com` / `admin123`).
- **Docker**: separate Dockerfiles for backend and frontend, plus one `docker-compose.yml`.

## Tech stack

| Area     | Stack |
|----------|--------|
| Backend  | Python 3.12, FastAPI, SQLAlchemy, PostgreSQL |
| Frontend | React (Vite), TypeScript, Tailwind CSS |
| Realtime | WebSocket (`/ws/interview`) |
| AI       | Groq API (chat via `GROQ_MODEL`, vision/integrity via `GROQ_VISION_MODEL`) |
| STT      | Browser Web Speech API; optional **Deepgram** (pre-recorded chunk → `POST /asr/transcribe`) |

## Quick start (Docker)

1. Copy environment template (optional):

   ```bash
   cp .env.example .env
   ```

   Typical variables:

   - **`GROQ_API_KEY`** — summaries, questions, scoring, follow-up decisions, and camera integrity (vision). Without it, the app still runs with built-in question templates and heuristic scores (integrity vision is skipped).
   - **`DEEPGRAM_API_KEY`** (optional) — enables server-side transcription from the interview room when the client sends audio to `/asr/transcribe`.
   - **`MAX_QUESTIONS_PER_ROUND_TOTAL`** (optional) — hard cap on main + follow-up questions per round (default **9**; main count stays 5–7).
   - **`SECRET_KEY`** — JWT signing; change for any shared deployment.

2. Build and run:

   ```bash
   docker compose up --build
   ```

3. Open **http://localhost:3000** for the UI and **http://localhost:8000/docs** for the API.

4. Sign in as admin: **admin@gmail.com** / **admin123**, or register a normal user.

## Local development (without Docker)

### Database

Run PostgreSQL (for example on port 5432) and set:

```bash
export DATABASE_URL=postgresql://user:pass@localhost:5432/interviewai
```

Create the database, then start the API (tables are created on startup).

### Backend

```bash
cd backend
python -m venv .venv
source .venv/activate
pip install -r requirements.txt
export GROQ_API_KEY=gsk_...    # optional
export DEEPGRAM_API_KEY=...   # optional
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies API and WebSocket to `localhost:8000`. For a custom API URL:

```bash
VITE_API_URL=http://localhost:8000 npm run dev
```

## User flow (plain language)

1. Create an account and sign in.
2. Enter the job title you want to practice and choose **one round at a time** or **all rounds together**.
3. Upload your resume and read the short summary.
4. Start a round. Listen to the question (spoken in the browser), answer out loud, then pause for about five seconds—or type your answer if needed. The AI may ask **one follow-up** on a main question if the answer is too vague.
5. In the **Skills** round, use the code area and whiteboard when a question calls for it.
6. After each round, review your score, chart, tips, and analytics. If you chose **all rounds together**, move on when prompted until you see the **full interview wrap-up**.

## Security notes

- Change `SECRET_KEY` and database credentials for any shared or production deployment.
- The default admin account is for **demonstration**; disable or rotate it in production.
- Do not commit real API keys; use `.env` locally and keep `.env` out of version control.

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — system design, modules, WebSocket flow, and how this maps to the broader InterviewAI PRD/architecture docs.
- **[next_steps.md](./next_steps.md)** — detailed PRD/architecture gap matrix and roadmap notes.
- **[next_step2.md](./next_step2.md)** — short “what we built vs. what the PRD still expects” summary.
