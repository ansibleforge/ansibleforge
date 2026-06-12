import { ROUTES } from "../pages";
import { useRouter } from "../router";

const navItems: { route: string; label: string; icon: string }[] = [
  { route: ROUTES.dashboard, label: "Dashboard",  icon: "▦" },
  { route: ROUTES.catalog,   label: "VM Catalog", icon: "▤" },
  { route: ROUTES.runs,      label: "Runs",       icon: "▷" },
  { route: ROUTES.inventory, label: "Inventory",  icon: "▣" },
  { route: ROUTES.settings,  label: "Settings",   icon: "✦" },
];

export function Sidebar() {
  const { path, navigate } = useRouter();
  const isActive = (route: string) =>
    route === ROUTES.dashboard
      ? path === "/" || path === "/dashboard"
      : path === route;

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__mark">VSP</div>
        <div>
          <div className="sidebar__title">VM Portal</div>
          <div className="sidebar__subtitle">Self-Service</div>
        </div>
      </div>

      <nav className="sidebar__nav" aria-label="Primary">
        <div className="sidebar__navLabel">Workspace</div>
        {navItems.map((item) => (
          <button
            key={item.route}
            type="button"
            className={
              "sidebar__navItem" + (isActive(item.route) ? " sidebar__navItem--active" : "")
            }
            onClick={() => navigate(item.route)}
            aria-current={isActive(item.route) ? "page" : undefined}
          >
            <span aria-hidden style={{ width: 18, textAlign: "center" }}>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <button type="button" className="sidebar__navItem">
          <span aria-hidden style={{ width: 18, textAlign: "center" }}>?</span>
          Help
        </button>
        <div className="sidebar__user">
          <div className="sidebar__avatar">AD</div>
          <div>
            <div className="sidebar__userName">admin</div>
            <div className="sidebar__userRole">Platform Admin</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
