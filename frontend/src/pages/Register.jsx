import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, setToken } from '../api'

export default function Register() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [err, setErr] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setErr('')
    try {
      await api.register(email, password, fullName)
      const { access_token } = await api.login(email, password)
      setToken(access_token)
      nav('/candidate')
    } catch (x) {
      setErr(x.message)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <Link to="/" className="mb-6 inline-flex text-sm font-medium text-slate-500 hover:text-indigo-400">
        ← Back to home
      </Link>
      <h1 className="mb-2 text-2xl font-semibold text-white">Create candidate account</h1>
      <p className="mb-6 text-sm text-slate-400">Admins sign in with the seeded account (see README).</p>
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div>
          <label className="mb-1 block text-left text-xs uppercase tracking-wide text-slate-500">Full name</label>
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
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
            minLength={6}
            required
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Register
        </button>
        <p className="text-center text-sm text-slate-500">
          <Link to="/login" className="text-indigo-400 hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </div>
  )
}
