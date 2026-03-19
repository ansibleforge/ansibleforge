# AnsibleForge — RHDP Field Content Integration

This Helm chart integrates AnsibleForge with the [Red Hat Demo Platform (RHDP)](https://demo.redhat.com) using the **Field Content CI** catalog item.

When ordered, RHDP deploys this chart via ArgoCD. The chart runs an `ansible-runner` Kubernetes Job that clones this repository and executes `ocp/ansible/gitops_deploy.yml`, which installs the OpenShift GitOps operator and bootstraps the ArgoCD app-of-apps pointing at `ocp/gitops/bootstrap/`.

## How it works

```
RHDP orders "Field Content CI"
        │
        ▼
ocp4_workload_field_content role (agnosticd/core_workloads)
        │  creates ArgoCD Application pointing at helm/
        ▼
ArgoCD syncs this Helm chart
        │  creates: Namespace, ServiceAccount, ClusterRole, ClusterRoleBinding, ConfigMap, Job
        ▼
ansible-runner Job
        │  clones ansibleforge → runs ocp/ansible/gitops_deploy.yml
        ▼
OpenShift GitOps operator installed + cluster-bootstrap ArgoCD Application created
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
| **GitOps Repository URL** | `https://github.com/hfenner/ansibleforge.git` |
| **GitOps Repository Path** | `helm` |
| **GitOps Repository Revision** | `main` |

## RHDP AgnosticD variable reference

If configuring via AgnosticD vars directly:

```yaml
ocp4_workload_field_content_gitops_repo_url: "https://github.com/hfenner/ansibleforge.git"
ocp4_workload_field_content_gitops_repo_path: "helm"
ocp4_workload_field_content_gitops_repo_revision: "main"
```

## Values injected by RHDP

RHDP automatically injects the following into the Helm chart at deploy time:

```yaml
deployer:
  domain: "apps.<cluster-guid>.sandbox.opentlc.com"
  apiUrl: "https://api.<cluster-guid>.sandbox.opentlc.com:6443"
```

These are passed to the ansible-runner Job as `CLUSTER_DOMAIN` and `CLUSTER_API_URL` environment variables.

## Customising the deployment

All tunables are in `values.yaml`:

| Value | Default | Description |
|-------|---------|-------------|
| `ansible.repository.url` | `https://github.com/hfenner/ansibleforge.git` | Repo containing the playbook |
| `ansible.repository.branch` | `main` | Branch to clone |
| `ansible.repository.path` | `ocp/ansible` | Path within repo to `cd` into |
| `ansible.playbook` | `gitops_deploy.yml` | Playbook filename |
| `ansible.extraVars.gitops_repo_url` | `https://github.com/hfenner/ansibleforge.git` | Repo ArgoCD bootstraps from |
| `ansible.extraVars.gitops_repo_branch` | `main` | Branch ArgoCD tracks |
| `job.ttlSecondsAfterFinished` | `600` | How long to keep the completed Job |
| `namespace.name` | `ansible-runner` | Namespace the Job runs in |

## Deployment behaviour

This integration uses RHDP's **fire-and-forget** model:

- RHDP creates the ArgoCD Application pointing at `helm/` and verifies it was accepted (~1 min)
- RHDP does **not** wait for the ansible-runner Job to complete
- Monitor job progress in the `ansible-runner` namespace:
  ```bash
  oc logs -n ansible-runner job/ansibleforge-bootstrap -f
  ```
- Monitor ArgoCD bootstrap in the OpenShift GitOps console once the Job completes

## Repository layout

```
ansibleforge/
├── helm/                        ← This chart (RHDP entry point)
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
├── ocp/
│   ├── ansible/
│   │   ├── gitops_deploy.yml    ← Playbook executed by the Job
│   │   └── requirements.yml     ← Collections installed by the Job
│   └── gitops/
│       └── bootstrap/           ← ArgoCD app-of-apps bootstrapped by the playbook
└── containers/                  ← ansible-devspaces and ee-ansibleforge images
```
