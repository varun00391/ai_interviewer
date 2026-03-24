/** Base URL: full origin (e.g. http://127.0.0.1:8000) or path prefix (e.g. /api) for Docker nginx proxy. */
function getApiBase() {
  const v = import.meta.env.VITE_API_URL
  if (v === undefined || v === null || String(v).trim() === '') {
    return 'http://127.0.0.1:8000'
  }
  return String(v).replace(/\/$/, '')
}

const API = getApiBase()

export function getToken() {
  return localStorage.getItem('token')
}

export function setToken(t) {
  if (t) localStorage.setItem('token', t)
  else localStorage.removeItem('token')
}

function messageFromResponse(res, errJson) {
  const d = errJson?.detail
  if (Array.isArray(d)) {
    return d.map((x) => x.msg || JSON.stringify(x)).join('; ')
  }
  if (typeof d === 'string') return d
  if (res.status === 413) return 'File too large (max 8 MB on server; nginx allows up to 15 MB).'
  if (res.status === 401) return 'Not authenticated — sign in again.'
  if (res.status >= 500) return 'Server error while processing the file. Check backend logs.'
  return res.statusText || `Request failed (${res.status})`
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const t = getToken()
    if (t) headers.Authorization = `Bearer ${t}`
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(messageFromResponse(res, err))
  }
  if (res.status === 204) return null
  const ct = res.headers.get('content-type')
  if (ct && ct.includes('application/json')) return res.json()
  return res.text()
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  register: (email, password, full_name) =>
    request('/auth/register', { method: 'POST', body: { email, password, full_name }, auth: false }),
  me: () => request('/me'),
  uploadResumeFile: async (file) => {
    const form = new FormData()
    form.append('file', file)
    const headers = {}
    const t = getToken()
    if (t) headers.Authorization = `Bearer ${t}`
    let res
    try {
      res = await fetch(`${API}/me/resume/file`, { method: 'POST', headers, body: form })
    } catch (e) {
      const m = e?.message || ''
      const isNetwork = /failed to fetch|networkerror|load failed/i.test(m)
      throw new Error(
        isNetwork
          ? 'Cannot reach the API. With Docker, use VITE_API_URL=/api, rebuild the frontend image, and open http://localhost:8080. For npm run dev, use VITE_API_URL=http://127.0.0.1:8000.'
          : m || 'Network error',
      )
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(messageFromResponse(res, err))
    }
    return res.json()
  },
  enrollFace: (descriptor_json) => request('/me/face-enrollment', { method: 'POST', body: { descriptor_json } }),
  createInterview: (job_title, total_rounds, round_kinds) => {
    const body = { job_title }
    if (Array.isArray(round_kinds) && round_kinds.length > 0) body.round_kinds = round_kinds
    else body.total_rounds = total_rounds ?? 3
    return request('/interviews', { method: 'POST', body })
  },
  myInterviews: () => request('/interviews/mine'),
  getInterview: (id) => request(`/interviews/${id}`),
  startSession: (interviewId, roundId) =>
    request(`/interviews/${interviewId}/rounds/${roundId}/sessions/start`, { method: 'POST', body: {} }),
  sendMessage: (interviewId, roundId, sessionId, content) =>
    request(`/interviews/${interviewId}/rounds/${roundId}/sessions/${sessionId}/message`, {
      method: 'POST',
      body: { content },
    }),
  integrityEvent: (interviewId, roundId, sessionId, event_type, payload_json) =>
    request(`/interviews/${interviewId}/rounds/${roundId}/sessions/${sessionId}/integrity`, {
      method: 'POST',
      body: { event_type, payload_json },
    }),
  faceCheck: (interviewId, roundId, sessionId, body) =>
    request(`/interviews/${interviewId}/rounds/${roundId}/sessions/${sessionId}/face-check`, {
      method: 'POST',
      body,
    }),
  endSession: (interviewId, roundId, sessionId, payload = {}) =>
    request(`/interviews/${interviewId}/rounds/${roundId}/sessions/${sessionId}/end`, {
      method: 'POST',
      body: payload,
    }),
  report: (interviewId) => request(`/interviews/${interviewId}/report`),
  adminInterviews: (onDate) => {
    const q = onDate ? `?on_date=${encodeURIComponent(`${onDate}T00:00:00`)}` : ''
    return request(`/admin/interviews${q}`)
  },
  adminInvite: (interviewId, roundNumber, email, proposed_slot_utc) =>
    request(`/admin/interviews/${interviewId}/rounds/${roundNumber}/invite`, {
      method: 'POST',
      body: { email, proposed_slot_utc },
    }),
  invitation: (token) => request(`/invitations/${token}`, { auth: false }),
  acceptInvitation: (token) => request(`/invitations/${token}/accept`, { method: 'POST', auth: false }),
}
