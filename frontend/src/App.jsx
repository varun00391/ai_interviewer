import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import CandidateHome from './pages/CandidateHome'
import AdminDashboard from './pages/AdminDashboard'
import VoiceInterviewRoom from './pages/VoiceInterviewRoom'
import Report from './pages/Report'
import InviteAccept from './pages/InviteAccept'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/candidate"
          element={
            <ProtectedRoute>
              <CandidateHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/interview/:interviewId/round/:roundId"
          element={
            <ProtectedRoute>
              <VoiceInterviewRoom />
            </ProtectedRoute>
          }
        />
        <Route
          path="/report/:interviewId"
          element={
            <ProtectedRoute>
              <Report />
            </ProtectedRoute>
          }
        />
        <Route path="/invite/:token" element={<InviteAccept />} />
      </Routes>
    </BrowserRouter>
  )
}
