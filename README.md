# InterviewAI

InterviewAI is a practice interview web app. You upload a resume, pick a role, and go through three short rounds—**HR**, **Technical**, and **Managerial**. After each round you get a score out of 10, ideas to improve, and simple analytics. You can do **one round only** or a **full interview**.

## What is included

- **Subscriptions (demo billing):** **Free** — 3 practice interview sessions total; **Standard ($20/mo)** — 3 new sessions per day while active; **Enterprise ($100/mo)** — 20 new sessions per day. Paid tiers get a **30-day window** after sign-up or after using **Activate (demo)** on the dashboard. Admins are not quota-limited.
- **Resume upload** (PDF, Word, or text) with an AI-written summary when **`GROQ_API_KEY`** is set (Groq LLM); otherwise a short offline fallback.
- **5–7 questions per round**, generated from your resume and role.
- **Voice-first flow** in the browser (Web Speech API): the AI speaks each question first, then the mic turns on; a **5 second pause** after you speak means “I’m done.” **Typed answers** are supported if the microphone is unavailable (including in the Technical round).
- **Technical round**: Monaco **code editor** and a **drawing whiteboard**; snapshots are sent with your answers for scoring context.
- **Camera (all rounds)**: optional live preview; periodic frames are analyzed for **integrity** (second person, phone, obvious cheating cues). Severe or repeated signals can **end the session** (disqualify).
- **Admin panel** for metrics, users, and sessions (`admin@gmail.com` / `admin123`).
- **Docker**: separate Dockerfiles for backend and frontend, plus one `docker-compose.yml`.

## Tech stack

| Area     | Stack                          |
|----------|--------------------------------|
| Backend  | Python 3.12, FastAPI, SQLAlchemy, PostgreSQL |
| Frontend | React (Vite), TypeScript, Tailwind CSS |
| Realtime | WebSocket (`/ws/interview`)    |
| AI       | Groq API (Llama via `GROQ_MODEL`, vision via `GROQ_VISION_MODEL`) |

## Quick start (Docker)

1. Copy environment template (optional):

   ```bash
   cp .env.example .env
   ```

   Add **`GROQ_API_KEY`** to `.env` for summaries, questions, scoring, and camera integrity checks. Without it, the app still runs using built-in question templates and heuristic scores (integrity vision is skipped).

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
source .venv/bin/activate
pip install -r requirements.txt
export GROQ_API_KEY=gsk_...   # optional
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
4. Start a round. Listen to the question (spoken in the browser), answer out loud, then pause for about five seconds—or type your answer if needed.
5. In the **Skills** round, use the code area and whiteboard when a question calls for it.
6. After each round, review your score, chart, tips, and analytics. If you chose **all rounds together**, move on when prompted until you see the **full interview wrap-up**.

## Security notes

- Change `SECRET_KEY` and database credentials for any shared or production deployment.
- The default admin account is for **demonstration**; disable or rotate it in production.

## Documentation

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for system design, components, and how the pieces map to the product/architecture documents you provided.
