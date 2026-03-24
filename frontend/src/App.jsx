import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/candidate" element={<CandidateHome />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/interview/:interviewId/round/:roundId" element={<VoiceInterviewRoom />} />
        <Route path="/report/:interviewId" element={<Report />} />
        <Route path="/invite/:token" element={<InviteAccept />} />
      </Routes>
    </BrowserRouter>
  )
}
