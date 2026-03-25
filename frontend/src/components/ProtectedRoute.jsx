import { Navigate, useLocation } from 'react-router-dom'
import { getToken } from '../api'

export default function ProtectedRoute({ children }) {
  const location = useLocation()
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return children
}
