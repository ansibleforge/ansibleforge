# Contributing to AnsibleForge

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

1. **Fork** the repository on GitHub
2. **Open in DevSpaces** — launch a workspace from your fork at `https://devspaces.apps.ocp.fire.ansibleforge.dev/#https://github.com/<your-username>/ansibleforge`
3. **Create a branch** for your changes

## Development Environment

This project is designed to run in OpenShift DevSpaces. The devfile provides:

- **tools** container — Ansible, Terraform, AWS CLI, Helm, `oc`, Claude Code, Codex CLI, and more
- **ee** container — Ansible Execution Environment for running playbooks

### Project Layout

```
playbooks/          # Ansible playbooks
infra/              # Terraform infrastructure code
controller_config/  # AAP Controller configuration-as-code
extensions/eda/     # EDA rulebooks
ocp/gitops/         # OpenShift GitOps (ArgoCD) Helm charts
containers/         # Container/EE build definitions
site/               # React marketing site (Vite)
docs/               # MkDocs documentation
```

### Implementation Slices

Small, reviewable contributor tasks are documented under `docs/docs/implementation/`. Start with the Execution Environment BuildConfig slice when adding a new shared EE image.

## Making Changes

### Ansible Playbooks & Roles

- Follow existing naming conventions (`snake_case` for variables, `NN_description.yml` for ordered playbooks)
- Use FQCNs for all modules (e.g., `ansible.builtin.debug`, not `debug`)
- Lint with `ansible-lint` before submitting

### Infrastructure (Terraform)

- Changes go in `infra/aws/`
- Always run `terraform fmt` and `terraform validate`

### GitOps (Helm Charts)

- Charts are in `ocp/gitops/`
- Use `helm lint` to validate
- Use `argocd.argoproj.io/sync-wave` annotations for ordering

### EDA Rulebooks

- Rulebooks go in `extensions/eda/rulebooks/`
- Source plugins go in `extensions/eda/plugins/event_source/`

## Code Quality

Run these before submitting a PR:

```bash
yamllint -c .yamllint.yml .
ansible-lint
helm lint ocp/gitops/bootstrap
```

## Submitting a Pull Request

1. Push your branch to your fork
2. Open a PR against `main`
3. Describe what changed and why
4. Link any related ServiceNow incidents or GitHub issues

## Questions?

Open an issue on GitHub or reach out in the project's DevSpaces workspace.
