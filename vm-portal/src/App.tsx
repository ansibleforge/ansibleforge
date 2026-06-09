import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/ToastContext";
import { LoginScreen } from "./components/LoginScreen";
import { OAuthCallback } from "./components/OAuthCallback";
import { VmAutomationProvider } from "./services/VmAutomationContext";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { RouterProvider, useRouter } from "./router";
import {
  DashboardPage,
  CatalogPage,
  RunsPage,
  InventoryPage,
  SettingsPage,
  ROUTES,
} from "./pages";

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider>
        <AppShell />
      </RouterProvider>
    </AuthProvider>
  );
}

function AppShell() {
  const { path, navigate } = useRouter();

  if (path === "/oauth/callback") {
    return <OAuthCallback onDone={(returnTo) => navigate(returnTo)} />;
  }

  return (
    <AuthGate>
      <VmAutomationProvider>
        <ToastProvider>
          <Layout>
            <CurrentPage />
          </Layout>
        </ToastProvider>
      </VmAutomationProvider>
    </AuthGate>
  );
}

function CurrentPage() {
  const { path } = useRouter();
  switch (path) {
    case ROUTES.catalog:   return <CatalogPage />;
    case ROUTES.runs:      return <RunsPage />;
    case ROUTES.inventory: return <InventoryPage />;
    case ROUTES.settings:  return <SettingsPage />;
    case ROUTES.dashboard:
    case "/dashboard":
    default:               return <DashboardPage />;
  }
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (auth.status === "loading") {
    return (
      <div className="loginShell">
        <div className="loginCard">
          <div className="loginCard__mark">VSP</div>
          <h1 className="loginCard__title">VM Self-Service Portal</h1>
          <p className="loginCard__subtitle">Checking your session…</p>
        </div>
      </div>
    );
  }
  if (auth.status !== "authenticated") return <LoginScreen />;
  return <>{children}</>;
}
