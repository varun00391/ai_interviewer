import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, loadStoredToken, setAuthToken } from "../api";

export type AuthUser = {
  id: number;
  email: string;
  username: string | null;
  is_admin: boolean;
  full_name: string | null;
  created_at: string;
  subscription_tier: string;
  subscription_tier_stored: string;
  subscription_starts_at: string | null;
  subscription_ends_at: string | null;
  interviews_total: number;
  interviews_today: number;
  interviews_total_limit: number | null;
  interviews_daily_limit: number | null;
  app_access_blocked: boolean;
  app_access_message: string | null;
  stt_deepgram_available?: boolean;
};

type Ctx = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName?: string,
    subscriptionPlan?: string,
    username?: string
  ) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<Ctx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = loadStoredToken();
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<AuthUser>("/auth/me");
      setUser(data);
    } catch {
      setAuthToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<{ access_token: string }>("/auth/login", {
        email,
        password,
      });
      setAuthToken(data.access_token);
      await refresh();
    },
    [refresh]
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      fullName?: string,
      subscriptionPlan?: string,
      username?: string
    ) => {
      const u = (username || "").trim();
      await api.post("/auth/register", {
        email,
        password,
        full_name: fullName || null,
        subscription_plan: subscriptionPlan || "free",
        username: u ? u : null,
      });
      await login(email, password);
    },
    [login]
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, refresh, logout }),
    [user, loading, login, register, refresh, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
