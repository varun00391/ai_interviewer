import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";

export default function AccountLocked() {
  const { user, logout, refresh } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function renew(tier: "standard" | "enterprise") {
    setBusy(tier);
    setErr(null);
    try {
      await api.post("/subscriptions/activate", { tier });
      await refresh();
    } catch {
      setErr("Could not renew. Try again or contact support.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen landing-vibrant flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full rounded-3xl border border-white/15 bg-slate-950/70 backdrop-blur-xl p-8 shadow-[0_0_80px_-20px_rgba(217,70,239,0.5)] text-center space-y-6">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-2xl shadow-lg">
          ⏸
        </div>
        <h1 className="font-display text-2xl font-bold text-white">
          Your access is paused
        </h1>
        <p className="text-slate-300 text-sm leading-relaxed">
          {user?.app_access_message ||
            "Your plan or free quota no longer includes access to the practice app."}
        </p>
        <p className="text-slate-500 text-xs">
          Sign in is still active so you can renew below. After renewing, your dashboard will open
          again immediately (demo billing — no card).
        </p>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void renew("standard")}
            className="px-5 py-3 rounded-2xl font-semibold text-white bg-gradient-to-r from-fuchsia-600 to-violet-600 shadow-lg disabled:opacity-50"
          >
            {busy === "standard" ? "…" : "Renew Standard ($20/mo demo)"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void renew("enterprise")}
            className="px-5 py-3 rounded-2xl font-semibold text-white bg-gradient-to-r from-cyan-600 to-violet-600 shadow-lg disabled:opacity-50"
          >
            {busy === "enterprise" ? "…" : "Renew Enterprise ($100/mo demo)"}
          </button>
        </div>
        <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row gap-3 justify-center text-sm">
          <Link to="/#pricing" className="text-cyan-400 font-medium hover:underline">
            View plans on homepage
          </Link>
          <button
            type="button"
            onClick={() => logout()}
            className="text-slate-400 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
