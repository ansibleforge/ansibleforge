# RHDP Field Content Integration

AnsibleForge can be deployed onto a Red Hat Demo Platform (RHDP) cluster using the **Field Content CI** catalog item — no pre-existing cluster or manual setup required.

## How it works

RHDP's `ocp4_workload_field_content` role (from `agnosticd/core_workloads`) deploys the `helm/` chart in this repository as an ArgoCD Application. The chart runs an `ansible-runner` Kubernetes Job that installs the OpenShift GitOps operator and bootstraps the ArgoCD app-of-apps.

```
RHDP orders "Field Content CI"
        │
        ▼
ocp4_workload_field_content role
        │  creates ArgoCD Application → helm/
        ▼
ArgoCD syncs Helm chart
        │  Namespace · ServiceAccount · ClusterRole · Job
        ▼
ansible-runner Job
        │  clones ansibleforge → runs ocp/ansible/gitops_deploy.yml
        ▼
OpenShift GitOps installed + cluster-bootstrap Application created
        │
        ▼
ArgoCD deploys all apps from ocp/gitops/bootstrap/
```

## Ordering from RHDP

1. Go to [demo.redhat.com](https://demo.redhat.com)
2. Order **Field Content CI**
3. Set the following parameters:

| Parameter | Value |
|-----------|-------|
| **GitOps Repository URL** | `https://github.com/ansibleforge/ansibleforge.git` |
| **GitOps Repository Path** | `helm` |
| **GitOps Repository Revision** | `main` |

## AgnosticD variable reference

If configuring via AgnosticD vars directly:

```yaml
ocp4_workload_field_content_gitops_repo_url: "https://github.com/ansibleforge/ansibleforge.git"
ocp4_workload_field_content_gitops_repo_path: "helm"
ocp4_workload_field_content_gitops_repo_revision: "main"
```

## Values injected by RHDP

RHDP automatically injects cluster-specific values into the Helm chart:

```yaml
deployer:
  domain: "apps.<cluster-guid>.sandbox.opentlc.com"
  apiUrl: "https://api.<cluster-guid>.sandbox.opentlc.com:6443"
```

These are passed to the ansible-runner Job as `CLUSTER_DOMAIN` and `CLUSTER_API_URL` environment variables.

## Monitoring the deployment

RHDP uses a fire-and-forget model — it creates the ArgoCD Application and exits without waiting for the Job to complete. Monitor progress directly:

```bash
# Watch the ansible-runner Job logs
oc logs -n ansible-runner job/ansibleforge-bootstrap -f

# Check ArgoCD bootstrap Application status
oc get application cluster-bootstrap -n openshift-gitops
```

## Customising via values.yaml

All tunables are in `helm/values.yaml`:

| Value | Default | Description |
|-------|---------|-------------|
| `ansible.repository.url` | `https://github.com/ansibleforge/ansibleforge.git` | Repo containing the playbook |
| `ansible.repository.branch` | `main` | Branch to clone |
| `ansible.repository.path` | `ocp/ansible` | Directory within the repo |
| `ansible.playbook` | `gitops_deploy.yml` | Playbook to execute |
| `ansible.extraVars.gitops_repo_url` | `https://github.com/ansibleforge/ansibleforge.git` | Repo ArgoCD bootstraps from |
| `ansible.extraVars.gitops_repo_branch` | `main` | Branch ArgoCD tracks |
| `job.ttlSecondsAfterFinished` | `600` | Seconds to keep completed Job |
| `namespace.name` | `ansible-runner` | Namespace the Job runs in |

## Related

- [Getting Started](../getting-started.md) — manual bootstrap alternative
- [`helm/README.md`](https://github.com/ansibleforge/ansibleforge/blob/main/helm/README.md) — full chart documentation
- [field-sourced-content-template](https://github.com/hfenner/field-sourced-content-template) — template this integration is based on
