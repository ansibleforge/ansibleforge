import { useEffect, useState } from "react";
import { completeLogin } from "../auth/oauth";
import { useAuth } from "../auth/AuthContext";

interface Props {
  onDone: (returnTo: string) => void;
}

export function OAuthCallback({ onDone }: Props) {
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { returnTo } = await completeLogin(new URLSearchParams(window.location.search));
        if (!active) return;
        await auth.refresh();
        onDone(returnTo);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="loginShell">
      <div className="loginCard">
        {!error ? (
          <>
            <div className="loginCard__mark">VSP</div>
            <h1 className="loginCard__title">Signing you in…</h1>
            <p className="loginCard__subtitle">Exchanging the authorization code with AAP.</p>
          </>
        ) : (
          <>
            <div className="loginCard__mark" style={{ background: "var(--color-danger)" }}>!</div>
            <h1 className="loginCard__title">Sign-in failed</h1>
            <div className="banner banner--warning" style={{ marginTop: 16 }}>
              <span className="banner__icon" aria-hidden>⚠</span>
              <div>{error}</div>
            </div>
            <button
              type="button"
              className="btn btn--ghost loginCard__button"
              onClick={() => onDone("/")}
            >
              Back to home
            </button>
          </>
        )}
      </div>
    </div>
  );
}
