import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
      if (email === "admin@gmail.com") nav("/admin");
      else nav("/app");
    } catch {
      setErr("We could not sign you in. Check your email and password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-4">
      <div className="w-full max-w-md glass rounded-3xl p-8 shadow-soft">
        <h1 className="font-display text-2xl font-bold text-ink mb-1">
          Welcome back
        </h1>
        <p className="text-mist text-sm mb-6">Sign in to continue practicing.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-mist mb-1">
              Email
            </label>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-mist mb-1">
              Password
            </label>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-ink text-white font-semibold text-sm hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-sm text-mist mt-6 text-center">
          New here?{" "}
          <Link to="/register" className="text-accent font-semibold">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
