# AGENTS.md

## Project Overview

AnsibleForge is a GitOps-driven Ansible automation platform for Red Hat environments. It integrates Event-Driven Automation (EDA), ServiceNow ITSM, AWS infrastructure provisioning, and OpenShift GitOps (ArgoCD). Development happens in OpenShift DevSpaces.

## Project Structure

```
playbooks/            # Ansible playbooks (aap-token, devspaces, sccm-lab, vm-provision)
infra/aws/            # Terraform infrastructure code (SCCM lab, OIDC, Vault KMS)
controller_config/    # AAP Controller configuration-as-code
extensions/eda/       # Event-Driven Automation rulebooks and plugins
ocp/gitops/           # OpenShift GitOps ArgoCD Helm charts (25+ apps)
ocp/ansible/          # OpenShift Ansible playbooks
ocp/terraform/        # OpenShift Terraform code
containers/           # Container/EE build definitions (tools, ee, de, devfile-registry, site)
keycloak-extensions/  # Java Keycloak GitHub org mapper (Maven, JDK 17)
site/                 # React marketing site (Vite + React Router)
docs/                 # MkDocs documentation (Material theme)
helm/                 # RHDP Field Content Helm chart
```

## Development Environment

The project runs in OpenShift DevSpaces with two containers:
- **tools**: All development tooling (Ansible, Terraform, AWS CLI, Helm, oc, Claude Code, Codex CLI)
- **ee**: Ansible Execution Environment for running playbooks

Launch a workspace: `https://devspaces.apps.ocp.fire.ansibleforge.dev/#https://github.com/<username>/ansibleforge`

## Build & Test Commands

```bash
# Linting (run all before submitting PRs)
yamllint -c .yamllint.yml .
ansible-lint
helm lint ocp/gitops/bootstrap

# Terraform
terraform fmt
terraform validate

# React site (in site/)
npm install
npm run build

# Pre-commit hooks (yamllint, gitleaks, helmlint)
pre-commit run --all-files
```

## Code Conventions

### Ansible
- Use `snake_case` for variables
- Prefix ordered playbooks with `NN_description.yml`
- Always use FQCNs for modules (e.g., `ansible.builtin.debug`, not `debug`)
- ansible-lint profile: `min`, offline mode

### YAML Style
- 2-space indentation, consistent sequence indent
- Max line length: 200 characters (warning)
- Octal values forbidden
- Truthy values: `true`, `false`, `yes`, `no` only
- No document-start markers required
- Max 1 empty line between blocks
- Min 1 space before inline comments

### Helm Charts
- Use `argocd.argoproj.io/sync-wave` annotations for deployment ordering
- Validate with `helm lint`

### Terraform
- Always run `terraform fmt` before committing
- Infrastructure code lives in `infra/aws/`

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- **ci.yml**: YAML lint, Helm lint, Ansible lint, secret detection (TruffleHog + Gitleaks)
- **container-build.yml**: Builds and pushes container images to `ghcr.io` (auto-detects changed paths)
- **pages.yml**: Builds React site + MkDocs, deploys to GitHub Pages
- OCP provisioning/destroy/bootstrap workflows for OpenShift cluster lifecycle

## Key Dependencies

- **Ansible Collections**: 30+ collections from Red Hat Automation Hub and Galaxy (see `containers/ee-ansibleforge/execution-environment.yaml`)
- **Python**: pywinrm, boto3, kubernetes, ansible-dev-tools
- **Container images**: Based on UBI9 and Red Hat EE base images
- **React site**: React 18, React Router 6, Vite 6

## Lint Exclusions

- **ansible-lint** excludes: `docs/`, `infra/`, `ocp/terraform/`, `site/`, `containers/`, `helm/`
- **yamllint** ignores: `.github/`, `**/templates/`, `helm/`, `ocp/ansible/`
