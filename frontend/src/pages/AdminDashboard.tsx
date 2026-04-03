import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

  const chartData = metrics
    ? [
        { name: "Users", value: metrics.total_users },
        { name: "Sessions", value: metrics.total_sessions },
        { name: "Completed", value: metrics.completed_sessions },
        { name: "Rounds done", value: metrics.rounds_completed },
      ]
    : [];

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
              <div className="text-xs text-slate-400 uppercase tracking-wide">
                Users
              </div>
              <div className="text-3xl font-bold mt-1">{metrics.total_users}</div>
            </div>
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <div className="text-xs text-slate-400 uppercase tracking-wide">
                Sessions
              </div>
              <div className="text-3xl font-bold mt-1">{metrics.total_sessions}</div>
            </div>
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <div className="text-xs text-slate-400 uppercase tracking-wide">
                Finished interviews
              </div>
              <div className="text-3xl font-bold mt-1">
                {metrics.completed_sessions}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <div className="text-xs text-slate-400 uppercase tracking-wide">
                Avg round score
              </div>
              <div className="text-3xl font-bold mt-1">
                {metrics.avg_round_score != null
                  ? metrics.avg_round_score.toFixed(1)
                  : "—"}
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
          <h2 className="font-display font-semibold text-lg mb-4">Activity snapshot</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="value" fill="#a855f7" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-8">
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-lg mb-3">Users & subscriptions</h2>
            <div className="rounded-2xl border border-slate-800 overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-slate-900 text-slate-400 text-left text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2">Email</th>
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
                      <td className="px-3 py-2">
                        <span className={tierBadge(u.subscription_tier)}>
                          {u.subscription_tier}
                        </span>
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
              limits).
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-lg mb-3">
              Recent sessions
            </h2>
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
