/** Paths that may appear in `location.state.from` after a forced login redirect. */
export function isProtectedAppPath(pathname) {
  if (!pathname || typeof pathname !== 'string' || !pathname.startsWith('/')) return false
  if (pathname.startsWith('//')) return false
  return (
    pathname === '/candidate' ||
    pathname === '/admin' ||
    pathname.startsWith('/interview/') ||
    pathname.startsWith('/report/')
  )
}

export function defaultHomeForRole(role) {
  return role === 'admin' ? '/admin' : '/candidate'
}

export function postAuthDestination(fromPathname, role) {
  if (isProtectedAppPath(fromPathname)) return fromPathname
  return defaultHomeForRole(role)
}
