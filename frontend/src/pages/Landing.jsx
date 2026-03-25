import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

function Reveal({ children, className = '', delayMs = 0 }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setShown(true)
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delayMs}ms` : '0ms' }}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  )
}

const features = [
  {
    title: 'Resume-aware interviews',
    body: 'Upload PDF or Word. The AI reads your background and tailors HR, technical, and managerial rounds to your role.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
    ),
  },
  {
    title: 'Voice & presence',
    body: 'Natural back-and-forth with speech. Camera supports presence checks and a consistent interview experience.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
        />
      </svg>
    ),
  },
  {
    title: 'Technical workspace',
    body: 'For engineering rounds: in-browser Python practice, a sketch whiteboard, and code snapshots for fairer evaluation.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
        />
      </svg>
    ),
  },
  {
    title: 'Scores & reports',
    body: 'Structured rubrics, engagement-aware calibration, and a written report you can revisit after each round.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
        />
      </svg>
    ),
  },
]

const plans = [
  {
    name: 'Starter',
    price: 'Free',
    period: 'for individuals',
    description: 'Try the full flow on your own schedule—perfect for practice and demos.',
    features: ['1 active interview track', 'PDF / DOCX resume upload', 'Voice + camera rounds', 'Basic round report'],
    cta: 'Create account',
    href: '/register',
    highlighted: false,
  },
  {
    name: 'Professional',
    price: '$29',
    period: '/ month',
    description: 'Everything candidates need to run realistic multi-round interviews and keep history.',
    features: [
      'Smart AI-planned or custom round tracks',
      'HR, technical & managerial styles',
      'Technical editor + whiteboard capture',
      'Detailed scoring & calibration notes',
    ],
    cta: 'Get started',
    href: '/register',
    highlighted: true,
  },
  {
    name: 'Team',
    price: 'Custom',
    period: 'contact sales',
    description: 'For hiring teams: coordinate invites, monitor activity, and align on rubrics.',
    features: ['Admin dashboard & scheduling hooks', 'Bulk candidate onboarding', 'Priority support', 'SSO & data retention (roadmap)'],
    cta: 'Sign in as admin',
    href: '/login',
    highlighted: false,
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#07080d] text-slate-200">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-1/4 top-0 h-[520px] w-[720px] rounded-full bg-indigo-600/25 blur-[120px]" />
        <div className="absolute -right-1/4 top-1/3 h-[480px] w-[640px] rounded-full bg-violet-600/20 blur-[100px]" />
        <div className="absolute bottom-0 left-1/3 h-[360px] w-[600px] rounded-full bg-cyan-500/10 blur-[90px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2394a3b8' fill-opacity='0.06'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <header className="relative z-10 border-b border-white/5 bg-[#07080d]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
              AI
            </span>
            <span className="text-sm font-semibold tracking-tight text-white sm:text-base">Interviewer</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-400 md:flex">
            <a href="#product" className="transition hover:text-white">
              Product
            </a>
            <a href="#features" className="transition hover:text-white">
              Features
            </a>
            <a href="#pricing" className="transition hover:text-white">
              Plans
            </a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white sm:px-4"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:from-indigo-400 hover:to-violet-500 sm:px-4"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section id="product" className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:px-8 lg:pt-28">
          <Reveal>
            <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400/90">
              Voice-first hiring practice
            </p>
            <h1 className="mx-auto mt-5 max-w-4xl text-center text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Interview with an AI that actually{' '}
              <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-cyan-200 bg-clip-text text-transparent">
                reads your resume
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-relaxed text-slate-400 sm:text-xl">
              Run realistic HR, technical, and managerial rounds from your browser. Speak naturally, show your work, and
              get structured feedback—not generic chatbot small talk.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-4">
              <Link
                to="/register"
                className="inline-flex w-full items-center justify-center rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-slate-900 shadow-xl transition hover:bg-slate-100 sm:w-auto"
              >
                Create free account
              </Link>
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:border-white/25 hover:bg-white/10 sm:w-auto"
              >
                I already have an account
              </Link>
            </div>
            <p className="mt-6 text-center text-xs text-slate-500">
              Candidates sign up here · Admins use the seeded account from your deployment docs
            </p>
          </Reveal>
        </section>

        <section id="features" className="border-t border-white/5 bg-black/20 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">Built for real interviews</h2>
              <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
                Every piece of the experience is designed around how hiring actually works—not a toy Q&amp;A widget.
              </p>
            </Reveal>
            <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f, i) => (
                <Reveal key={f.title} className="h-full" delayMs={i * 80}>
                  <div className="group h-full rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-transparent p-6 shadow-xl transition hover:border-indigo-500/30 hover:shadow-indigo-500/10">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300 transition group-hover:bg-indigo-500/25 group-hover:text-indigo-200">
                      {f.icon}
                    </div>
                    <h3 className="mt-5 text-lg font-bold text-white">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">Plans that scale with you</h2>
              <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
                Start free, upgrade when you want deeper practice or team workflows. Pricing shown is illustrative—wire
                your billing when you are ready to go live.
              </p>
            </Reveal>
            <div className="mt-16 grid gap-8 lg:grid-cols-3">
              {plans.map((p, i) => (
                <Reveal key={p.name} className="h-full" delayMs={i * 100}>
                  <div
                    className={`relative flex h-full flex-col rounded-2xl border p-8 ${
                      p.highlighted
                        ? 'border-indigo-500/50 bg-gradient-to-b from-indigo-500/10 to-violet-600/5 shadow-2xl shadow-indigo-500/10 ring-1 ring-indigo-500/20'
                        : 'border-white/10 bg-white/[0.03]'
                    }`}
                  >
                    {p.highlighted && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-lg">
                        Popular
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-white">{p.name}</h3>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold tracking-tight text-white">{p.price}</span>
                      <span className="text-sm text-slate-500">{p.period}</span>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-slate-400">{p.description}</p>
                    <ul className="mt-8 flex-1 space-y-3 text-sm text-slate-300">
                      {p.features.map((line) => (
                        <li key={line} className="flex gap-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </span>
                          {line}
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={p.href}
                      className={`mt-10 block w-full rounded-xl py-3.5 text-center text-sm font-bold transition ${
                        p.highlighted
                          ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30 hover:from-indigo-400 hover:to-violet-500'
                          : 'border border-white/15 bg-white/5 text-white hover:border-white/25 hover:bg-white/10'
                      }`}
                    >
                      {p.cta}
                    </Link>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/5 py-16">
          <Reveal>
            <div className="mx-auto max-w-3xl rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-transparent px-6 py-12 text-center sm:px-12">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready for your next round?</h2>
              <p className="mt-3 text-slate-400">Upload your resume, pick your track, and start when you are.</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-bold text-slate-900 hover:bg-slate-100"
                >
                  Create account
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5"
                >
                  Log in
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
              AI
            </span>
            <span className="text-sm font-semibold text-slate-300">Interviewer</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
            <a href="#product" className="hover:text-slate-300">
              Product
            </a>
            <a href="#pricing" className="hover:text-slate-300">
              Plans
            </a>
            <Link to="/login" className="hover:text-slate-300">
              Log in
            </Link>
            <Link to="/register" className="hover:text-slate-300">
              Register
            </Link>
          </div>
          <p className="text-center text-xs text-slate-600 sm:text-right">© {new Date().getFullYear()} AI Interviewer</p>
        </div>
      </footer>
    </div>
  )
}
