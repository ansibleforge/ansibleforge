export { DashboardPage } from "./DashboardPage";
export { CatalogPage } from "./CatalogPage";
export { RunsPage } from "./RunsPage";
export { InventoryPage } from "./InventoryPage";
export { SettingsPage } from "./SettingsPage";

export const ROUTES = {
  dashboard: "/",
  catalog: "/catalog",
  runs: "/runs",
  inventory: "/inventory",
  settings: "/settings",
} as const;

export const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Dashboard", subtitle: "Overview of your virtual infrastructure" },
  "/catalog": { title: "VM Catalog", subtitle: "Browse and act on managed virtual machines" },
  "/runs": { title: "Automation Runs", subtitle: "Workflow + job template history" },
  "/inventory": { title: "Inventory", subtitle: "AWS dynamic inventory backing the catalog" },
  "/settings": { title: "Settings", subtitle: "Portal session and AAP connection" },
};
