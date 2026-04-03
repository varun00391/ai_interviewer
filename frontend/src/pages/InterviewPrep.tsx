import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

type Session = {
  id: number;
  role_title: string;
  resume_summary: string | null;
  mode: string;
  flow_type?: string | null;
  single_round_type?: string | null;
  status: string;
  disqualified?: boolean;
  disqualify_reason?: string | null;
};

type Round = {
  id: number;
  round_type: string;
  score_overall: number | null;
  completed_at: string | null;
};

const ROUNDS: { key: string; label: string; blurb: string }[] = [
  {
    key: "hr",
    label: "HR round",
    blurb: "General questions about you, motivation, and how you work with people.",
  },
  {
    key: "technical",
    label: "Technical round",
    blurb: "Role-specific questions plus sketching and optional code.",
  },
  {
    key: "managerial",
    label: "Managerial round",
    blurb: "Leadership-style questions about judgment, trade-offs, and priorities.",
  },
];

export default function InterviewPrep() {
  const { sessionId } = useParams();
  const id = Number(sessionId);
  const [session, setSession] = useState<Session | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [roleTitle, setRoleTitle] = useState("");
  const [flowType, setFlowType] = useState<"full" | "single">("full");
  const [singleRound, setSingleRound] = useState<"hr" | "technical" | "managerial">(
    "hr"
  );

  const load = useCallback(async () => {
    const [{ data: s }, { data: r }] = await Promise.all([
      api.get<Session>(`/sessions/${id}`),
      api.get<Round[]>(`/sessions/${id}/rounds`),
    ]);
    setSession(s);
    setRounds(r);
    setRoleTitle(s.role_title || "");
    setFlowType(s.flow_type === "single" ? "single" : "full");
    if (s.single_round_type === "technical" || s.single_round_type === "managerial") {
      setSingleRound(s.single_round_type);
    } else {
      setSingleRound("hr");
    }
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    void load();
  }, [id, load]);

  async function upload() {
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/sessions/${id}/resume`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setFile(null);
      setMsg("Resume uploaded. You can start a round when you are ready.");
      await load();
    } catch {
      setMsg("Upload failed. Try a PDF or Word file.");
    } finally {
      setUploading(false);
    }
  }

  async function savePreferences() {
    if (!roleTitle.trim() || roleTitle.trim().length < 2) {
      setMsg("Please enter a role (at least 2 characters).");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await api.patch(`/sessions/${id}`, {
        role_title: roleTitle.trim(),
        flow_type: flowType,
        single_round_type: flowType === "single" ? singleRound : null,
      });
      await load();
      setMsg("Preferences saved.");
    } catch {
      setMsg("Could not save preferences.");
    } finally {
      setSaving(false);
    }
  }

  function done(key: string) {
    return rounds.some((x) => x.round_type === key && x.completed_at);
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-mist">
        Loading…
      </div>
    );
  }

  if (session.disqualified) {
    return (
      <div className="min-h-screen bg-surface px-6 py-12 max-w-lg mx-auto space-y-4">
        <Link to="/app" className="text-sm text-accent font-medium">
          ← Back to home
        </Link>
        <div className="glass rounded-3xl p-8 space-y-3">
          <h1 className="font-display text-xl font-bold text-ink">Session closed</h1>
          <p className="text-sm text-mist">
            {session.disqualify_reason ||
              "This practice session was stopped after an integrity review."}
          </p>
          <Link
            to="/app"
            className="inline-flex px-5 py-2.5 rounded-full bg-ink text-white text-sm font-semibold"
          >
            Start over
          </Link>
        </div>
      </div>
    );
  }

  const effectiveSingle = flowType === "single" ? singleRound : null;
  const visibleRounds = effectiveSingle
    ? ROUNDS.filter((r) => r.key === effectiveSingle)
    : ROUNDS;

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-6xl mx-auto px-4 py-8 lg:flex lg:gap-8">
        <aside className="lg:w-80 shrink-0 space-y-6 mb-8 lg:mb-0">
          <Link to="/app" className="text-sm text-accent font-medium inline-block">
            ← Back to home
          </Link>

          <div className="glass rounded-3xl p-6 space-y-5 sticky top-6">
            <h2 className="font-display font-semibold text-lg text-ink">
              Set up this interview
            </h2>

            <div>
              <label className="block text-xs font-semibold text-mist mb-1">
                Resume
              </label>
              <p className="text-xs text-mist mb-2">
                PDF, Word, or text. We use it to tailor questions.
              </p>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                className="text-xs w-full"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                disabled={!file || uploading}
                onClick={() => void upload()}
                className="mt-2 w-full py-2 rounded-xl bg-ink text-white text-sm font-semibold disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Upload resume"}
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-mist mb-1">
                Role you are interviewing for
              </label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="e.g. Backend engineer"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
              />
            </div>

            <div>
              <span className="block text-xs font-semibold text-mist mb-2">
                Interview style
              </span>
              <div className="space-y-2 text-sm">
                <label className="flex gap-2 items-start cursor-pointer">
                  <input
                    type="radio"
                    name="flow"
                    checked={flowType === "full"}
                    onChange={() => setFlowType("full")}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-ink">Complete interview</span>
                    <span className="block text-xs text-mist">
                      Run HR, Technical, and Managerial back-to-back when you continue from each round.
                    </span>
                  </span>
                </label>
                <label className="flex gap-2 items-start cursor-pointer">
                  <input
                    type="radio"
                    name="flow"
                    checked={flowType === "single"}
                    onChange={() => setFlowType("single")}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-ink">One round only</span>
                    <span className="block text-xs text-mist">
                      Focus on a single round; you can change this later.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {flowType === "single" && (
              <div>
                <label className="block text-xs font-semibold text-mist mb-1">
                  Which round?
                </label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                  value={singleRound}
                  onChange={(e) =>
                    setSingleRound(e.target.value as typeof singleRound)
                  }
                >
                  <option value="hr">HR round</option>
                  <option value="technical">Technical round</option>
                  <option value="managerial">Managerial round</option>
                </select>
              </div>
            )}

            <button
              type="button"
              disabled={saving}
              onClick={() => void savePreferences()}
              className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save preferences"}
            </button>

            {msg && (
              <p
                className={`text-xs ${msg.includes("failed") || msg.includes("Could not") ? "text-red-600" : "text-emerald-700"}`}
              >
                {msg}
              </p>
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0 space-y-6">
          <div className="glass rounded-3xl p-8">
            <h1 className="font-display text-2xl font-bold text-ink mb-2">
              {session.role_title}
            </h1>
            <p className="text-sm text-mist mb-4">
              {flowType === "single"
                ? `You are focusing on the ${ROUNDS.find((r) => r.key === singleRound)?.label || "selected"} (save preferences to apply).`
                : session.mode === "full"
                  ? "Full interview: move through HR, Technical, and Managerial when you are ready."
                  : "You can complete rounds one at a time from this page."}
            </p>
            {session.resume_summary && (
              <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4 text-sm text-ink whitespace-pre-wrap">
                <div className="text-xs font-semibold text-mist mb-1">
                  What we understood from your resume
                </div>
                {session.resume_summary}
              </div>
            )}
          </div>

          <div className="glass rounded-3xl p-8 space-y-4">
            <h2 className="font-semibold text-ink">Start a round</h2>
            {!session.resume_summary ? (
              <p className="text-sm text-mist">
                Upload your resume in the sidebar so we can prepare questions.
              </p>
            ) : (
              <div className="space-y-3">
                {visibleRounds.map((r) => (
                  <div
                    key={r.key}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4"
                  >
                    <div>
                      <div className="font-semibold text-ink">{r.label}</div>
                      <div className="text-xs text-mist mt-1">{r.blurb}</div>
                      {done(r.key) && (
                        <div className="text-xs text-emerald-700 font-medium mt-2">
                          Completed
                          {rounds.find((x) => x.round_type === r.key)?.score_overall !=
                            null &&
                            ` · Score ${rounds.find((x) => x.round_type === r.key)?.score_overall?.toFixed(1)} / 10`}
                        </div>
                      )}
                    </div>
                    <Link
                      to={`/app/session/${id}/interview/${r.key}`}
                      className="shrink-0 text-center px-4 py-2 rounded-full bg-accent text-white text-sm font-semibold"
                    >
                      {done(r.key) ? "Practice again" : "Start"}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
