import { useAuth } from "../auth/AuthContext";

export function LoginScreen() {
  const auth = useAuth();

  return (
    <div className="loginShell">
      <div className="loginCard">
        <div className="loginCard__mark">VSP</div>
        <h1 className="loginCard__title">VM Self-Service Portal</h1>
        <p className="loginCard__subtitle">Powered by Ansible Automation Platform</p>

        <button
          type="button"
          className="btn btn--primary loginCard__button"
          onClick={() => void auth.login(window.location.pathname + window.location.search)}
          disabled={auth.status === "loading"}
        >
          {auth.status === "loading" ? "Redirecting…" : "Sign in with AAP"}
        </button>

        {auth.error && (
          <div className="banner banner--warning" style={{ marginTop: 16 }}>
            <span className="banner__icon" aria-hidden>⚠</span>
            <div>{auth.error}</div>
          </div>
        )}

        <div className="loginCard__hint">
          You'll be redirected to AAP at <code>https://192.168.64.5/</code> to sign in.
        </div>
      </div>
    </div>
  );
}
