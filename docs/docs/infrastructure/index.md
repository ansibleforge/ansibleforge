# Infrastructure

All infrastructure components are Helm charts under `ocp/` managed by ArgoCD.
A single bootstrap Application deploys everything via the app-of-apps pattern.

| Component | Namespace | Purpose |
|-----------|-----------|---------|
| [HashiCorp Vault](vault.md) | `vault` | Secret store — auto-initialized and configured |
| [External Secrets](external-secrets.md) | `external-secrets` | Syncs secrets from Vault and AWS into Kubernetes |
| [Shared Builds](shared-builds.md) | `shared-builds` | Builds and hosts the developer container images |
| [DevSpaces](devspaces.md) | `devspaces` | Browser-based development environments |
| [User Provisioning](user-provisioning.md) | per-user | Namespace, secrets, and workspace per user |
| [OpenShift Pipelines](pipelines.md) | `openshift-operators` | Tekton CI/CD operator |
| [Gitea](gitea.md) | `gitea` | Source control |
| [Keycloak](keycloak.md) | `keycloak` | Identity provider and SSO |
| [AAP](aap.md) | `aap` | Ansible Automation Platform |
