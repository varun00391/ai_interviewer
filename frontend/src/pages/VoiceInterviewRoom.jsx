import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import TechnicalRoundWorkspace from '../components/TechnicalRoundWorkspace'
import {
  averageEmbeddings,
  createFaceLandmarker,
  embeddingFromLandmarks,
} from '../lib/facePipeline'

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

/** Pause (ms) with no new speech before we treat the answer as complete and send it. */
const ANSWER_SILENCE_MS = 2400

export default function VoiceInterviewRoom() {
  const { interviewId, roundId } = useParams()
  const nav = useNavigate()
  const videoRef = useRef(null)
  const landmarkerRef = useRef(null)
  const sessionRef = useRef(null)
  const faceIntervalRef = useRef(null)
  const absentStreakRef = useRef(0)
  const lastIntegrityRef = useRef({})
  const recognitionRef = useRef(null)
  const speakingRef = useRef(false)
  const busyRef = useRef(false)
  const techWorkspaceRef = useRef(null)
  const speechBufferRef = useRef([])
  const silenceTimerRef = useRef(null)
  const listenFnRef = useRef(null)
  const questionCapReachedRef = useRef(false)

  const [phase, setPhase] = useState('intro') // intro | loading | enrolling | live | ending | done | error
  const [questionCapReached, setQuestionCapReached] = useState(false)
  const [statusLine, setStatusLine] = useState('')
  const [lines, setLines] = useState([])
  const [error, setError] = useState('')
  const [scores, setScores] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [roundMeta, setRoundMeta] = useState(null)

  const iid = Number(interviewId)
  const rid = Number(roundId)

  useEffect(() => {
    api
      .getInterview(iid)
      .then((inv) => {
        const r = inv.rounds?.find((x) => x.id === rid)
        setRoundMeta(r || null)
      })
      .catch(() => setRoundMeta(null))
  }, [iid, rid])

  const kindLabel =
    roundMeta?.round_kind === 'hr_screening'
      ? 'HR / screening'
      : roundMeta?.round_kind === 'technical'
        ? 'Technical'
        : roundMeta?.round_kind === 'managerial'
          ? 'Managerial / leadership'
          : roundMeta?.round_kind
            ? roundMeta.round_kind
            : null

  const isTechnical = roundMeta?.round_kind === 'technical'
  const useTechLayout = isTechnical && phase === 'live'

  const logIntegrity = useCallback(
    async (type, payload) => {
      const sid = sessionRef.current
      if (!sid) return
      const now = Date.now()
      if (lastIntegrityRef.current[type] && now - lastIntegrityRef.current[type] < 8000) return
      lastIntegrityRef.current[type] = now
      try {
        await api.integrityEvent(iid, rid, sid, type, payload)
      } catch {
        /* ignore */
      }
    },
    [iid, rid],
  )

  const speak = useCallback((text, onEnd) => {
    const SR = getSpeechRecognition()
    if (SR && recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        /* */
      }
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    speechBufferRef.current = []
    speakingRef.current = true
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1
    u.onend = () => {
      speakingRef.current = false
      onEnd?.()
    }
    u.onerror = () => {
      speakingRef.current = false
      onEnd?.()
    }
    window.speechSynthesis.speak(u)
  }, [])

  const appendLine = (role, content) => {
    setLines((prev) => [...prev, { role, content }])
  }

  const startListening = useCallback(() => {
    const SR = getSpeechRecognition()
    if (!SR || speakingRef.current || busyRef.current || questionCapReachedRef.current) return
    speechBufferRef.current = []
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = 'en-US'
    recognitionRef.current = rec

    const flushAnswer = async () => {
      silenceTimerRef.current = null
      const full = speechBufferRef.current.join(' ').replace(/\s+/g, ' ').trim()
      speechBufferRef.current = []
      if (!full || speakingRef.current || busyRef.current) return
      busyRef.current = true
      try {
        try {
          rec.stop()
        } catch {
          /* */
        }
        appendLine('candidate', full)
        const res = await api.sendMessage(iid, rid, sessionRef.current, full)
        appendLine('interviewer', res.reply)
        if (res.question_limit_reached) {
          questionCapReachedRef.current = true
          setQuestionCapReached(true)
        }
        speak(res.reply, () => {
          busyRef.current = false
          if (!res.question_limit_reached) {
            window.setTimeout(() => listenFnRef.current?.(), 400)
          }
        })
      } catch (err) {
        setError(err.message || 'Message failed')
        busyRef.current = false
      }
    }

    rec.onresult = (e) => {
      let said = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) said += e.results[i][0].transcript
      }
      const chunk = said.trim()
      if (!chunk || speakingRef.current || busyRef.current) return
      speechBufferRef.current.push(chunk)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = window.setTimeout(flushAnswer, ANSWER_SILENCE_MS)
    }
    rec.onerror = () => {
      /* noisy in some browsers */
    }
    try {
      rec.start()
    } catch {
      /* */
    }
  }, [iid, rid, speak])

  useEffect(() => {
    listenFnRef.current = startListening
  }, [startListening])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden' && sessionRef.current) {
        logIntegrity('tab_blur', { at: new Date().toISOString() })
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [logIntegrity])

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel()
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current)
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          /* */
        }
      }
      landmarkerRef.current?.close?.()
      const v = videoRef.current?.srcObject
      if (v) {
        v.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  async function runSetup() {
    questionCapReachedRef.current = false
    setQuestionCapReached(false)
    setError('')
    setPhase('loading')
    setStatusLine('Requesting camera and microphone…')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      })
    } catch {
      setPhase('error')
      setError('Camera and microphone access is required for this interview.')
      return
    }
    const video = videoRef.current
    if (video) {
      video.srcObject = stream
      await video.play().catch(() => {})
    }

    setStatusLine('Loading face analysis (MediaPipe)…')
    let landmarker
    try {
      landmarker = await createFaceLandmarker()
      landmarkerRef.current = landmarker
    } catch (e) {
      setPhase('error')
      setError(`Face model failed to load: ${e.message}. Use HTTPS or try Chrome.`)
      stream.getTracks().forEach((t) => t.stop())
      return
    }

    setPhase('enrolling')
    setStatusLine('Hold still — capturing your face for identity check…')
    const samples = []
    const start = performance.now()
    while (performance.now() - start < 3500 && samples.length < 30) {
      if (video.readyState >= 2) {
        const r = landmarker.detectForVideo(video, performance.now())
        const lm = r.faceLandmarks?.[0]
        const emb = embeddingFromLandmarks(lm)
        if (emb) samples.push(emb)
      }
      await new Promise((r) => requestAnimationFrame(r))
    }
    const avg = averageEmbeddings(samples)
    if (!avg) {
      setPhase('error')
      setError('Could not detect a face. Ensure good lighting and center your face.')
      stream.getTracks().forEach((t) => t.stop())
      landmarker.close()
      return
    }
    try {
      await api.enrollFace({ embedding: avg })
    } catch (e) {
      setPhase('error')
      setError(e.message)
      return
    }

    setStatusLine('Starting interview session…')
    try {
      const s = await api.startSession(iid, rid)
      sessionRef.current = s.session_id
      setSessionId(s.session_id)
    } catch (e) {
      setPhase('error')
      setError(e.message)
      return
    }

    faceIntervalRef.current = setInterval(async () => {
      const videoEl = videoRef.current
      const lm = landmarkerRef.current
      const sid = sessionRef.current
      if (!videoEl || !lm || !sid || videoEl.readyState < 2) return
      const r = lm.detectForVideo(videoEl, performance.now())
      const n = r.faceLandmarks?.length ?? 0
      if (n === 0) {
        absentStreakRef.current += 1
        if (absentStreakRef.current >= 4) {
          logIntegrity('face_absent', { streak: absentStreakRef.current })
          absentStreakRef.current = 0
        }
      } else {
        absentStreakRef.current = 0
      }
      if (n > 1) {
        logIntegrity('multiple_faces', { count: n })
      }
      const primary = r.faceLandmarks?.[0]
      const emb = embeddingFromLandmarks(primary)
      if (emb) {
        try {
          await api.faceCheck(iid, rid, sid, { embedding: emb })
        } catch {
          /* */
        }
      }
    }, 1600)

    setPhase('live')
    setStatusLine(
      getSpeechRecognition()
        ? 'After each question, answer in full—we only send your reply after you pause for about 2 seconds, so you are not cut off mid-sentence.'
        : 'Use the text field to answer after each question.',
    )
    busyRef.current = true
    try {
      const first = await api.sendMessage(iid, rid, sessionRef.current, '')
      appendLine('interviewer', first.reply)
      if (first.question_limit_reached) {
        questionCapReachedRef.current = true
        setQuestionCapReached(true)
      }
      speak(first.reply, () => {
        busyRef.current = false
        if (getSpeechRecognition() && !first.question_limit_reached) {
          window.setTimeout(() => startListening(), 400)
        }
      })
    } catch (e) {
      busyRef.current = false
      setError(e.message)
    }
  }

  async function endInterview() {
    setPhase('ending')
    setStatusLine('Evaluating your performance…')
    window.speechSynthesis.cancel()
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    speechBufferRef.current = []
    if (faceIntervalRef.current) {
      clearInterval(faceIntervalRef.current)
      faceIntervalRef.current = null
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        /* */
      }
    }
    landmarkerRef.current?.close?.()
    const v = videoRef.current?.srcObject
    if (v) v.getTracks().forEach((t) => t.stop())

    const sid = sessionRef.current
    if (!sid) {
      nav('/candidate')
      return
    }
    try {
      let endPayload = {}
      if (isTechnical && techWorkspaceRef.current?.getSnapshot) {
        const snap = techWorkspaceRef.current.getSnapshot()
        endPayload = {
          technical_code_snapshot: snap.code_snapshot || '',
          whiteboard_was_used: !!snap.whiteboard_was_used,
        }
      }
      const out = await api.endSession(iid, rid, sid, endPayload)
      setScores(out)
      setPhase('done')
      setStatusLine(
        out.passed ? 'You passed this round. Open the next round from your dashboard when ready.' : 'This round is complete.',
      )
    } catch (e) {
      setError(e.message)
      setPhase('error')
    }
  }

  const videoShellClass =
    'overflow-hidden rounded-2xl border border-slate-800 bg-black aspect-video ' +
    (useTechLayout ? 'max-h-[260px] w-full shrink-0' : 'max-h-[360px]')

  return (
    <div
      className={`mx-auto flex min-h-screen flex-col px-4 py-6 text-left ${useTechLayout ? 'max-w-7xl' : 'max-w-3xl'}`}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link to="/candidate" className="text-sm text-slate-400 hover:text-white">
          ← Dashboard
        </Link>
        {phase === 'live' && (
          <button
            type="button"
            onClick={endInterview}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-500"
          >
            End &amp; get scores
          </button>
        )}
      </div>

      <h1 className="text-xl font-semibold text-white">
        {isTechnical ? 'Technical interview — code, whiteboard &amp; voice' : 'Conversation round — camera &amp; voice'}
      </h1>
      {roundMeta && (
        <p className="mt-2 text-sm text-indigo-300">
          {roundMeta.title}
          {kindLabel && <span className="text-slate-400"> · {kindLabel}</span>}
        </p>
      )}
      {roundMeta?.focus_areas_json?.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          Focus: {roundMeta.focus_areas_json.join(' · ')}
        </p>
      )}
      <p className="mt-2 text-sm text-slate-500">
        {isTechnical ? (
          <>
            After you start, you will see a <strong className="text-slate-400">Python editor</strong> (runs in your
            browser) and a <strong className="text-slate-400">whiteboard</strong> beside the camera and live transcript.
            When you end the round, your <strong className="text-slate-400">last code in the editor</strong> is sent for
            scoring; the whiteboard is a <strong className="text-slate-400">use / no-use</strong> flag only (drawings are
            not vision-analyzed—explain diagrams aloud). Discuss your solution in voice while you code or sketch.
          </>
        ) : (
          <>
            This round is a live conversation: camera for presence and identity checks, transcript of what you say, and
            back-and-forth with the AI interviewer. Your résumé context is already loaded. Use Chrome or Edge for best
            speech support.
          </>
        )}
      </p>

      {error && <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

      <div
        className={`mt-4 ${useTechLayout ? 'grid flex-1 gap-6 lg:grid-cols-2 lg:items-start' : ''}`}
      >
        <div className="flex min-w-0 flex-col gap-3">
          <div className={videoShellClass}>
            <video ref={videoRef} className="h-full w-full object-cover mirror" playsInline muted />
          </div>
          <style>{`.mirror { transform: scaleX(-1); }`}</style>

          {phase === 'intro' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">
                We will use your camera to verify you are present and to compare against the face captured at the start
                of this session. Leaving the tab or showing multiple people may be flagged.
              </p>
              {!getSpeechRecognition() && (
                <p className="text-sm text-amber-300">
                  Speech recognition is not available in this browser. Use Chrome on desktop, or type answers in the
                  backup field below after starting.
                </p>
              )}
              <button
                type="button"
                onClick={runSetup}
                className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Allow camera &amp; mic and begin
              </button>
            </div>
          )}

          {(phase === 'loading' || phase === 'enrolling' || phase === 'ending') && (
            <p className="animate-pulse text-sm text-indigo-300">{statusLine}</p>
          )}
          {phase === 'live' && (
            <div className="text-sm text-slate-400">
              <p>{statusLine}</p>
              {questionCapReached && (
                <p className="mt-2 font-medium text-emerald-400/95">
                  All planned questions for this round are complete. Tap End and get scores when you are ready.
                </p>
              )}
            </div>
          )}

          {phase === 'live' && !getSpeechRecognition() && (
            <TypeFallback
              iid={iid}
              rid={rid}
              sid={sessionId}
              onExchange={(userText, reply, limitReached) => {
                appendLine('candidate', userText)
                appendLine('interviewer', reply)
                if (limitReached) {
                  questionCapReachedRef.current = true
                  setQuestionCapReached(true)
                }
                speak(reply, () => {})
              }}
            />
          )}

          <Transcript lines={lines} compact={useTechLayout} />
        </div>

        {useTechLayout && (
          <aside className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
            <TechnicalRoundWorkspace ref={techWorkspaceRef} />
          </aside>
        )}
      </div>

      {phase === 'done' && scores && (
        <div className="mt-6 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-sm">
          <h2 className="mb-2 font-medium text-white">Your results (this round)</h2>
          <p className="text-slate-300">
            Overall score: <strong>{scores.score ?? '—'}</strong> —{' '}
            {scores.passed ? 'Passed' : 'Did not pass'}
          </p>
          {scores.scores_breakdown?.answer_quality && (
            <p className="mt-2 text-slate-400">
              Answer quality: <span className="text-indigo-300">{scores.scores_breakdown.answer_quality}</span>
            </p>
          )}
          {scores.scores_breakdown?.calibration_note && (
            <p className="mt-1 text-xs text-amber-200/90">{scores.scores_breakdown.calibration_note}</p>
          )}
          {scores.scores_breakdown?.parameter_scores && (
            <ul className="mt-3 space-y-1 text-slate-400">
              {Object.entries(scores.scores_breakdown.parameter_scores).map(([k, v]) => (
                <li key={k}>
                  <span className="capitalize text-slate-300">{k.replace(/_/g, ' ')}</span>:{' '}
                  {typeof v === 'object' && v !== null ? (
                    <>
                      {v.score ?? v} {v.note ? `— ${v.note}` : v.brief ? `— ${v.brief}` : ''}
                    </>
                  ) : (
                    String(v)
                  )}
                </li>
              ))}
            </ul>
          )}
          {scores.scores_breakdown?.integrity_comment && (
            <p className="mt-3 text-xs text-slate-500">{scores.scores_breakdown.integrity_comment}</p>
          )}
          <button
            type="button"
            onClick={() => nav(`/report/${iid}`)}
            className="mt-4 rounded-lg border border-slate-600 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
          >
            Full report
          </button>
        </div>
      )}
    </div>
  )
}

function Transcript({ lines, compact }) {
  return (
    <div
      className={
        compact
          ? 'mt-1 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/40 p-3 lg:max-h-72'
          : 'mt-1 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/40 p-3'
      }
    >
      {lines.map((l, i) => (
        <div key={i} className="text-sm">
          <span className="text-xs uppercase text-slate-500">{l.role}</span>
          <p className="text-slate-200">{l.content}</p>
        </div>
      ))}
    </div>
  )
}

function TypeFallback({ iid, rid, sid, onExchange }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  if (!sid) return null
  return (
    <div className="mt-3 flex gap-2">
      <input
        className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        placeholder="Type your answer if voice is unavailable…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        onKeyDown={async (e) => {
          if (e.key !== 'Enter' || !text.trim() || busy) return
          setBusy(true)
          const t = text.trim()
          setText('')
          try {
            const res = await api.sendMessage(iid, rid, sid, t)
            onExchange(t, res.reply, !!res.question_limit_reached)
          } finally {
            setBusy(false)
          }
        }}
      />
    </div>
  )
}
