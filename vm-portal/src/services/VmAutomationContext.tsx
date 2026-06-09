import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { VmAutomationService } from "./VmAutomationService";
import { MockVmAutomationService } from "./MockVmAutomationService";
import { HttpVmAutomationService, type AapResourceConfig } from "./HttpVmAutomationService";
import { HttpAapClient } from "./aap";
import { tokenStore } from "../auth/tokenStore";
import { useAuth } from "../auth/AuthContext";
import { aapResources } from "../config";
import type { AutomationRun, VM } from "../types/vm";

const VmAutomationContext = createContext<VmAutomationService | null>(null);

const DEFAULT_RESOURCES: AapResourceConfig = { ...aapResources };

interface ProviderProps {
  children: ReactNode;
  /** Override entirely (e.g. tests). */
  service?: VmAutomationService;
  /** Force the mock implementation even when the user is signed in. */
  forceMock?: boolean;
  resources?: Partial<AapResourceConfig>;
}

export function VmAutomationProvider({ children, service, forceMock, resources }: ProviderProps) {
  const auth = useAuth();

  const instance = useMemo(() => {
    if (service) return service;
    if (forceMock || auth.status !== "authenticated") {
      return MockVmAutomationService.createDefault();
    }
    const config: AapResourceConfig = { ...DEFAULT_RESOURCES, ...resources };
    const client = new HttpAapClient({
      tokenProvider: () => {
        const t = tokenStore.get();
        return t ? { accessToken: t.accessToken, tokenType: t.tokenType } : null;
      },
    });
    return new HttpVmAutomationService(client, config);
  }, [service, forceMock, auth.status, resources]);

  return <VmAutomationContext.Provider value={instance}>{children}</VmAutomationContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider by design
export function useVmAutomation(): VmAutomationService {
  const ctx = useContext(VmAutomationContext);
  if (!ctx) {
    throw new Error("useVmAutomation must be used inside <VmAutomationProvider>");
  }
  return ctx;
}

/**
 * Adaptive polling intervals (ms). Fast when any row is in a transient
 * state — Starting / Stopping / Provisioning / Deleting — so the UI flips
 * within a couple seconds of AAP catching up. Slow when everything is at
 * rest, so we don't hammer the API.
 */
const POLL_FAST_MS = 4_000;
const POLL_SLOW_MS = 20_000;

const TRANSIENT_VM = new Set(["Starting", "Stopping", "Provisioning", "Deleting"]);
const TRANSIENT_RUN = new Set(["Running"]);

/** Subscribe to the service's VM list. */
// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider by design
export function useVms(): VM[] {
  const service = useVmAutomation();
  const [vms, setVms] = useState<VM[]>([]);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    const refresh = async () => {
      try {
        const next = await service.listVms();
        if (alive) setVms(next);
      } catch {
        // Tolerate transient failures so polling can recover.
      }
    };

    const schedule = () => {
      if (!alive) return;
      const interval = vms.some((v) => TRANSIENT_VM.has(v.status))
        ? POLL_FAST_MS
        : POLL_SLOW_MS;
      timer = window.setTimeout(async () => {
        await refresh();
        schedule();
      }, interval);
    };

    void refresh();
    schedule();
    const unsubscribe = service.subscribe((event) => {
      if (event === "vms-changed") void refresh();
    });
    return () => {
      alive = false;
      if (timer !== undefined) window.clearTimeout(timer);
      unsubscribe();
    };
    // vms is referenced inside schedule(); re-run when its shape (presence
    // of a transient row) might warrant a different cadence. Stable values
    // collapse via the setState identity check.
  }, [service, vms]);

  return vms;
}

/** Subscribe to the service's recent-runs feed. */
// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider by design
export function useRuns(): AutomationRun[] {
  const service = useVmAutomation();
  const [runs, setRuns] = useState<AutomationRun[]>([]);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    const refresh = async () => {
      try {
        const next = await service.listRuns();
        if (alive) setRuns(next);
      } catch {
        // ignore transient failures
      }
    };

    const schedule = () => {
      if (!alive) return;
      const interval = runs.some((r) => TRANSIENT_RUN.has(r.status))
        ? POLL_FAST_MS
        : POLL_SLOW_MS;
      timer = window.setTimeout(async () => {
        await refresh();
        schedule();
      }, interval);
    };

    void refresh();
    schedule();
    const unsubscribe = service.subscribe((event) => {
      if (event === "runs-changed") void refresh();
    });
    return () => {
      alive = false;
      if (timer !== undefined) window.clearTimeout(timer);
      unsubscribe();
    };
  }, [service, runs]);

  return runs;
}
