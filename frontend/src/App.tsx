import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import AccountLocked from "./pages/AccountLocked";
import AdminDashboard from "./pages/AdminDashboard";
import Dashboard from "./pages/Dashboard";
import InterviewPrep from "./pages/InterviewPrep";
import InterviewRoom from "./pages/InterviewRoom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";

function Private({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-mist">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.app_access_blocked && !user.is_admin) {
    return <AccountLocked />;
  }
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-mist">
        Loading…
      </div>
    );
  }
  if (!user?.is_admin) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/app"
        element={
          <Private>
            <Dashboard />
          </Private>
        }
      />
      <Route
        path="/app/session/:sessionId"
        element={
          <Private>
            <InterviewPrep />
          </Private>
        }
      />
      <Route
        path="/app/session/:sessionId/interview/:round"
        element={
          <Private>
            <InterviewRoom />
          </Private>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminOnly>
            <AdminDashboard />
          </AdminOnly>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
