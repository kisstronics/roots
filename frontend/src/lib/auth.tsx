import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiUrl } from "./paths";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { user?: AuthUser | null };
        return data.user ?? null;
      })
      .then((next) => {
        if (!cancel) setUser(next);
      })
      .catch(() => {
        if (!cancel) setUser(null);
      })
      .finally(() => {
        if (!cancel) setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function logout() {
    await fetch(apiUrl("/api/auth/logout"), { method: "POST", credentials: "include" }).catch(() => undefined);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, ready, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Auth is not available.");
  return value;
}
