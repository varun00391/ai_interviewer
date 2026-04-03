import axios from "axios";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";

type Session = {
  id: number;
  role_title: string;
  resume_summary: string | null;
  mode: string;
  flow_type?: string | null;
  status: string;
  disqualified?: boolean;
  created_at: string;
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function tierLabel(t: string) {
  if (t === "standard") return "Standard";
  if (t === "enterprise") return "Enterprise";
  return "Free";
}

export default function Dashboard() {
  const { user, logout, refresh } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState(false);
  const [quotaErr, setQuotaErr] = useState<string | null>(null);
  const [subBusy, setSubBusy] = useState<string | null>(null);

  async function load() {
    const { data } = await api.get<Session[]>("/sessions");
    setSessions(data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createSession() {
    setQuotaErr(null);
    setBusy(true);
    try {
      const { data } = await api.post<Session>("/sessions", {
        role_title: "Practice session",
        flow_type: "full",
        single_round_type: null,
      });
      await load();
      await refresh();
      window.location.href = `/app/session/${data.id}`;
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 403) {
        const d = e.response.data as { detail?: string };
        setQuotaErr(
          typeof d?.detail === "string"
            ? d.detail
            : "You cannot start a new interview right now."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function activatePaid(tier: "standard" | "enterprise") {
    setSubBusy(tier);
    setQuotaErr(null);
    try {
      await api.post("/subscriptions/activate", { tier });
      await refresh();
      await load();
    } catch {
      setQuotaErr("Could not update subscription (demo).");
    } finally {
      setSubBusy(null);
    }
  }

  const u = user;
  const usageLine =
    u?.subscription_tier === "free"
      ? `${u.interviews_total} of ${u.interviews_total_limit ?? 3} interviews used (lifetime)`
      : `${u?.interviews_today ?? 0} of ${u?.interviews_daily_limit ?? "—"} interviews used today`;

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="font-display font-semibold text-lg">InterviewAI</div>
            <div className="text-xs text-mist">
              Signed in as {user?.email}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user?.is_admin && (
              <Link
                to="/admin"
                className="text-sm px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-50"
              >
                Admin
              </Link>
            )}
            <button
              type="button"
              onClick={() => logout()}
              className="text-sm px-3 py-1.5 rounded-full bg-ink text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {u && (
          <section className="rounded-3xl border border-violet-200/80 bg-gradient-to-br from-fuchsia-50 via-white to-cyan-50 p-6 shadow-lg shadow-fuchsia-500/10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">
                  Your plan: {tierLabel(u.subscription_tier)}
                </h2>
                <p className="text-sm text-mist mt-1">{usageLine}</p>
                {u.subscription_tier !== "free" &&
                  u.subscription_starts_at &&
                  u.subscription_ends_at && (
                    <p className="text-xs text-mist mt-2">
                      Current period: {fmtDate(u.subscription_starts_at)} →{" "}
                      {fmtDate(u.subscription_ends_at)}
                    </p>
                  )}
                {u.subscription_tier === "free" &&
                  (u.subscription_tier_stored === "standard" ||
                    u.subscription_tier_stored === "enterprise") && (
                    <p className="text-xs text-amber-700 mt-2">
                      Your paid period ended—you are on free limits now (3 interviews total).
                    </p>
                  )}
              </div>
              {!u.is_admin && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={subBusy !== null}
                    onClick={() => void activatePaid("standard")}
                    className="text-xs px-4 py-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-semibold shadow-md disabled:opacity-50"
                  >
                    {subBusy === "standard" ? "…" : "Standard $20/mo (demo)"}
                  </button>
                  <button
                    type="button"
                    disabled={subBusy !== null}
                    onClick={() => void activatePaid("enterprise")}
                    className="text-xs px-4 py-2 rounded-full bg-gradient-to-r from-cyan-600 to-violet-600 text-white font-semibold shadow-md disabled:opacity-50"
                  >
                    {subBusy === "enterprise" ? "…" : "Enterprise $100/mo (demo)"}
                  </button>
                </div>
              )}
            </div>
            <p className="text-[11px] text-mist mt-3">
              Demo mode renews a 30-day window without a real card charge. Production would use a
              payment provider.
            </p>
          </section>
        )}

        <section className="glass rounded-3xl p-8">
          <h2 className="font-display text-xl font-semibold text-ink mb-2">
            New practice interview
          </h2>
          <p className="text-mist text-sm mb-4 max-w-2xl">
            Opens setup: resume, role, and round choice. Each new setup counts toward your plan
            limits.
          </p>
          {quotaErr && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {quotaErr}
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void createSession()}
            className="px-6 py-2.5 rounded-full bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white text-sm font-semibold shadow-lg shadow-fuchsia-500/25 disabled:opacity-50 hover:brightness-110 transition"
          >
            {busy ? "Creating…" : "Start setup"}
          </button>
        </section>

        <section>
          <h3 className="font-display font-semibold text-lg mb-4">
            Your practice sessions
          </h3>
          {sessions.length === 0 ? (
            <p className="text-mist text-sm">No sessions yet.</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => (
                <Link
                  key={s.id}
                  to={`/app/session/${s.id}`}
                  className="block glass rounded-2xl p-5 hover:border-fuchsia-300/50 border border-transparent transition"
                >
                  <div className="flex justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-semibold text-ink">{s.role_title}</div>
                      <div className="text-xs text-mist mt-1">
                        {s.flow_type === "single"
                          ? "Single round focus"
                          : s.mode === "full"
                            ? "Full interview"
                            : "Round by round"}{" "}
                        · {s.status}
                        {s.disqualified ? " · Stopped (integrity)" : ""}
                      </div>
                    </div>
                    <span className="text-sm text-fuchsia-600 font-medium">
                      Open →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
