import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'

function ParameterBlock({ breakdown }) {
  if (!breakdown?.parameter_scores) return null
  return (
    <ul className="mt-2 space-y-1 text-sm text-slate-400">
      {Object.entries(breakdown.parameter_scores).map(([k, v]) => (
        <li key={k}>
          <span className="capitalize text-slate-300">{k.replace(/_/g, ' ')}</span>:{' '}
          {typeof v === 'object' && v !== null ? (
            <>
              <strong className="text-indigo-300">{v.score ?? '—'}</strong>
              {(v.note || v.brief) && <span> — {v.note || v.brief}</span>}
            </>
          ) : (
            <strong className="text-indigo-300">{String(v)}</strong>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function Report() {
  const { interviewId } = useParams()
  const [md, setMd] = useState('')
  const [inv, setInv] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const id = Number(interviewId)
    Promise.all([api.report(id).catch(() => ({ markdown: '' })), api.getInterview(id).catch(() => null)])
      .then(([r, interview]) => {
        setMd(r.markdown || '')
        setInv(interview)
      })
      .catch((e) => setErr(e.message))
  }, [interviewId])

  const rounds = inv?.rounds ? [...inv.rounds].sort((a, b) => a.round_number - b.round_number) : []

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-left">
      <Link to="/candidate" className="text-sm text-slate-400 hover:text-white">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-white">Assessment report</h1>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}

      {rounds.length > 0 && (
        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-medium text-white">Scores by round</h2>
          {rounds.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-slate-200">
                  Round {r.round_number}: {r.title}
                  {r.round_kind && r.round_kind !== 'general' && (
                    <span className="ml-2 text-xs font-normal text-indigo-400">
                      ({r.round_kind.replace(/_/g, ' ')})
                    </span>
                  )}
                </span>
                <span className="text-sm text-slate-500">
                  {r.status}
                  {r.score != null ? ` · Overall ${r.score}` : ''}
                </span>
              </div>
              {r.focus_areas_json?.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">Focus areas: {r.focus_areas_json.join(' · ')}</p>
              )}
              {r.scores_breakdown_json?.answer_quality && (
                <p className="mt-2 text-sm text-slate-300">
                  Answer quality: <span className="text-indigo-300">{r.scores_breakdown_json.answer_quality}</span>
                </p>
              )}
              {r.scores_breakdown_json?.calibration_note && (
                <p className="mt-1 text-xs text-amber-200/90">{r.scores_breakdown_json.calibration_note}</p>
              )}
              <ParameterBlock breakdown={r.scores_breakdown_json} />
              {r.scores_breakdown_json?.integrity_comment && (
                <p className="mt-2 text-xs text-slate-500">{r.scores_breakdown_json.integrity_comment}</p>
              )}
            </div>
          ))}
        </section>
      )}

      {!md && !err && rounds.length === 0 && <p className="mt-4 text-slate-400">No report yet — complete a round first.</p>}
      {md && (
        <article className="mt-8 whitespace-pre-wrap rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm leading-relaxed text-slate-200">
          <h2 className="mb-3 text-lg font-medium text-white">Written summary</h2>
          {md}
        </article>
      )}
    </div>
  )
}
