# DevSpaces

**Chart:** `ocp/devspaces/`
**Namespace:** `devspaces`

## Overview

Red Hat OpenShift DevSpaces provides browser-based development environments running directly on the cluster.
Each user gets an isolated workspace running the `ansible-devspaces` and `ee-ansibleforge` containers, with Vault secrets injected automatically and persistent storage attached.

## CheCluster

The `CheCluster` custom resource configures the DevSpaces instance. Workspaces run in per-user namespaces (`<username>-devspaces`) provisioned by the [User Provisioning](user-provisioning.md) ApplicationSet.

## Devfile

The workspace definition lives in `hfenner/ansibleforge` at `devspaces-template/devfile.yaml`.
It specifies both containers, the git project to clone, and Vault agent injection annotations.

### Containers

| Container | Image |
|-----------|-------|
| `development-container` | `shared-builds/ansible-devspaces:latest` |
| `ee-ansibleforge` | `shared-builds/ee-ansibleforge:latest` |

Both containers load the `workspace-env` ConfigMap via `envFrom`, providing `VAULT_ADDR` and any other cluster-level environment variables.

### Vault agent injection

Vault secrets are mounted into workspace pods via the Vault agent injector sidecar, configured through `pod-overrides` annotations:

```yaml
vault.hashicorp.com/agent-inject: "true"
vault.hashicorp.com/role: "devspaces-user"
vault.hashicorp.com/agent-inject-secret-ansible: "secret/data/ansible"
vault.hashicorp.com/agent-inject-secret-quay: "secret/data/quay"
```

Secrets appear inside the workspace at `/vault/secrets/ansible` and `/vault/secrets/quay`.

## Accessing DevSpaces

```bash
oc get route devspaces -n devspaces
```

Users in the [User Provisioning](user-provisioning.md) list have workspaces auto-started — no factory URL needed.
