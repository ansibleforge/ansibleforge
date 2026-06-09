import { useAuth } from "../auth/AuthContext";
import { useRouter } from "../router";
import { PAGE_META } from "../pages";

export function Header() {
  const auth = useAuth();
  const { path } = useRouter();
  const meta = PAGE_META[path] ?? PAGE_META["/"];
  const username = auth.user?.username ?? "user";
  const initials = username.slice(0, 2).toUpperCase();
  const fullName = [auth.user?.firstName, auth.user?.lastName].filter(Boolean).join(" ") || username;

  return (
    <header className="header">
      <div>
        <div className="header__title">{meta.title}</div>
        <div className="header__subtitle">{meta.subtitle}</div>
      </div>
      <div className="header__actions">
        <button type="button" className="iconButton" aria-label="Notifications">
          <span aria-hidden>🔔</span>
          <span className="iconButton__dot" />
        </button>
        <div className="userMenu">
          <div className="userMenu__avatar">{initials}</div>
          <div>
            <div className="userMenu__name">{fullName}</div>
            <div className="userMenu__role">AAP user</div>
          </div>
          <button
            type="button"
            className="linkBtn"
            onClick={() => void auth.logout()}
            style={{ marginLeft: 6 }}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
