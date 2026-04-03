import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const PLANS = ["free", "standard", "enterprise"] as const;

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const planParam = searchParams.get("plan") || "free";
  const plan = useMemo(() => {
    const p = planParam.toLowerCase();
    return PLANS.includes(p as (typeof PLANS)[number]) ? p : "free";
  }, [planParam]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const planLabel =
    plan === "standard"
      ? "Standard — $20/mo (demo: 30 days)"
      : plan === "enterprise"
        ? "Enterprise — $100/mo (demo: 30 days)"
        : "Free — 3 interviews total";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await register(
        email,
        password,
        fullName || undefined,
        plan,
        username || undefined
      );
      nav("/app");
    } catch {
      setErr("Could not create your account. That email may already be in use.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen landing-vibrant flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-slate-950/60 backdrop-blur-xl p-8 shadow-[0_0_60px_-12px_rgba(168,85,247,0.45)]">
        <h1 className="font-display text-2xl font-bold text-white mb-1">
          Create your account
        </h1>
        <p className="text-slate-400 text-sm mb-2">
          Plan: <span className="text-cyan-300 font-medium">{planLabel}</span>
        </p>
        <p className="text-slate-500 text-xs mb-6">
          Payments are simulated for now—your plan starts immediately after sign-up.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Name (optional)
            </label>
            <input
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-fuchsia-500/50"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Username (optional)
            </label>
            <input
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-fuchsia-500/50"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Letters, numbers, underscore — or we pick one from your email"
              autoComplete="username"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Shown in admin; must be unique if you set it.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Email
            </label>
            <input
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-fuchsia-500/50"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Password (at least 6 characters)
            </label>
            <input
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-fuchsia-500/50"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              minLength={6}
              required
            />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-500 text-white font-semibold text-sm shadow-lg shadow-fuchsia-500/30 hover:brightness-110 disabled:opacity-60 transition"
          >
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="text-sm text-slate-400 mt-6 text-center">
          Wrong plan?{" "}
          <Link to="/" className="text-cyan-400 font-semibold hover:underline">
            Compare plans
          </Link>
        </p>
        <p className="text-sm text-slate-500 mt-2 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-fuchsia-400 font-semibold">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
