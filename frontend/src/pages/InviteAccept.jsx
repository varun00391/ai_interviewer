import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'

export default function InviteAccept() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    api
      .invitation(token)
      .then(setInfo)
      .catch((e) => setErr(e.message))
  }, [token])

  async function accept() {
    setErr('')
    setMsg('')
    try {
      await api.acceptInvitation(token)
      setMsg('Accepted. Sign in on the candidate panel to start the round.')
    } catch (e) {
      setErr(e.message)
    }
  }

  if (err && !info) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-red-400">{err}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-left">
      <h1 className="mb-2 text-2xl font-semibold text-white">Interview invitation</h1>
      {info && (
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-300">
          <p className="mb-2 text-xs uppercase text-slate-500">Status</p>
          <p className="text-white">{info.status}</p>
          {info.proposed_slot_utc && (
            <>
              <p className="mt-4 mb-2 text-xs uppercase text-slate-500">Proposed slot</p>
              <p>{info.proposed_slot_utc}</p>
            </>
          )}
          {info.email_body && (
            <>
              <p className="mt-4 mb-2 text-xs uppercase text-slate-500">Message</p>
              <pre className="whitespace-pre-wrap font-sans text-slate-400">{info.email_body}</pre>
            </>
          )}
        </div>
      )}
      {msg && <p className="mb-4 text-indigo-300">{msg}</p>}
      {err && <p className="mb-4 text-red-400">{err}</p>}
      {info?.status === 'sent' && (
        <button
          type="button"
          onClick={accept}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Accept &amp; schedule
        </button>
      )}
    </div>
  )
}
