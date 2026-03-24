import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api'

export default function AdminDashboard() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [filterDate, setFilterDate] = useState('')
  const [err, setErr] = useState('')
  const [invite, setInvite] = useState({ interviewId: '', round: '1', email: '', slot: '' })

  useEffect(() => {
    load()
  }, [filterDate])

  async function load() {
    setErr('')
    try {
      const data = await api.adminInterviews(filterDate || undefined)
      setRows(data)
    } catch (e) {
      setErr(e.message)
    }
  }

  function logout() {
    setToken(null)
    nav('/login')
  }

  async function sendInvite() {
    setErr('')
    try {
      const slot = invite.slot ? new Date(invite.slot).toISOString() : null
      const res = await api.adminInvite(
        Number(invite.interviewId),
        Number(invite.round),
        invite.email,
        slot,
      )
      alert(`Invitation sent. Token: ${res.invitation_token}`)
      load()
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 text-left">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Admin</h1>
          <p className="text-sm text-slate-400">Scheduled interviews, results, invitations</p>
        </div>
        <button type="button" onClick={logout} className="text-sm text-slate-400 hover:text-white">
          Log out
        </button>
      </header>

      <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="mb-3 text-lg font-medium text-white">Filter by scheduled date (UTC)</h2>
        <input
          type="date"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setFilterDate('')}
          className="ml-2 text-sm text-indigo-400 hover:underline"
        >
          Clear
        </button>
      </section>

      <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="mb-3 text-lg font-medium text-white">Send round invitation</h2>
        <p className="mb-3 text-sm text-slate-400">
          After a candidate creates an interview, enter its ID from the table and their email.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            placeholder="Interview ID"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            value={invite.interviewId}
            onChange={(e) => setInvite({ ...invite, interviewId: e.target.value })}
          />
          <input
            placeholder="Round number"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            value={invite.round}
            onChange={(e) => setInvite({ ...invite, round: e.target.value })}
          />
          <input
            placeholder="Candidate email"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            value={invite.email}
            onChange={(e) => setInvite({ ...invite, email: e.target.value })}
          />
          <input
            type="datetime-local"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            value={invite.slot}
            onChange={(e) => setInvite({ ...invite, slot: e.target.value })}
          />
        </div>
        <button
          type="button"
          onClick={sendInvite}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Send email
        </button>
      </section>

      {err && <p className="mb-4 text-sm text-red-400">{err}</p>}

      <section>
        <h2 className="mb-3 text-lg font-medium text-white">All interviews</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Candidate</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Rounds</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-800">
                  <td className="px-3 py-2 font-mono text-indigo-300">{r.id}</td>
                  <td className="px-3 py-2">
                    <div className="text-white">{r.candidate_name || '—'}</div>
                    <div className="text-xs text-slate-500">{r.candidate_email}</div>
                  </td>
                  <td className="px-3 py-2">{r.job_title}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.rounds?.map((x) => (
                      <div key={x.id}>
                        R{x.round_number}: {x.status}
                        {x.score != null ? ` (${x.score})` : ''}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
