import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { api, setToken } from '../api'
import { postAuthDestination } from '../authPaths'

export default function Login() {
  const nav = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setErr('')
    try {
      const { access_token } = await api.login(email, password)
      setToken(access_token)
      const me = await api.me()
      const fromPath = location.state?.from?.pathname
      nav(postAuthDestination(fromPath, me.role), { replace: true })
    } catch (x) {
      setErr(x.message)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <Link to="/" className="mb-6 inline-flex text-sm font-medium text-slate-500 hover:text-indigo-400">
        ← Back to home
      </Link>
      <h1 className="mb-2 text-2xl font-semibold text-white">Sign in</h1>
      <p className="mb-6 text-sm text-slate-400">AI Interviewer — candidate or admin</p>
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div>
          <label className="mb-1 block text-left text-xs uppercase tracking-wide text-slate-500">Email</label>
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-left text-xs uppercase tracking-wide text-slate-500">Password</label>
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Continue
        </button>
        <p className="text-center text-sm text-slate-500">
          No account?{' '}
          <Link to="/register" state={location.state} className="text-indigo-400 hover:underline">
            Register as candidate
          </Link>
        </p>
      </form>
    </div>
  )
}
