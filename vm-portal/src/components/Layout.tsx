import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="layout">
      <div className="layout__sidebar">
        <Sidebar />
      </div>
      <div className="layout__header">
        <Header />
      </div>
      <main className="layout__main">{children}</main>
    </div>
  );
}
