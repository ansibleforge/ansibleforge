import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVmAutomation } from "../services/VmAutomationContext";
import { useToast } from "./ToastContext";
import { canSshAws, canTerminateAws, type VM } from "../types/vm";

const MENU_WIDTH = 240;

export function VmRowMenu({ vm, onConnect }: { vm: VM; onConnect?: (vm: VM) => void }) {
  const service = useVmAutomation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const computePosition = () => {
    const btn = anchorRef.current;
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    // Align the menu's right edge with the button's right edge; clamp so it
    // can't fall off the left edge of the viewport on narrow screens.
    const top = rect.bottom + 6;
    const left = Math.max(8, rect.right - MENU_WIDTH);
    return { top, left };
  };

  const openMenu = () => {
    const p = computePosition();
    if (!p) return;
    setPosition(p);
    setOpen(true);
  };

  // Close on outside-click (anywhere outside the anchor button AND the menu),
  // Escape, scroll, or resize. Reposition on scroll would also work but
  // closing keeps things predictable.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onWinChange = () => setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onWinChange, true);
    window.addEventListener("resize", onWinChange);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onWinChange, true);
      window.removeEventListener("resize", onWinChange);
    };
  }, [open]);

  const idForClipboard = vm.source === "aws"
    ? (vm.subtitle?.split(" · ").find((p) => p.startsWith("i-")) ?? vm.name)
    : vm.id.replace(/^aap-host-/, "");

  const handleCopyId = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(idForClipboard);
      toast.push({ tone: "success", title: "Copied to clipboard", body: idForClipboard });
    } catch (err) {
      toast.push({
        tone: "danger",
        title: "Could not copy",
        body: err instanceof Error ? err.message : "Clipboard is unavailable",
      });
    }
  };

  const isAws = vm.source === "aws";
  const awsCanTerminate = canTerminateAws(vm);
  const taggedManaged = vm.awsTags?.["ManagedBy"] === "ansible";

  const runWorkflow = async (
    title: string,
    fn: () => Promise<unknown>,
  ) => {
    setOpen(false);
    setBusy(true);
    try {
      await fn();
      toast.push({
        tone: "info",
        title,
        body: `${vm.awsInstanceId ?? vm.name} — workflow launched in AAP.`,
      });
    } catch (err) {
      toast.push({
        tone: "danger",
        title: "Workflow failed to launch.",
        body: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setOpen(false);
    const prompt = isAws
      ? `Terminate EC2 instance ${vm.awsInstanceId} (${vm.name})? This will destroy the real AWS instance.`
      : `Delete ${vm.name}? This launches the Delete VM workflow in AAP.`;
    if (!confirm(prompt)) return;
    setBusy(true);
    try {
      await service.deleteVm(vm.id);
      toast.push({
        tone: "warning",
        title: isAws ? "Terminate EC2 workflow launched." : "Delete VM workflow launched.",
        body: isAws
          ? `${vm.awsInstanceId} (${vm.name}) is being terminated.`
          : `${vm.name} is being decommissioned.`,
      });
    } catch (err) {
      toast.push({
        tone: "danger",
        title: "Could not launch deletion.",
        body: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  };

  const menu = (
    <div
      ref={menuRef}
      className="rowMenu"
      role="menu"
      style={{
        position: "fixed",
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        width: MENU_WIDTH,
        zIndex: 1100,
      }}
    >
      <button
        type="button"
        role="menuitem"
        className="rowMenu__item"
        onClick={() => void handleCopyId()}
      >
        <span aria-hidden>⎘</span>
        {vm.source === "aws" ? "Copy instance ID" : "Copy host ID"}
      </button>

      {isAws && (
        canSshAws(vm) ? (
          <button
            type="button"
            role="menuitem"
            className="rowMenu__item"
            onClick={() => {
              setOpen(false);
              onConnect?.(vm);
            }}
          >
            <span aria-hidden>⌨</span>
            Connect (SSH)
          </button>
        ) : (
          <div className="rowMenu__note">SSH available when the instance is running.</div>
        )
      )}

      {!isAws && (
        <button
          type="button"
          role="menuitem"
          className="rowMenu__item rowMenu__item--danger"
          onClick={() => void handleDelete()}
          disabled={vm.status === "Deleting"}
        >
          <span aria-hidden>✕</span>
          Delete VM
        </button>
      )}

      {isAws && (
        <>
          <div className="rowMenu__sep" />
          <div className="rowMenu__group">Power</div>
          {vm.status === "Stopped" && (
            <button
              type="button"
              role="menuitem"
              className="rowMenu__item"
              onClick={() => void runWorkflow(
                "Start instance launched.",
                () => service.setInstanceState(vm.id, "running"),
              )}
              disabled={!awsCanTerminate}
            >
              <span aria-hidden>▶</span>
              Start instance
            </button>
          )}
          {vm.status === "Running" && (
            <button
              type="button"
              role="menuitem"
              className="rowMenu__item"
              onClick={() => void runWorkflow(
                "Stop instance launched.",
                () => service.setInstanceState(vm.id, "stopped"),
              )}
              disabled={!awsCanTerminate}
            >
              <span aria-hidden>■</span>
              Stop instance
            </button>
          )}
          {vm.status !== "Stopped" && vm.status !== "Running" && (
            <div className="rowMenu__note">
              Power actions available when the instance is running or stopped.
            </div>
          )}
          {!awsCanTerminate && (vm.status === "Stopped" || vm.status === "Running") && (
            <div className="rowMenu__note">
              Power changes require <code>ManagedBy=ansible</code> tag.
            </div>
          )}

          <div className="rowMenu__sep" />
          <div className="rowMenu__group">Tag</div>
          {taggedManaged ? (
            <button
              type="button"
              role="menuitem"
              className="rowMenu__item"
              onClick={() => void runWorkflow(
                "Remove ManagedBy=ansible tag launched.",
                () => service.setManagedByTag(vm.id, false),
              )}
            >
              <span aria-hidden>🏷</span>
              Remove ManagedBy=ansible
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="rowMenu__item"
              onClick={() => void runWorkflow(
                "Apply ManagedBy=ansible tag launched.",
                () => service.setManagedByTag(vm.id, true),
              )}
            >
              <span aria-hidden>🏷</span>
              Apply ManagedBy=ansible
            </button>
          )}

          <div className="rowMenu__sep" />
          <div className="rowMenu__group">Termination protection</div>
          <button
            type="button"
            role="menuitem"
            className="rowMenu__item"
            onClick={() => void runWorkflow(
              "Enable termination protection launched.",
              () => service.setTerminationProtection(vm.id, true),
            )}
          >
            <span aria-hidden>🛡</span>
            Enable termination protection
          </button>
          <button
            type="button"
            role="menuitem"
            className="rowMenu__item"
            onClick={() => void runWorkflow(
              "Disable termination protection launched.",
              () => service.setTerminationProtection(vm.id, false),
            )}
          >
            <span aria-hidden>🔓</span>
            Disable termination protection
          </button>

          <div className="rowMenu__sep" />
          {!vm.awsInstanceId ? (
            <div className="rowMenu__note">
              Still provisioning — actions become available once the instance syncs into the inventory.
            </div>
          ) : awsCanTerminate ? (
            <button
              type="button"
              role="menuitem"
              className="rowMenu__item rowMenu__item--danger"
              onClick={() => void handleDelete()}
              disabled={vm.status === "Deleting"}
            >
              <span aria-hidden>⚡</span>
              Terminate instance
            </button>
          ) : (
            <div className="rowMenu__note">
              Termination requires <code>ManagedBy=ansible</code> tag.
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="iconButton"
        style={{ width: 28, height: 28, border: "none" }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${vm.name}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={busy}
      >⋯</button>

      {open && position && createPortal(menu, document.body)}
    </>
  );
}
