import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { tokenStore } from "./tokenStore";
import { startLogin, logout as oauthLogout, refreshTokens } from "./oauth";

interface UserInfo {
  username: string;
  firstName?: string;
  lastName?: string;
}

type AuthStatus = "loading" | "unauthenticated" | "authenticated" | "error";

interface AuthState {
  status: AuthStatus;
  user: UserInfo | null;
  error: string | null;
}

interface AuthApi extends AuthState {
  login: (returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Force a re-check (used by the OAuth callback after it stores tokens). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null, error: null });

  const fetchMe = useCallback(async (signal?: AbortSignal): Promise<UserInfo | null> => {
    // `allowRefresh` bounds the retry to a single refresh+retry on 401 so a
    // persistently-rejecting token can't loop forever.
    const attempt = async (allowRefresh: boolean): Promise<UserInfo | null> => {
      const auth = tokenStore.get();
      if (!auth) return null;
      try {
        const res = await fetch("/api/gateway/v1/me/", {
          headers: { Authorization: `${auth.tokenType} ${auth.accessToken}`, Accept: "application/json" },
          signal,
        });
        if (res.status === 401) {
          if (!allowRefresh) {
            tokenStore.clear();
            return null;
          }
          // Try refresh, then retry once.
          try {
            await refreshTokens();
            return await attempt(false);
          } catch {
            tokenStore.clear();
            return null;
          }
        }
        if (!res.ok) return null;
        const data = (await res.json()) as {
          results: Array<{ username: string; first_name?: string; last_name?: string }>;
        };
        const me = data.results[0];
        if (!me) return null;
        return { username: me.username, firstName: me.first_name, lastName: me.last_name };
      } catch {
        return null;
      }
    };
    return attempt(true);
  }, []);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    const user = await fetchMe();
    setState({
      status: user ? "authenticated" : "unauthenticated",
      user,
      error: null,
    });
  }, [fetchMe]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const user = await fetchMe(controller.signal);
      if (controller.signal.aborted) return;
      setState({ status: user ? "authenticated" : "unauthenticated", user, error: null });
    })();
    return () => controller.abort();
  }, [fetchMe]);

  const login = useCallback(async (returnTo = "/") => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      await startLogin(returnTo);
    } catch (err) {
      setState({
        status: "error",
        user: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const logout = useCallback(async () => {
    await oauthLogout();
    setState({ status: "unauthenticated", user: null, error: null });
  }, []);

  const api = useMemo<AuthApi>(
    () => ({ ...state, login, logout, refresh }),
    [state, login, logout, refresh],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider by design
export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
