import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { meSchema, type User } from "@shared/api";

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  login: (name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const data = meSchema.parse(await res.json());
        setUser(data.user);
        setIsAdmin(data.isAdmin);
      } else {
        setUser(null);
        setIsAdmin(false);
      }
    } catch {
      setUser(null);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("username");
    const password = params.get("password");
    if (name !== null && password !== null) {
      params.delete("username");
      params.delete("password");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname +
          (query ? `?${query}` : "") +
          window.location.hash,
      );
      void (async () => {
        try {
          const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, password }),
          });
          if (res.ok) {
            await fetchMe();
          } else {
            setLoading(false);
          }
        } catch {
          setLoading(false);
        }
      })();
    } else {
      void fetchMe();
    }
  }, [fetchMe]);

  const login = useCallback(
    async (name: string, password: string) => {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      if (!res.ok) {
        throw new Error("Invalid name or password");
      }
      await fetchMe();
    },
    [fetchMe],
  );

  const logout = useCallback(async () => {
    await fetch("/api/logout", { method: "POST" });
    setUser(null);
    setIsAdmin(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
