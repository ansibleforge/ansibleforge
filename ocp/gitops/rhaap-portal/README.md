# AAP 2.7 self-service automation portal (redhat-rhaap-portal)

The productized Ansible automation portal — RHDH + AAP self-service plugins
**v2.2**, from the OpenShift Helm catalog chart `redhat-rhaap-portal` **2.2.4**
(`https://charts.openshift.io`). Distinct from the bespoke `ocp/gitops/rhdh`
Developer Hub (older 2.1.1 plugins).

`deployChart: true` in values.yaml renders the ArgoCD Application that
deploys the upstream chart — the steps below must be done before merging
with it enabled. Set it `false` to keep the chart inert.

## Secret flow
`rhaap-portal-credentials` (secrets ns) --[vault config job seed_from_k8s]-->
Vault `secret/rhaap-portal` --[ExternalSecrets]--> `secrets-rhaap-portal` +
`redhat-rhaap-portal-dynamic-plugins-registry-auth` (rhaap-portal ns, the exact
names/keys the chart consumes).

## Activation steps

1. **Create the AAP OAuth app** (already in CaC): run a CaC apply. It creates
   the confidential "Ansible Automation Portal" application
   (`aap_applications.d/rhaap_portal.yml`). Read back its client_id + secret:
   ```
   # gateway application — read id/secret after the apply
   curl -sk -u admin:$PW https://aap-aap.<domain>/api/gateway/v1/applications/?name=Ansible+Automation+Portal
   ```

2. **Mint a portal AAP token** with write access (a service account token the
   portal uses to sync job templates): `POST /api/gateway/v1/tokens/` with
   `{"scope": "write"}`. Gateway tokens expire after one year — rotate the
   `aap-token` key in the credentials secret (and re-run the vault job) before
   expiry.

3. **Seed the credentials secret** in the `secrets` namespace (the vault job
   copies every key to Vault `secret/rhaap-portal`):
   ```bash
   # registry.redhat.io auth.json, derived from the cluster pull secret:
   AUTHJSON=$(oc get secret pull-secret -n openshift-config \
     -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d \
     | python3 -c 'import json,sys; a=json.load(sys.stdin)["auths"]["registry.redhat.io"]; print(json.dumps({"auths":{"registry.redhat.io":a}}))')

   oc create secret generic rhaap-portal-credentials -n secrets \
     --from-literal=aap-host-url="https://aap-aap.apps.ocp.spark.ansibleforge.dev" \
     --from-literal=oauth-client-id="<from step 1>" \
     --from-literal=oauth-client-secret="<from step 1>" \
     --from-literal=aap-token="<from step 2>" \
     --from-literal=registry-auth-json="$AUTHJSON"
   ```

4. **Seed Vault.** The `seed_from_k8s "rhaap-portal-credentials" "rhaap-portal"`
   line in the vault config job copies every key to `secret/rhaap-portal`. That
   job is a `PostSync` hook with `hook-delete-policy: BeforeHookCreation`, so it
   is recreated and re-runs on each sync of the vault app rather than being
   blocked by Job immutability.

5. **Activate**: set `deployChart: true` in values.yaml and merge — the ArgoCD
   app deploys `redhat-rhaap-portal` 2.2.4 wired to your AAP + Keycloak.

## First-sync ordering

The vault config job and this chart are **separate ArgoCD Applications**, so
nothing orders the Vault seeding before the ExternalSecrets here — sync waves
only order resources within one app. On the first sync after enabling the
chart, `secrets-rhaap-portal` may resolve before Vault has the data and go
`SecretSyncError`. `refreshInterval` is 1h, so rather than waiting it out,
force a refresh once the vault job has completed:

```bash
oc annotate externalsecret secrets-rhaap-portal -n rhaap-portal \
  force-sync="$(date +%s)" --overwrite
```

The portal pods sit in `CreateContainerConfigError` until that secret exists,
which is self-healing, not a failed deploy.
