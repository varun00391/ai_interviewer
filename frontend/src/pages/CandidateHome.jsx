import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, setToken } from '../api'

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export default function CandidateHome() {
  const nav = useNavigate()
  const fileRef = useRef(null)
  const startingRef = useRef(false)
  const recRef = useRef(null)

  const [jobTitle, setJobTitle] = useState('Software Engineer')
  const [rounds, setRounds] = useState(3)
  /** 'smart' = AI-planned rounds; 'focused' = candidate picks HR / technical / managerial (fixed order). */
  const [trackMode, setTrackMode] = useState('smart')
  const [pickHr, setPickHr] = useState(true)
  const [pickTech, setPickTech] = useState(true)
  const [pickMgv, setPickMgv] = useState(true)
  const [list, setList] = useState([])
  const [sidebarError, setSidebarError] = useState('')
  const [mainError, setMainError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [resumeOnFile, setResumeOnFile] = useState(false)
  const [parsedPreview, setParsedPreview] = useState('')
  const [listenEpoch, setListenEpoch] = useState(0)
  const [starting, setStarting] = useState(false)
  const [listening, setListening] = useState(false)

  const refreshInterviews = useCallback(() => {
    api
      .myInterviews()
      .then(setList)
      .catch(() => setList([]))
  }, [])

  useEffect(() => {
    api
      .me()
      .then((u) => {
        if (u.has_resume) setResumeOnFile(true)
      })
      .catch(() => {})
    refreshInterviews()
  }, [refreshInterviews])

  const buildFocusedRoundKinds = useCallback(() => {
    const out = []
    if (pickHr) out.push('hr_screening')
    if (pickTech) out.push('technical')
    if (pickMgv) out.push('managerial')
    return out
  }, [pickHr, pickTech, pickMgv])

  const beginInterviewFlow = useCallback(async () => {
    if (startingRef.current) return
    startingRef.current = true
    try {
      recRef.current?.stop?.()
    } catch {
      /* */
    }
    setMainError('')
    setStarting(true)
    try {
      let inv
      if (trackMode === 'focused') {
        const kinds = buildFocusedRoundKinds()
        if (kinds.length === 0) {
          setMainError('Choose at least one round type (HR, technical, or managerial).')
          return
        }
        inv = await api.createInterview(jobTitle, null, kinds)
      } else {
        inv = await api.createInterview(jobTitle, rounds)
      }
      const sorted = [...(inv.rounds || [])].sort((a, b) => a.round_number - b.round_number)
      const r1 = sorted[0]
      if (!r1) {
        setMainError('Interview was created but no round was found.')
        return
      }
      refreshInterviews()
      nav(`/interview/${inv.id}/round/${r1.id}`)
    } catch (e) {
      setMainError(e.message || 'Could not start interview')
    } finally {
      setStarting(false)
      startingRef.current = false
    }
  }, [jobTitle, rounds, trackMode, buildFocusedRoundKinds, nav, refreshInterviews])

  useEffect(() => {
    if (!resumeOnFile) return
    const SR = getSpeechRecognition()
    if (!SR) return

    let cancelled = false
    const rec = new SR()
    recRef.current = rec
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.maxAlternatives = 1

    const onResult = (e) => {
      if (!e.results?.length) return
      const t = (e.results[e.results.length - 1][0]?.transcript || '').toLowerCase().trim()
      if (/\b(yes|yeah|yep|sure|start|begin|go|okay|ok|let's go|lets go)\b/.test(t)) {
        try {
          rec.stop()
        } catch {
          /* */
        }
        beginInterviewFlow()
      }
    }

    rec.onresult = onResult
    rec.onerror = () => setListening(false)
    rec.onend = () => {
      if (!cancelled) setListening(false)
    }

    setListening(true)
    try {
      rec.start()
    } catch {
      setListening(false)
    }

    return () => {
      cancelled = true
      setListening(false)
      rec.onresult = null
      try {
        rec.stop()
      } catch {
        /* */
      }
      recRef.current = null
    }
  }, [resumeOnFile, listenEpoch, beginInterviewFlow])

  function logout() {
    try {
      recRef.current?.stop?.()
    } catch {
      /* */
    }
    setToken(null)
    nav('/login')
  }

  async function onFileChange(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setSidebarError('')
    setUploading(true)
    try {
      const r = await api.uploadResumeFile(f)
      setResumeOnFile(true)
      setParsedPreview((r.parsed_preview || '').slice(0, 400))
      setListenEpoch((x) => x + 1)
    } catch (err) {
      setSidebarError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const canStart = (r) => r.status === 'scheduled'

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800 bg-slate-900/95 p-4">
        <div>
          <h1 className="text-lg font-semibold text-white">Candidate</h1>
          <p className="mt-1 text-xs text-slate-500">Resume in sidebar → start interview in main area</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold tracking-tight text-slate-100">Résumé</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            PDF or Word{' '}
            <span className="font-medium text-slate-200">.pdf</span>
            {' · '}
            <span className="font-medium text-slate-200">.docx</span>
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="mt-3 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-950/40 transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {uploading ? 'Analyzing…' : 'Upload file'}
          </button>
        </div>

        {sidebarError && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-300">{sidebarError}</p>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">Interview target</h2>
          <label className="mt-2 block text-xs text-slate-500">Role</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />

          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">Interview track</p>
          <div className="mt-2 space-y-2">
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
              <input
                type="radio"
                name="track"
                checked={trackMode === 'smart'}
                onChange={() => setTrackMode('smart')}
                className="mt-1"
              />
              <span>
                <span className="text-slate-200">Smart multi-round</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  AI plans rounds from your résumé (count below).
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
              <input
                type="radio"
                name="track"
                checked={trackMode === 'focused'}
                onChange={() => setTrackMode('focused')}
                className="mt-1"
              />
              <span>
                <span className="text-slate-200">Choose rounds</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  e.g. technical only, managerial only, or any combination (order: HR → technical → managerial).
                </span>
              </span>
            </label>
          </div>

          {trackMode === 'smart' && (
            <>
              <label className="mt-3 block text-xs text-slate-500">Number of rounds</label>
              <input
                type="number"
                min={1}
                max={6}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
              />
            </>
          )}

          {trackMode === 'focused' && (
            <div className="mt-3 space-y-2 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
              {[
                ['HR / screening', pickHr, () => setPickHr((v) => !v)],
                ['Technical', pickTech, () => setPickTech((v) => !v)],
                ['Managerial / leadership', pickMgv, () => setPickMgv((v) => !v)],
              ].map(([label, on, toggle]) => (
                <label key={label} className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={on} onChange={toggle} className="rounded border-slate-600" />
                  {label}
                </label>
              ))}
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-800 pt-2">
                <span className="w-full text-[10px] uppercase text-slate-600">Quick</span>
                <button
                  type="button"
                  className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-800"
                  onClick={() => {
                    setPickHr(true)
                    setPickTech(false)
                    setPickMgv(false)
                  }}
                >
                  HR only
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-800"
                  onClick={() => {
                    setPickHr(false)
                    setPickTech(true)
                    setPickMgv(false)
                  }}
                >
                  Technical only
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-800"
                  onClick={() => {
                    setPickHr(false)
                    setPickTech(false)
                    setPickMgv(true)
                  }}
                >
                  Managerial only
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-800"
                  onClick={() => {
                    setPickHr(true)
                    setPickTech(true)
                    setPickMgv(true)
                  }}
                >
                  All three
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Camera and microphone turn on only after you confirm the interview in the main area.
        </p>

        <div className="mt-auto border-t border-slate-800 pt-4">
          <button type="button" onClick={logout} className="text-sm text-slate-500 hover:text-white">
            Log out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-6 md:p-10">
        <div className="mx-auto max-w-2xl">
          {!resumeOnFile && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
              <h2 className="text-xl font-medium text-white">Welcome</h2>
              <p className="mt-3 text-sm text-slate-400">
                Upload your résumé in the <strong className="text-slate-300">left sidebar</strong> (PDF or Word). We will
                extract and analyze it, then ask if you want to begin the live voice interview with your camera.
              </p>
            </div>
          )}

          {resumeOnFile && (
            <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-indigo-950/40 to-slate-900/40 p-8 shadow-xl">
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-400">Résumé analyzed</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Start your interview?</h2>
              <p className="mt-2 text-sm text-slate-400">
                If you say <strong className="text-slate-200">yes</strong> or <strong className="text-slate-200">start</strong>{' '}
                {getSpeechRecognition() ? '(we are listening)' : '(voice not available in this browser — use the button)'}, or
                tap the button below, we will turn on your camera and the AI interviewer will begin with voice.
              </p>
              {parsedPreview && (
                <div className="mt-4 rounded-lg border border-slate-700/80 bg-slate-950/50 p-3 text-left">
                  <p className="text-xs uppercase text-slate-500">Preview</p>
                  <p className="mt-1 text-sm text-slate-400 line-clamp-6">{parsedPreview}…</p>
                </div>
              )}
              {listening && getSpeechRecognition() && (
                <p className="mt-4 flex items-center gap-2 text-sm text-emerald-400">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Listening for “yes” or “start”…
                </p>
              )}
              {mainError && (
                <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {mainError}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={starting}
                  onClick={beginInterviewFlow}
                  className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-indigo-500 disabled:opacity-50"
                >
                  {starting ? 'Starting…' : 'Yes — start interview'}
                </button>
                <p className="self-center text-xs text-slate-500">
                  Uses role and track (smart count or chosen rounds) from the sidebar.
                </p>
              </div>
            </div>
          )}

          {list.length > 0 && (
            <section className="mt-12">
              <h2 className="mb-3 text-lg font-medium text-white">Your interviews</h2>
              <ul className="space-y-3">
                {list.map((inv) => {
                  const startRound = inv.rounds?.find((r) => canStart(r))
                  return (
                    <li key={inv.id} className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-white">
                          #{inv.id} — {inv.job_title}
                        </span>
                        <span className="text-xs uppercase text-slate-500">{inv.status}</span>
                      </div>
                      <ul className="mt-2 text-sm text-slate-400">
                        {inv.rounds?.map((r) => (
                          <li key={r.id}>
                            R{r.round_number}: {r.title}
                            {r.round_kind && r.round_kind !== 'general' ? (
                              <span className="text-indigo-400/90"> ({r.round_kind.replace(/_/g, ' ')})</span>
                            ) : null}{' '}
                            — {r.status}
                            {r.score != null ? ` (score ${r.score})` : ''}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {startRound && (
                          <Link
                            to={`/interview/${inv.id}/round/${startRound.id}`}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
                          >
                            Continue voice &amp; camera
                          </Link>
                        )}
                        <Link
                          to={`/report/${inv.id}`}
                          className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
                        >
                          Report
                        </Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
