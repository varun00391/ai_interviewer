import { Link } from "react-router-dom";

const pricing = [
  {
    id: "free" as const,
    name: "Free",
    price: "$0",
    period: "forever",
    accent: "from-slate-600 to-slate-800",
    border: "border-white/10",
    glow: "shadow-slate-500/20",
    points: [
      "3 practice interviews total",
      "HR, Technical & Managerial rounds",
      "Voice, camera & feedback",
    ],
    cta: "Start free",
    href: "/register?plan=free",
  },
  {
    id: "standard" as const,
    name: "Standard",
    price: "$20",
    period: "per month",
    accent: "from-fuchsia-500 via-violet-500 to-purple-600",
    border: "border-fuchsia-400/40",
    glow: "shadow-fuchsia-500/40",
    popular: true,
    points: [
      "3 interviews every day",
      "Full access to all round types",
      "Best for regular job seekers",
    ],
    cta: "Choose Standard",
    href: "/register?plan=standard",
  },
  {
    id: "enterprise" as const,
    name: "Enterprise",
    price: "$100",
    period: "per month",
    accent: "from-cyan-400 via-sky-500 to-violet-600",
    border: "border-cyan-400/40",
    glow: "shadow-cyan-500/35",
    points: [
      "20 interviews every day",
      "For teams & bootcamps",
      "Same AI depth & integrity tools",
    ],
    cta: "Choose Enterprise",
    href: "/register?plan=enterprise",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen landing-vibrant text-white overflow-x-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(217,70,239,0.35),transparent)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(34,211,238,0.2),transparent)] pointer-events-none" />

      <header className="relative max-w-6xl mx-auto px-6 py-8 flex items-center justify-between z-10">
        <div className="font-display font-bold text-xl tracking-tight bg-gradient-to-r from-white via-fuchsia-200 to-cyan-200 bg-clip-text text-transparent">
          InterviewAI
        </div>
        <div className="flex gap-3 text-sm items-center">
          <Link
            to="/login"
            className="px-4 py-2 rounded-full text-slate-300 hover:text-white border border-white/10 hover:border-white/30 transition"
          >
            Sign in
          </Link>
          <Link
            to="/register?plan=free"
            className="px-5 py-2.5 rounded-full font-semibold bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-lg shadow-fuchsia-500/30 hover:brightness-110 transition"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-6 pb-24 pt-4 z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-fuchsia-300/90 mb-4">
            Practice without pressure
          </p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] mb-6">
            <span className="bg-gradient-to-r from-white via-fuchsia-100 to-cyan-200 bg-clip-text text-transparent">
              Interviews that feel real.
            </span>
            <br />
            <span className="text-slate-300 text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold">
              Out loud. On camera. With honest feedback.
            </span>
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Upload your resume, pick your role, and run HR, Technical, and Managerial rounds with a
            voice AI. Pick a plan that matches how often you want to practice.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mt-10">
            <Link
              to="/register?plan=free"
              className="px-8 py-3.5 rounded-2xl font-semibold bg-white text-slate-900 shadow-xl shadow-white/10 hover:scale-[1.02] transition"
            >
              Try free
            </Link>
            <a
              href="#pricing"
              className="px-8 py-3.5 rounded-2xl font-semibold border-2 border-fuchsia-400/50 text-fuchsia-100 hover:bg-fuchsia-500/10 transition"
            >
              See plans
            </a>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center mb-24">
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-tr from-fuchsia-600/30 to-cyan-500/20 blur-3xl rounded-[2rem]" />
            <div className="relative rounded-3xl border border-white/10 bg-slate-950/50 backdrop-blur-xl p-8 space-y-5">
              <h2 className="font-display text-xl font-semibold text-white">
                What you will experience
              </h2>
              <ul className="space-y-4 text-slate-400">
                <li className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-gradient-to-r from-fuchsia-400 to-violet-400 shrink-0 shadow shadow-fuchsia-400/50" />
                  <span>
                    <strong className="text-white">HR round</strong> — motivation, teamwork, how
                    you work with people.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-gradient-to-r from-cyan-400 to-sky-400 shrink-0 shadow shadow-cyan-400/50" />
                  <span>
                    <strong className="text-white">Technical round</strong> — role-fit questions,
                    code editor & whiteboard.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 shrink-0" />
                  <span>
                    <strong className="text-white">Managerial round</strong> — leadership,
                    trade-offs, priorities.
                  </span>
                </li>
              </ul>
              <div className="rounded-2xl bg-gradient-to-br from-fuchsia-500/10 to-cyan-500/10 border border-white/10 p-4 text-sm text-slate-300">
                Fair integrity checks on camera help keep practice honest—severe signals can end a
                session, just like a real proctored interview.
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Tailored questions", "Built from your resume and target role."],
              ["Scores you can use", "Clear numbers plus what to improve next."],
              ["Voice + camera", "Natural turn-taking and optional video review."],
              ["Your pace", "One round or the full loop—your choice."],
            ].map(([t, b]) => (
              <div
                key={t}
                className="rounded-2xl border border-white/5 bg-slate-900/40 p-5 hover:border-fuchsia-500/30 transition"
              >
                <h3 className="font-display font-semibold text-white mb-2">{t}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{b}</p>
              </div>
            ))}
          </div>
        </div>

        <section id="pricing" className="scroll-mt-24">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-3">
              Pick your monthly rhythm
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Start free, then scale when you are interviewing actively. Limits reset each day for
              paid plans; renew monthly when your period ends.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {pricing.map((p) => (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-3xl border ${p.border} bg-slate-950/60 backdrop-blur-xl p-8 shadow-xl ${p.glow} ${
                  p.popular ? "md:-translate-y-2 ring-2 ring-fuchsia-400/30" : ""
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold uppercase tracking-wider px-4 py-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-lg">
                    Most popular
                  </span>
                )}
                <h3 className="font-display text-lg font-semibold text-white">{p.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold bg-gradient-to-r bg-clip-text text-transparent from-white to-slate-200">
                    {p.price}
                  </span>
                  <span className="text-slate-500 text-sm">/ {p.period}</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-slate-400 flex-1">
                  {p.points.map((x) => (
                    <li key={x} className="flex gap-2">
                      <span className="text-cyan-400 shrink-0">✓</span>
                      {x}
                    </li>
                  ))}
                </ul>
                <Link
                  to={p.href}
                  className={`mt-8 block text-center py-3.5 rounded-2xl font-semibold text-white bg-gradient-to-r ${p.accent} shadow-lg hover:brightness-110 hover:scale-[1.02] transition`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-slate-500 mt-10 max-w-2xl mx-auto">
            Subscription buttons take you to sign-up with the right plan. Paid tiers start a 30-day
            demo window in this build (no real card charge). After it ends, choose a plan again to
            keep daily limits.
          </p>
        </section>
      </main>

      <footer className="relative border-t border-white/5 py-10 text-center text-sm text-slate-500 z-10">
        InterviewAI helps you practice—not replace real hiring decisions.
      </footer>
    </div>
  );
}
