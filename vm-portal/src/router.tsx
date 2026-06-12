import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface RouterApi {
  path: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterApi | null>(null);

/**
 * Minimal history-based router — no extra dependency, three routes-deep.
 * Uses pushState so the back button works; popstate keeps state in sync.
 */
export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) {
      window.history.pushState(null, "", to);
    }
    setPath(window.location.pathname);
  }, []);

  const api = useMemo<RouterApi>(() => ({ path, navigate }), [path, navigate]);
  return <RouterContext.Provider value={api}>{children}</RouterContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider by design
export function useRouter(): RouterApi {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used inside <RouterProvider>");
  return ctx;
}
