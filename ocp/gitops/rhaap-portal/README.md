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

4. **Seed Vault — this does NOT happen automatically.** The
   `seed_from_k8s "rhaap-portal-credentials" "rhaap-portal"` line in the vault
   config job copies every key to `secret/rhaap-portal`, but adding that line
   to git is not enough to make it run. See "Re-running the vault config job"
   below and do it explicitly.

5. **Activate**: set `deployChart: true` in values.yaml and merge — the ArgoCD
   app deploys `redhat-rhaap-portal` 2.2.4 wired to your AAP + Keycloak.

## Re-running the vault config job

`vault-config` is an ArgoCD `PostSync` hook. Changing its content in git does
**not** get it re-run, and this bites every secret that is seeded through it:

- Hook resources are excluded from ArgoCD's drift comparison, so editing only
  the hook leaves the vault app reporting `Synced` and triggers no sync.
- Even an explicitly triggered sync is not enough. ArgoCD finds the previous
  completed Job of the same name and reports the hook already satisfied —
  `Reached expected number of succeeded pods` — then short-circuits with
  `successfully synced (no more tasks)`. `hook-delete-policy:
  BeforeHookCreation` does not save you here, because no hook creation is
  attempted in the first place.

Observed on 2026-07-27: the vault app reconciled the merge commit and reported
`Synced` while `status.operationState.finishedAt` was still six days old, and
the live Job had none of the new seed lines.

To actually pick up a changed seed line, delete the completed Job first, then
sync:

```bash
oc delete job vault-config -n vault
argocd app sync vault          # or the Sync button in the ArgoCD UI
```

Confirm the new Job ran and carries your line:

```bash
oc get job vault-config -n vault -o yaml | grep rhaap-portal
```

The script is idempotent — engine/auth setup is guarded and `init_secret` will
not overwrite existing values — so re-running it is safe.

## First-sync ordering

The vault config job and this chart are **separate ArgoCD Applications**, so
nothing orders the Vault seeding before the ExternalSecrets here — sync waves
only order resources within one app. Expect `secrets-rhaap-portal` and
`redhat-rhaap-portal-dynamic-plugins-registry-auth` to go `SecretSyncedError`
with `could not get secret data from provider` until Vault is seeded, and the
`rhaap-portal` namespace to have no pods at all (the Deployment never rolls out
while its env-var secret is missing).

This is **not** self-healing. `refreshInterval: 1h` only controls retries, and
retrying against a Vault path that does not exist just fails again. Seed Vault
per the section above first; only then does forcing a refresh help:

```bash
oc annotate externalsecret secrets-rhaap-portal -n rhaap-portal \
  force-sync="$(date +%s)" --overwrite
```
