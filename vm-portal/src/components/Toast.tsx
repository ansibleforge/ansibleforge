import { useEffect } from "react";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastProps) {
  return (
    <div className="toastContainer" role="status" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const handle = window.setTimeout(() => onDismiss(toast.id), 4000);
    return () => window.clearTimeout(handle);
  }, [toast.id, onDismiss]);

  return (
    <div className={"toast toast--" + toast.tone}>
      <div>
        <div className="toast__title">{toast.title}</div>
        {toast.body && <div className="toast__body">{toast.body}</div>}
      </div>
    </div>
  );
}
