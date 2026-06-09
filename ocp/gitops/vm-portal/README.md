# vm-portal (GitOps)

ArgoCD Helm chart for the self-service **vm-portal** SPA and its WebSocket→SSH
**terminal gateway**. Source lives at the repo root in [`vm-portal/`](../../../vm-portal).

The chart mirrors the conventions of the `site`/`sso-monitor` apps: a namespace,
a single pod running the nginx-served SPA plus the gateway as a sidecar, a
ConfigMap that re-points nginx upstreams to in-cluster targets, a Service + edge
Route, and an ExternalSecret for the gateway's AWS credentials.

## Status: disabled by default

This app is registered in `bootstrap/values.yaml` with **`enabled: false`**. The
container images and plumbing are correct, but a few values are deployment- /
cluster-specific and were left as flagged placeholders rather than guessed. Fill
these in, then flip `enabled: true`:

1. **Frontend AAP config is baked at build time.** The SPA inlines
   `VITE_AAP_CLIENT_ID`, `VITE_AAP_AUTHORIZE_URL`, `VITE_AAP_REDIRECT_URI` (and
   the workflow-template IDs) via Vite at image-build time. The CI build sets
   none, so the image currently carries the **sandbox defaults**
   (`https://192.168.64.5/...`). For a working cluster login, either:
   - pass `--build-arg`/env `VITE_*` in the `build-vm-portal` job, **or**
   - add a runtime-config mechanism to the SPA.
   You must also **register an OAuth application in AAP** whose redirect URI is
   `https://vm-portal.<clusterDomain>/oauth/callback`, and use its client id.

2. **AWS credentials** — `templates/externalsecret.yaml` pulls
   `aws-access-key-id` / `aws-secret-access-key` from Vault key `vm-portal`.
   Confirm/repoint these to the gateway's IAM user (policy in
   `vm-portal/deploy/iam-policy-gateway.json`).

3. **ghcr pull secret** — set `image.pullSecret` if the `vm-portal` /
   `vm-portal-gateway` packages are private, and confirm `image.registry`
   matches the ghcr owner CI publishes to.

4. **AAP TLS** — `gateway.aapTlsInsecure` and the nginx `proxy_ssl_verify off`
   are sandbox-tolerant carryovers. Tighten to verified TLS once AAP presents a
   CA-trusted cert in-cluster.
