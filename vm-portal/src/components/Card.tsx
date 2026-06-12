import type { ReactNode } from "react";

interface CardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  pills?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function Card({ title, subtitle, icon, pills, actions, children }: CardProps) {
  return (
    <section className="card">
      <header className="card__header">
        <div className="card__title">
          {icon && <div className="card__icon" aria-hidden>{icon}</div>}
          <div className="card__titleText">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
        <div className="card__actions">
          {pills && <div className="card__pillRow">{pills}</div>}
          {actions}
        </div>
      </header>
      <div className="card__body">{children}</div>
    </section>
  );
}
