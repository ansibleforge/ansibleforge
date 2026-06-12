import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { terminalConfig } from "../config";
import { tokenStore } from "../auth/tokenStore";
import type { VM } from "../types/vm";

interface Props {
  vm: VM | null;
  onClose: () => void;
}

type Phase = "connecting" | "ready" | "error" | "closed";

/** Server→client control frames (JSON text). Mirrors gateway ws/protocol.ts. */
interface ReadyFrame {
  type: "ready";
  host: string;
  user: string;
  instanceId: string;
}
interface ErrorFrame {
  type: "error";
  code: string;
  message: string;
}

/**
 * In-browser SSH terminal. Opens a same-origin WebSocket to the gateway, sends
 * an `init` frame carrying the portal OAuth token + target instance, then pipes
 * xterm I/O: keystrokes go out as binary stdin frames, terminal output arrives
 * as binary frames, and resize/ready/error are JSON text control frames.
 */
export function TerminalDrawer({ vm, onClose }: Props) {
  const open = vm !== null;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [statusLine, setStatusLine] = useState<string>("Connecting…");

  // Close on Escape, matching RunDetailsDrawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Full terminal + socket lifecycle, recreated per opened instance.
  useEffect(() => {
    if (!vm || !vm.awsInstanceId || !hostRef.current) return;
    const instanceId = vm.awsInstanceId;
    const region = vm.awsRegion ?? "us-east-2";

    let disposed = false;
    let errored = false;
    setPhase("connecting");
    setStatusLine(`Connecting to ${vm.name}…`);

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      theme: { background: "#0f1116" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);

    const doFit = () => {
      try {
        fit.fit();
      } catch {
        /* container not laid out yet */
      }
    };
    // Fit once the drawer's slide-in transition has settled, then track resizes.
    const raf = requestAnimationFrame(doFit);
    const resizeObs = new ResizeObserver(doFit);
    resizeObs.observe(hostRef.current);

    const auth = tokenStore.get();
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}${terminalConfig.wsPath}`);
    ws.binaryType = "arraybuffer";
    const encoder = new TextEncoder();

    ws.onopen = () => {
      if (!auth) {
        errored = true;
        setPhase("error");
        setStatusLine("Not authenticated — please sign in again.");
        ws.close();
        return;
      }
      ws.send(
        JSON.stringify({
          type: "init",
          token: auth.accessToken,
          instanceId,
          region,
          user: terminalConfig.defaultSshUser,
          cols: term.cols,
          rows: term.rows,
        }),
      );
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === "string") {
        const frame = JSON.parse(ev.data) as ReadyFrame | ErrorFrame;
        if (frame.type === "ready") {
          setPhase("ready");
          setStatusLine(`${frame.user}@${frame.host} (${frame.instanceId})`);
          term.focus();
        } else if (frame.type === "error") {
          errored = true;
          setPhase("error");
          setStatusLine(frame.message);
          term.writeln(`\r\n\x1b[31m✕ ${frame.message}\x1b[0m`);
        }
        return;
      }
      term.write(new Uint8Array(ev.data as ArrayBuffer));
    };

    ws.onclose = () => {
      if (disposed || errored) return;
      setPhase("closed");
      setStatusLine("Session closed.");
    };
    ws.onerror = () => {
      if (disposed || errored) return;
      errored = true;
      setPhase("error");
      setStatusLine("Connection error.");
    };

    // Keystrokes → binary stdin frames.
    const dataSub = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encoder.encode(data));
    });
    // Terminal resize → JSON text control frame.
    const resizeSub = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObs.disconnect();
      dataSub.dispose();
      resizeSub.dispose();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      term.dispose();
    };
  }, [vm]);

  const statusTone =
    phase === "ready" ? "ok" : phase === "error" ? "danger" : "muted";

  return (
    <>
      <div
        className={"drawerBackdrop" + (open ? " drawerBackdrop--open" : "")}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={"drawer drawer--terminal" + (open ? " drawer--open" : "")}
        role="dialog"
        aria-label="SSH terminal"
        aria-hidden={!open}
      >
        <div className="drawer__header">
          <div className="drawer__titleBlock">
            <div className="drawer__title">{vm ? `SSH · ${vm.name}` : "SSH terminal"}</div>
            <span className={"terminalStatus terminalStatus--" + statusTone}>{statusLine}</span>
          </div>
          <button type="button" className="iconButton" onClick={onClose} aria-label="Close terminal">
            ×
          </button>
        </div>
        <div className="drawer__body drawer__body--terminal">
          {/* xterm mounts here; key forces a fresh element per instance. */}
          <div key={vm?.id ?? "none"} ref={hostRef} className="terminalHost" />
        </div>
      </aside>
    </>
  );
}
