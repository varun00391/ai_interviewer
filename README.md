# AI Interviewer & Skill Assessment

An agentic interview platform: multi-round interviews powered by **Groq** LLMs, candidate and admin web UIs, optional email invitations, integrity signals (tab focus, face-match API), and Markdown hiring reports. The backend is **FastAPI** (Python); the frontend is **React**, **Vite**, and **Tailwind CSS**.

---

## What you can do


| Role          | Capabilities                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Candidate** | Register, upload resume (PDF/DOCX or paste; parsed by LLM), create an interview track, start **voice + camera** rounds as soon as they are scheduled (no email required by default), view scores and report. |
| **Admin**     | View all interviews and rounds, filter by scheduled date, send invitations for specific rounds, see scores and outcomes.                                                                                     |


Every LLM call is appended to `**prompt.md`** at the repository root (local dev) or `**/app/data/prompt.md**` inside Docker (see environment variables).

---

## Prerequisites

- **Docker** and **Docker Compose** (plugin `docker compose`), *or*
- **Python 3.12+** and **Node.js 20+** for running without containers.

For live model output you need a **[Groq API key](https://console.groq.com/)**.

---

## Run with Docker Compose (recommended)

From the **repository root** (where `docker-compose.yml` lives):

1. Optional: create a `.env` file (you can start from `.env.docker.example`):
  ```bash
   cp .env.docker.example .env
  ```
   Set at least:
  - `GROQ_API_KEY` — your Groq key  
  - `SECRET_KEY` — long random string for JWT signing in production  
  - `PUBLIC_APP_URL` — usually `http://localhost:8080` when using the default compose ports  
  - `VITE_API_URL` — use **`/api`** (default in Compose) so the UI on port **8080** proxies API calls through nginx to the backend. Avoids CORS issues and the default **1 MB nginx upload limit** that broke large PDF uploads when calling port 8000 directly. For local `npm run dev`, keep `http://127.0.0.1:8000` in `frontend/.env`.
2. Build and start:
  ```bash
   docker compose up --build
  ```
3. Open the app:
  - **Web UI:** [http://localhost:8080](http://localhost:8080) (API is at `/api/...` on the same origin)  
  - **Direct API (optional):** [http://localhost:8000](http://localhost:8000) — e.g. [http://localhost:8000/docs](http://localhost:8000/docs)  
  - **Health via proxy:** [http://localhost:8080/api/health](http://localhost:8080/api/health)

Data is persisted in the `**backend_data`** Docker volume (SQLite database and prompt log under `/app/data` in the backend container).

To stop:

```bash
docker compose down
```

`docker compose down -v` removes the volume as well (wipes DB and stored prompt file in that volume).

---

## Run without Docker (local development)

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # edit: GROQ_API_KEY, SECRET_KEY, etc.
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

SQLite file and local `data/` directory are created under `backend/data/` by default.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env        # VITE_API_URL=http://127.0.0.1:8000
npm run dev
```

Dev server defaults to [http://localhost:5173](http://localhost:5173). Ensure backend **CORS** includes that origin (defaults already include `5173` and `8080`).

---

## Default accounts

On first backend startup, an admin user is created if no admin exists:

- **Email:** `admin@gmail.com`  
- **Password:** `admin123`

If you previously used `admin@demo.local`, restart the backend once: the app migrates that account to `admin@gmail.com` with the same password.  

Change this in production (create a new admin in the database or adjust seed logic). Candidates register through the UI (`/register`).

---

## Typical flows

1. **Candidate** registers, signs in, uploads resume text, optionally saves a face **embedding** (JSON array of floats; production would use MediaPipe or similar in the browser).
2. **Candidate** creates an interview (job title + number of rounds). The planner uses the **parsed resume** to build the multi-round plan; **round 1 is scheduled immediately** so they can start the voice interview without email.
3. **Candidate** clicks **Start voice & camera round** (optional `/invite/{token}` flow still exists for admins who want email).
4. During the session, the UI can send **integrity events** (e.g. tab blur) and **face-check** payloads to the API.
5. **End session** runs the evaluator; on pass, the **next round is scheduled automatically**; after the final round, a **Markdown report** is generated.
6. **Admin** uses `/admin` to list interviews, filter by date, and optionally send email invitations for a round.

---

## Environment variables (backend)


| Variable              | Purpose                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `GROQ_API_KEY`        | Required for real LLM responses. If empty, placeholders are returned and still logged to `prompt.md`. |
| `GROQ_MODEL`          | Groq chat model id (default `llama-3.3-70b-versatile`).                                               |
| `SECRET_KEY`          | JWT signing secret.                                                                                   |
| `PUBLIC_APP_URL`      | Used in invitation links (e.g. `http://localhost:8080` in Docker).                                    |
| `DATABASE_URL`        | Override SQLite URL (Docker Compose sets an absolute path under `/app/data`).                         |
| `PROMPT_LOG_PATH`     | Override path for the append-only prompt log file.                                                    |
| `CORS_ORIGINS`        | Comma-separated browser origins allowed by the API.                                                   |
| `SMTP_`*, `MAIL_FROM` | Optional real email delivery for invitations (see `backend/.env.example`).                            |


Frontend build-time:


| Variable       | Purpose                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------- |
| `VITE_API_URL` | Base URL of the API as seen from the **browser** (not the internal Docker service name). |


---

## API overview

Interactive docs: **[http://localhost:8000/docs](http://localhost:8000/docs)** (when the backend is running).

Notable route groups:

- `/auth/register`, `/auth/login`  
- `/me`, `/me/resume/file` (PDF / Word only), `/me/face-enrollment`  
- `/interviews` — create, list, sessions, messages, integrity, face-check, end session, report  
- `/admin/interviews` — list, invite round  
- `/invitations/{token}` — public invite view and accept

---

## Project layout

```
ai_interviewer/
├── backend/           # FastAPI app (app.main:app)
├── frontend/          # Vite + React + Tailwind
├── docker-compose.yml
├── prompt.md          # LLM prompt/response log (local default location)
└── README.md
```

---

## Troubleshooting

- **CORS errors:** Add your exact browser origin (scheme + host + port) to `CORS_ORIGINS` and/or align `PUBLIC_APP_URL` with the URL you use for the UI.  
- **Invitation links wrong host:** Set `PUBLIC_APP_URL` to the URL candidates use to open the app.  
- **Docker pull / credential errors:** Fix `~/.docker/config.json` (e.g. credential helper) or use Docker Desktop.  
- **Empty or generic LLM text:** Confirm `GROQ_API_KEY` is set in the environment the **backend** process sees (Compose `.env` or shell).

---

## Security notes

Do not commit real API keys or production `SECRET_KEY` values. Use `.env` files that are listed in `.gitignore`. Replace default admin credentials before any real deployment.