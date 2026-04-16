# AnsibleForge Constitution

AnsibleForge is a GitOps-driven Ansible automation platform for Red Hat
environments (AAP, EDA, ServiceNow, AWS, OpenShift GitOps). This constitution
records the conventions every contribution — human or agent — must follow.

## Core Principles

### I. GitOps is the Source of Truth

All runtime state (OpenShift workloads, AAP Controller configuration, EDA
rulebook activations) is declared in this repository and reconciled by ArgoCD
or the Controller/EDA CaC dispatch playbooks. No out-of-band changes via
consoles or ad-hoc `oc`/`aap` commands: if it is not in git, it does not exist.

### II. Ansible Style is Non-Negotiable

- **FQCNs always.** Every module reference uses its fully qualified name
  (`ansible.builtin.debug`, `kubernetes.core.k8s`, `infra.controller_configuration.dispatch`).
  Bare module names are a lint failure.
- **snake_case variables** everywhere — no camelCase, no kebab-case, no mixed.
- **Ordered playbooks use `NN_description.yml`** (e.g. `01_prep.yml`,
  `02_deploy.yml`) so the execution order is visible from a directory listing.
- **`ansible-lint` profile `min`, offline mode** is the floor. New playbooks
  and roles must pass with no new warnings.

### III. Lint Gates Every Change

Before a PR is opened, the following must pass locally and in CI:

- `yamllint -c .yamllint.yml .` — 2-space indent, max line 200, no octals,
  `true|false|yes|no` only, min 1 space before inline comments.
- `ansible-lint` — scoped per `.ansible-lint` excludes
  (`docs/`, `infra/`, `ocp/terraform/`, `site/`, `containers/`, `helm/`).
- `helm lint ocp/gitops/bootstrap` — and any other touched chart.
- `terraform fmt` + `terraform validate` for anything under `infra/` or
  `ocp/terraform/`.
- **Pre-commit hooks (`yamllint`, `gitleaks`, `helmlint`) must be installed
  and passing.** Do not `--no-verify`.

### IV. ArgoCD Sync Waves are a Contract

Every Application in `ocp/gitops/bootstrap` sets
`argocd.argoproj.io/sync-wave` via its `syncWave` value, following:

| Wave | Purpose |
|------|---------|
| `0`  | Namespaces and foundational scaffolding |
| `1`  | Operators and operator subscriptions |
| `2`  | CRDs and operator-provided custom resources |
| `3`  | Workloads that depend on the above |
| `PostSync` | Vault configuration and other post-deploy bootstrap |

A new Application must choose its wave deliberately; if it does not fit the
table, the wave choice must be justified in the PR description.

### V. Secrets Never Live in Git

Plaintext credentials, tokens, API keys, and certificates never enter the
repository. The only accepted channels are:

- **HashiCorp Vault** surfaced via External Secrets Operator
  (`ocp/gitops/vault`, `ocp/gitops/external-secrets`).
- **AWS Secrets Manager** surfaced via External Secrets Operator for
  AWS-side infrastructure.

`gitleaks` (pre-commit + CI via TruffleHog) is the enforcement layer; a
gitleaks hit blocks the merge, and the fix is to rotate the secret and route
it through Vault/ASM, not to whitelist the finding.

### VI. Container Images Build in CI to GHCR

All container images (tools, EE, DE, devfile-registry, site, Keycloak
extensions) are produced by `.github/workflows/container-build.yml` and
pushed to `ghcr.io/<org>/<image>`. Local `docker build` / `podman build`
is for development only — production tags come from a tagged CI run. Image
references in `devfile.yaml`, Helm charts, and EE definitions must pin to
images published through this pipeline.

### VII. EDA Layout is Fixed

- Rulebooks live in `extensions/eda/rulebooks/` and are named for the event
  they respond to (e.g. `snow-vm-provision.yml`, `ee-build-on-change.yml`).
- Custom event source plugins live in `extensions/eda/plugins/event_source/`.
- Rulebook activations are declared in
  `controller_config/env/Default/env/common/eda_rulebook_activations.d/`
  and applied by the EDA dispatch play in `controller_config/dispatch.yml`.

New EDA work that deviates from this layout will not be discovered by the
Controller/EDA CaC dispatch and will silently fail to activate.

### VIII. Controller CaC Flows Through `dispatch.yml`

AAP Controller and EDA Controller configuration is authored as
filetree-structured YAML under `controller_config/env/<org>/` and applied
exclusively through `controller_config/dispatch.yml`, which invokes
`infra.controller_configuration.filetree_read` +
`infra.controller_configuration.dispatch` and
`infra.eda_configuration.dispatch`. Do not add one-off playbooks that mutate
Controller state; extend the filetree instead.

## Additional Constraints

- **Terraform** code is confined to `infra/aws/` and `ocp/terraform/`. Run
  `terraform fmt` before committing; CI will reject unformatted code.
- **Helm charts** under `ocp/gitops/` must pass `helm lint` and should use
  `argocd.argoproj.io/sync-wave` annotations for any resource with ordering
  dependencies beyond the Application-level wave.
- **YAML** files follow the shared `.yamllint.yml`: 2-space indent, max line
  200, no octal literals, truthy values restricted to `true|false|yes|no`,
  max one empty line between blocks.
- **Ansible Execution Environment** changes go in
  `containers/ee-ansibleforge/execution-environment.yaml`; do not pin
  collections ad-hoc in playbook `collections/requirements.yml` files when
  the collection can live in the shared EE.
- **Development happens in OpenShift DevSpaces.** The `devfile.yaml` at the
  repo root is the canonical dev environment; keep `tools` / `ee` image
  references in sync with the images produced by `container-build.yml`.

## Development Workflow

1. **Fork and branch.** Work from a feature branch off `main`.
2. **Open in DevSpaces** (`https://devspaces.apps.ocp.fire.ansibleforge.dev/#https://github.com/<username>/ansibleforge`)
   or a local clone with pre-commit installed.
3. **Make the change** within the conventions above.
4. **Run the lint gates locally** — `yamllint`, `ansible-lint`, `helm lint`,
   `terraform fmt/validate` as applicable — plus `pre-commit run --all-files`.
5. **Open a PR against `main`.** Describe the change, link any ServiceNow
   incident / GitHub issue, and explicitly note any sync-wave choices or
   new secret paths.
6. **CI must be green** (`ci.yml`, `container-build.yml` where applicable,
   `pages.yml` for site/docs changes) before merge.

## Governance

This constitution supersedes ad-hoc preferences. When a change would violate
a principle here, the PR must either (a) conform or (b) amend this document
in the same PR with an explicit rationale and, where the rule changed,
migration notes for existing code. Amendments require review from a project
maintainer.

Agents (Claude Code, Codex CLI, and others) operating in this repository are
bound by this constitution in the same way human contributors are. The
`CLAUDE.md` and `AGENTS.md` files at the repo root remain the runtime
guidance surface; this constitution is the authority they defer to.

**Version**: 1.0.0 | **Ratified**: 2026-04-16 | **Last Amended**: 2026-04-16
