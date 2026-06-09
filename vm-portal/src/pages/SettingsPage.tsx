import { useEffect, useState } from "react";
import { Card } from "../components/Card";
import { useAuth } from "../auth/AuthContext";
import { aapConfig, aapResources } from "../config";
import { tokenStore } from "../auth/tokenStore";

export function SettingsPage() {
  const auth = useAuth();
  const token = tokenStore.get();

  // Tick a clock once per second so the token TTL counts down live. Reading
  // Date.now() during render would be impure; keep it in state instead.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const expiresIn = token ? Math.max(0, Math.floor((token.expiresAt - now) / 1000)) : null;

  return (
    <>
      <div className="pageHeader">
        <h1>Settings</h1>
        <p>Portal session and AAP connection details.</p>
      </div>

      <div className="grid">
        <Card title="Signed-in user" subtitle="From /api/gateway/v1/me/" icon={<span style={{ fontSize: 16 }}>👤</span>}>
          <dl className="metaGrid">
            <div>
              <dt>Username</dt>
              <dd>{auth.user?.username ?? "—"}</dd>
            </div>
            <div>
              <dt>Full name</dt>
              <dd>{[auth.user?.firstName, auth.user?.lastName].filter(Boolean).join(" ") || "—"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{auth.status}</dd>
            </div>
            <div>
              <dt>Token TTL</dt>
              <dd>{expiresIn === null ? "—" : `${expiresIn}s`}</dd>
            </div>
          </dl>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" className="btn btn--ghost" onClick={() => void auth.logout()}>
              Sign out
            </button>
          </div>
        </Card>

        <Card title="AAP connection" subtitle="Same-origin proxy + OAuth2 PKCE" icon={<span style={{ fontSize: 16 }}>🔗</span>}>
          <dl className="metaGrid">
            <div>
              <dt>OAuth client id</dt>
              <dd style={{ wordBreak: "break-all" }}>{aapConfig.clientId}</dd>
            </div>
            <div>
              <dt>Authorize URL</dt>
              <dd style={{ wordBreak: "break-all" }}>{aapConfig.authorizeUrl}</dd>
            </div>
            <div>
              <dt>Redirect URI</dt>
              <dd style={{ wordBreak: "break-all" }}>{aapConfig.redirectUri}</dd>
            </div>
            <div>
              <dt>Token URL</dt>
              <dd>{aapConfig.tokenUrl}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div style={{ marginTop: 20 }}>
        <Card title="AAP resource ids" subtitle="What this build is pinned against">
          <dl className="metaGrid">
            <div><dt>Inventory (manual)</dt><dd>{aapResources.inventoryId}</dd></div>
            <div><dt>Inventory (AWS)</dt><dd>{aapResources.awsInventoryId}</dd></div>
            <div><dt>AWS source</dt><dd>{aapResources.awsInventorySourceId}</dd></div>
            <div><dt>WFT: Provision EC2</dt><dd>{aapResources.provisionEc2TemplateId}</dd></div>
            <div><dt>JT: AWS Describe Options</dt><dd>{aapResources.describeOptionsTemplateId}</dd></div>
            <div><dt>WFT: Delete VM</dt><dd>{aapResources.deleteVmTemplateId}</dd></div>
            <div><dt>WFT: Terminate EC2</dt><dd>{aapResources.terminateEc2TemplateId}</dd></div>
            <div><dt>WFT: Termination Protection</dt><dd>{aapResources.terminationProtectionTemplateId}</dd></div>
            <div><dt>WFT: ManagedBy Tag</dt><dd>{aapResources.managedByTagTemplateId}</dd></div>
            <div><dt>WFT: Instance State</dt><dd>{aapResources.instanceStateTemplateId}</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
