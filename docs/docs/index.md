# AnsibleForge

**A GitOps-driven Ansible development environment on OpenShift — batteries included.**

AnsibleForge provisions a complete Ansible development platform on OpenShift from a single ArgoCD application.
It combines purpose-built developer containers, a custom Execution Environment, and a full suite of GitOps-managed infrastructure so teams can start writing and running automation from a browser tab.

## What you get

### For developers

- A browser-based [DevSpaces](infrastructure/devspaces.md) workspace pre-loaded with every Ansible tool, cloud CLI, and IDE extension you need
- Vault secrets automatically injected into your workspace — no manual credential setup
- Persistent storage and per-user namespace isolation
- The [tools-ansibleforge](containers/tools-ansibleforge.md) container: Ansible dev tools, Terraform, AWS CLI, OpenShift CLI, Helm, Podman, PowerShell, Claude Code, and 30 Ansible collections

### For operators

- Everything deployed and reconciled by ArgoCD — one bootstrap Application deploys the entire stack
- [HashiCorp Vault](infrastructure/vault.md) auto-initialized, unsealed, and configured on first boot
- [External Secrets Operator](infrastructure/external-secrets.md) with two backends: HashiCorp Vault and AWS Secrets Manager (provisioned via Cloud Credentials Operator)
- Per-user workspace provisioning via ArgoCD ApplicationSet — adding a user is a one-line git change
- [Shared Builds](infrastructure/shared-builds.md) keeping container images fresh in the internal registry

## Architecture

```mermaid
flowchart LR
    subgraph gitops["🔄 GitOps — ArgoCD"]
        bootstrap["Bootstrap\napp-of-apps"]
    end

    subgraph platform["Platform Services"]
        direction TB
        vault["🔐 Vault"]
        eso["🔑 External Secrets"]
        builds["🏗️ Shared Builds"]
        pipelines["⚙️ Pipelines"]
    end

    subgraph apps["Applications"]
        direction TB
        devspaces["💻 DevSpaces"]
        keycloak["🔓 Keycloak"]
        gitlab["🦊 GitLab"]
        aap["⚡ AAP"]
    end

    subgraph images["Container Images"]
        direction TB
        devimg["tools-ansibleforge\ndev container"]
        eeimg["ee-ansibleforge\nexecution environment"]
    end

    subgraph peruser["Per-User Namespace — ApplicationSet"]
        direction TB
        workspace["DevWorkspace\nauto-started"]
        secrets["Secrets\nansible-config · quay"]
        configmap["workspace-env\nVAULT_ADDR"]
    end

    bootstrap --> platform
    bootstrap --> apps
    bootstrap -->|"one app per user"| peruser

    vault -->|"Kubernetes auth"| eso
    vault -->|"agent sidecar"| workspace
    eso -->|"sync secrets"| secrets

    builds -->|"build & publish"| devimg
    builds -->|"build & publish"| eeimg
    devimg -->|"workspace image"| workspace
    eeimg -->|"workspace image"| workspace
    eeimg -->|"job execution"| aap

    keycloak -->|"SSO"| gitlab
    devspaces -->|"manages"| workspace

    classDef gitopsStyle fill:#e65100,color:#fff,stroke:#bf360c,font-size:15px,font-weight:bold
    classDef platformStyle fill:#1565c0,color:#fff,stroke:#0d47a1,font-size:15px,font-weight:bold
    classDef appsStyle fill:#2e7d32,color:#fff,stroke:#1b5e20,font-size:15px,font-weight:bold
    classDef imageStyle fill:#6a1b9a,color:#fff,stroke:#4a148c,font-size:15px,font-weight:bold
    classDef userStyle fill:#00695c,color:#fff,stroke:#004d40,font-size:15px,font-weight:bold

    class bootstrap gitopsStyle
    class vault,eso,builds,pipelines platformStyle
    class devspaces,gitlab,keycloak,aap appsStyle
    class devimg,eeimg imageStyle
    class workspace,secrets,configmap userStyle
```

## Repository layout

```
ansibleforge/
├── helm/                    # RHDP Field Content CI entry point (ansible-runner Job chart)
├── containers/
│   ├── tools-ansibleforge/   # Developer container image
│   └── ee-ansibleforge/      # Ansible Execution Environment
├── devspaces-template/      # DevSpaces devfile template
└── ocp/
    ├── ansible/             # Ansible playbooks + collections requirements
    │   └── gitops_deploy.yml# Installs GitOps operator and bootstraps ArgoCD
    └── gitops/
        ├── bootstrap/       # ArgoCD Application manifests (app-of-apps)
        ├── vault/           # HashiCorp Vault Helm chart
        ├── external-secrets/# ESO operator + ClusterSecretStores
        ├── shared-builds/   # BuildConfigs + ImageStreams
        ├── devspaces/       # CheCluster + DevSpaces operator
        ├── user-devspace/   # Per-user Helm chart (namespace, secrets, DevWorkspace)
        ├── user-projects/   # ApplicationSet + ArgoCD RBAC
        ├── pipelines/       # OpenShift Pipelines operator
        ├── gitlab/          # GitLab operator
        ├── keycloak/        # Keycloak operator
        └── aap/             # Ansible Automation Platform operator
```
