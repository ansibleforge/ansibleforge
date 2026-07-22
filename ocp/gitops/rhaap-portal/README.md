# AAP 2.7 self-service automation portal (redhat-rhaap-portal)

The productized Ansible automation portal — RHDH + AAP self-service plugins
(v2.2), installed from the OpenShift Helm catalog chart `redhat-rhaap-portal`.
Distinct from the bespoke `ocp/gitops/rhdh` Developer Hub (which carries the
older 2.1.1 plugins).

## Prerequisites before enabling (chartVersion is empty = inert until then)
1. **AAP OAuth app**: `aap_applications.d/rhaap_portal.yml` creates the "Ansible
   Automation Portal" confidential application on next CaC apply. Read back its
   client_id + client_secret.
2. **Portal service-account token**: an AAP token with write access (for job
   template sync).
3. **Seed Vault** `secret/rhaap-portal` (via a `rhaap-portal-credentials` k8s
   secret in the `secrets` namespace + a `seed_from_k8s "rhaap-portal-credentials" "rhaap-portal"`
   line in the vault config job) with keys: `aap-host-url`, `oauth-client-id`,
   `oauth-client-secret`, `aap-token`, and `registry-auth-json` (base64 auth.json
   for registry.redhat.io).
4. **Pin `chartVersion`** in values.yaml to the release matching plugin v2.2
   (confirm `chartRepo`/version from `helm search repo openshift-helm-charts/redhat-rhaap-portal`).

Once those are done, set `chartVersion` and the ArgoCD app deploys the chart.
