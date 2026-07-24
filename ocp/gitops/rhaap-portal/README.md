# AAP 2.7 self-service automation portal (redhat-rhaap-portal)

The productized Ansible automation portal — RHDH + AAP self-service plugins
**v2.2**, from the OpenShift Helm catalog chart `redhat-rhaap-portal` **2.2.4**
(`https://charts.openshift.io`). Distinct from the bespoke `ocp/gitops/rhdh`
Developer Hub (older 2.1.1 plugins).

Kept inert by `deployChart: false` in values.yaml until the steps below are
done; then flip `deployChart: true`.

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
   portal uses to sync job templates).

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

4. **Run the vault config job** (or re-sync the vault Argo app) to seed
   `secret/rhaap-portal`, then confirm the ExternalSecrets sync in the
   `rhaap-portal` namespace.

5. **Activate**: set `deployChart: true` in values.yaml and merge — the ArgoCD
   app deploys `redhat-rhaap-portal` 2.2.4 wired to your AAP + Keycloak.
