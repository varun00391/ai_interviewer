import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";

type Metrics = {
  total_users: number;
  total_sessions: number;
  completed_sessions: number;
  rounds_completed: number;
  avg_round_score: number | null;
};

type UserRow = {
  id: number;
  email: string;
  username: string | null;
  password_storage: string;
  full_name: string | null;
  is_admin: boolean;
  created_at: string;
  session_count: number;
  subscription_tier: string;
  subscription_tier_stored: string | null;
  subscription_starts_at: string | null;
  subscription_ends_at: string | null;
};

type Session = {
  id: number;
  user_id: number;
  role_title: string;
  status: string;
  created_at: string;
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function tierBadge(t: string) {
  const base =
    "inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ";
  if (t === "enterprise") return base + "bg-cyan-500/20 text-cyan-300";
  if (t === "standard") return base + "bg-fuchsia-500/20 text-fuchsia-300";
  return base + "bg-slate-600 text-slate-300";
}

function CompletionRing({ pct }: { pct: number }) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div
      className="relative mx-auto h-40 w-40 shrink-0 rounded-full p-[3px] shadow-[0_0_40px_-8px_rgba(168,85,247,0.55)]"
      style={{
        background: `conic-gradient(from -90deg, rgb(192 132 252) ${p}%, rgb(30 41 59) ${p}%)`,
      }}
      aria-label={`Completion rate ${p} percent`}
    >
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-slate-950">
        <span className="font-display text-4xl font-bold tabular-nums text-white">{p}</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          %
        </span>
        <span className="mt-1 max-w-[7rem] text-center text-[10px] leading-tight text-slate-500">
          sessions completed
        </span>
      </div>
    </div>
  );
}

