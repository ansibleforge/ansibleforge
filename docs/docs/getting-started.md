# Getting Started

There are two ways to bootstrap AnsibleForge onto a cluster:

| Method | Best for |
|--------|----------|
| [Manual bootstrap](#manual-bootstrap) | Your own cluster with cluster-admin access |
| [RHDP Field Content CI](infrastructure/rhdp.md) | Red Hat Demo Platform — no cluster required |

---

## Manual bootstrap

### Prerequisites

- OpenShift 4.12+ cluster with cluster-admin access
- A fork of this repository

### 1. Fork and configure

Fork `hfenner/ansibleforge` and update `ocp/gitops/user-projects/values.yaml` with your OpenShift usernames and your fork URL:

```yaml
users:
  - alice
  - bob

repoURL: https://github.com/<your-fork>/ansibleforge.git
targetRevision: main
```

### 2. Bootstrap ArgoCD

Run the `gitops_deploy.yml` playbook against your cluster. It installs the OpenShift GitOps operator and creates the ArgoCD app-of-apps Application:

```bash
ansible-playbook ocp/ansible/gitops_deploy.yml \
  -e gitops_repo_url=https://github.com/<your-fork>/ansibleforge.git \
  -e gitops_repo_branch=main
```

Or apply the bootstrap Application directly if ArgoCD is already installed:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: cluster-bootstrap
  namespace: openshift-gitops
spec:
  project: default
  source:
    repoURL: https://github.com/<your-fork>/ansibleforge.git
    targetRevision: main
    path: ocp/gitops/bootstrap
  destination:
    server: https://kubernetes.default.svc
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - ServerSideApply=true
      - SkipDryRunOnMissingResource=true
```

```bash
oc apply -f ansibleforge-bootstrap.yaml
```

### 3. Wait for Vault

Vault initializes automatically on first boot. Watch for the unseal keys secret to appear:

```bash
oc get secret vault-unseal-keys -n vault -w
```

Once present, the `vault-config` PostSync job runs and configures:

- KV v2 secrets engine at `secret/`
- Kubernetes auth method (bound to the cluster)
- `external-secrets` role for ESO
- `devspaces-user` role for workspace pods

### 4. Populate secrets

Secrets are never stored in git. Populate them in Vault after it is running:

```bash
ROOT_TOKEN=$(oc get secret vault-unseal-keys -n vault \
  -o jsonpath='{.data.root-token}' | base64 -d)

# Ansible Automation Hub token
oc exec -it vault-0 -n vault -- \
  env VAULT_TOKEN=$ROOT_TOKEN vault kv put secret/ansible \
  automationhub_token=<your-token>

# Quay registry credentials
oc exec -it vault-0 -n vault -- \
  env VAULT_TOKEN=$ROOT_TOKEN vault kv put secret/quay \
  username=<your-username> \
  password=<your-password>
```

!!! tip "Vault UI"
    Access the Vault UI from the OpenShift console application menu.
    The console link URL is auto-discovered from the cluster's ingress domain at sync time.

### 5. Trigger image builds

Start the shared builds to populate the internal image registry:

```bash
oc start-build bc-tools-ansibleforge -n shared-builds --follow
oc start-build bc-ee-ansibleforge -n shared-builds --follow
```

### 6. Access your workspace

Once DevSpaces is ready, each configured user has a running workspace waiting for them.
Log in to the DevSpaces route — you'll be directed straight to your workspace.

```bash
oc get route devspaces -n devspaces
```

### Sync wave order

| Wave | What deploys |
|------|-------------|
| 0 | Namespaces, RBAC, ServiceAccounts |
| 1 | Operator subscriptions |
| 2 | CheCluster, ClusterSecretStores, CRD-dependent resources |
| 3 | ExternalSecrets, BuildConfigs, DevWorkspaces |
| PostSync | Vault auto-configuration job |