function ActivityBarRow({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "violet" | "cyan" | "fuchsia" | "amber";
}) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const grad =
    tone === "violet"
      ? "from-violet-500 to-fuchsia-500"
      : tone === "cyan"
        ? "from-cyan-500 to-teal-400"
        : tone === "fuchsia"
          ? "from-fuchsia-500 to-pink-500"
          : "from-amber-400 to-orange-500";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-slate-400">{label}</span>
        <span className="tabular-nums font-semibold text-slate-100">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800/80 ring-1 ring-white/5">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${grad} transition-[width] duration-500 ease-out`}
          style={{ width: `${w}%` }}
        />
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    void (async () => {
      const [{ data: m }, { data: u }, { data: s }] = await Promise.all([
        api.get<Metrics>("/admin/metrics"),
        api.get<UserRow[]>("/admin/users"),
        api.get<Session[]>("/admin/sessions"),
      ]);
      setMetrics(m);
      setUsers(u);
      setSessions(s);
    })();
  }, []);

  const snapshot = useMemo(() => {
    if (!metrics) return null;
    const completionPct =
      metrics.total_sessions > 0
        ? Math.round((metrics.completed_sessions / metrics.total_sessions) * 100)
        : 0;
    const roundsPerSession =
      metrics.total_sessions > 0
        ? (metrics.rounds_completed / metrics.total_sessions).toFixed(1)
        : "—";
    const maxBar = Math.max(
      metrics.total_users,
      metrics.total_sessions,
      metrics.completed_sessions,
      metrics.rounds_completed,
      1
    );
    return { completionPct, roundsPerSession, maxBar };
  }, [metrics]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex flex-wrap gap-4 justify-between items-center">
        <div>
          <div className="font-display font-semibold text-lg">Admin overview</div>
          <div className="text-xs text-slate-400">{user?.email}</div>
        </div>
        <div className="flex gap-2">
          <Link
            to="/app"
            className="text-sm px-3 py-1.5 rounded-full border border-slate-600 hover:bg-slate-800"
          >
            User app
          </Link>
          <button
            type="button"
            onClick={() => logout()}
            className="text-sm px-3 py-1.5 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white font-medium"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-10">
        {metrics && (
          <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <div className="text-xs text-slate-400 uppercase tracking-wide">Users</div>
              <div className="text-3xl font-bold mt-1">{metrics.total_users}</div>
            </div>
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <div className="text-xs text-slate-400 uppercase tracking-wide">Sessions</div>
              <div className="text-3xl font-bold mt-1">{metrics.total_sessions}</div>
            </div>
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <div className="text-xs text-slate-400 uppercase tracking-wide">
                Finished interviews
              </div>
              <div className="text-3xl font-bold mt-1">{metrics.completed_sessions}</div>
            </div>
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <div className="text-xs text-slate-400 uppercase tracking-wide">Avg round score</div>
              <div className="text-3xl font-bold mt-1">
                {metrics.avg_round_score != null ? metrics.avg_round_score.toFixed(1) : "—"}
              </div>
            </div>
          </section>
        )}

        {metrics && snapshot && (
          <section className="relative overflow-hidden rounded-3xl border border-slate-800/90 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-950 p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-fuchsia-600/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 -left-16 h-56 w-56 rounded-full bg-cyan-600/10 blur-3xl" />
            <div className="relative flex flex-col gap-10 lg:flex-row lg:items-stretch lg:gap-12">
              <div className="flex flex-col items-center lg:items-start lg:w-[220px]">
                <h2 className="font-display text-xl font-semibold text-white">Activity snapshot</h2>
                <p className="mt-1 max-w-xs text-center text-xs text-slate-500 lg:text-left">
                  Funnel from accounts to finished practice runs — at a glance.
                </p>
                <div className="mt-8">
                  <CompletionRing pct={snapshot.completionPct} />
                </div>
              </div>
              <div className="hidden w-px shrink-0 bg-gradient-to-b from-transparent via-slate-700/60 to-transparent lg:block" />
              <div className="flex flex-1 flex-col justify-center gap-6">
                <ActivityBarRow
                  label="Registered users"
                  value={metrics.total_users}
                  max={snapshot.maxBar}
                  tone="cyan"
                />
                <ActivityBarRow
                  label="Interview sessions started"
                  value={metrics.total_sessions}
                  max={snapshot.maxBar}
                  tone="violet"
                />
                <ActivityBarRow
                  label="Sessions fully completed"
                  value={metrics.completed_sessions}
                  max={snapshot.maxBar}
                  tone="fuchsia"
                />
                <ActivityBarRow
                  label="Rounds completed (all sessions)"
                  value={metrics.rounds_completed}
                  max={snapshot.maxBar}
                  tone="amber"
                />
              </div>
            </div>
            <div className="relative mt-10 flex flex-wrap gap-4 border-t border-slate-800/80 pt-8">
              <div className="min-w-[140px] flex-1 rounded-2xl border border-white/5 bg-slate-900/50 px-5 py-4 backdrop-blur-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Rounds per session
                </div>
                <div className="mt-1 font-display text-2xl font-bold text-cyan-300 tabular-nums">
                  {snapshot.roundsPerSession}
                </div>
              </div>
              <div className="min-w-[140px] flex-1 rounded-2xl border border-white/5 bg-slate-900/50 px-5 py-4 backdrop-blur-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Completion rate
                </div>
                <div className="mt-1 font-display text-2xl font-bold text-fuchsia-300 tabular-nums">
                  {snapshot.completionPct}%
                </div>
              </div>
              <div className="min-w-[140px] flex-1 rounded-2xl border border-white/5 bg-slate-900/50 px-5 py-4 backdrop-blur-sm">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Avg score (rounds)
                </div>
                <div className="mt-1 font-display text-2xl font-bold text-amber-200 tabular-nums">
                  {metrics.avg_round_score != null ? metrics.avg_round_score.toFixed(1) : "—"}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="grid lg:grid-cols-2 gap-8">
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-lg mb-3">Users & subscriptions</h2>
            <div className="rounded-2xl border border-slate-800 overflow-x-auto">
              <table className="w-full text-sm min-w-[920px]">
                <thead className="bg-slate-900 text-slate-400 text-left text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Username</th>
                    <th className="px-3 py-2">Password</th>
                    <th className="px-3 py-2">Effective</th>
                    <th className="px-3 py-2">Stored</th>
                    <th className="px-3 py-2">Period start</th>
                    <th className="px-3 py-2">Period end</th>
                    <th className="px-3 py-2">Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-slate-800">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-200">{u.email}</div>
                        <div className="text-[10px] text-slate-500">
                          {u.is_admin ? "Admin" : "Candidate"}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-300">
                        {u.username || "—"}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-500 max-w-[200px] leading-snug">
                        {u.password_storage}
                      </td>
                      <td className="px-3 py-2">
                        <span className={tierBadge(u.subscription_tier)}>{u.subscription_tier}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-500 text-xs">
                        {u.subscription_tier_stored || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">
                        {u.subscription_starts_at ? fmt(u.subscription_starts_at) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">
                        {u.subscription_ends_at ? fmt(u.subscription_ends_at) : "—"}
                      </td>
                      <td className="px-3 py-2">{u.session_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Effective tier respects subscription end dates (expired paid plans show as free for
              limits). Passwords are never stored in plain text — the column explains how they are
              secured.
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-lg mb-3">Recent sessions</h2>
            <div className="rounded-2xl border border-slate-800 divide-y divide-slate-800 max-h-[420px] overflow-y-auto">
              {sessions.map((s) => (
                <div key={s.id} className="px-4 py-3 text-sm flex justify-between gap-2">
                  <div>
                    <div className="font-medium">{s.role_title}</div>
                    <div className="text-xs text-slate-400">
                      User #{s.user_id} · {s.status}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 whitespace-nowrap">
                    {new Date(s.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
