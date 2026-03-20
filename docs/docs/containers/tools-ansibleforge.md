# tools-ansibleforge

**Source:** `containers/tools-ansibleforge/`
**Base:** `registry.redhat.io/ubi9/ubi:latest`
**Used by:** DevSpaces workspaces (primary development container)

## Overview

The `tools-ansibleforge` image is a fully-loaded developer container designed to run inside an OpenShift DevSpaces workspace.
It includes everything needed to write, test, and ship Ansible automation — without installing anything locally.

## Installed tools

### Ansible

| Tool | Purpose |
|------|---------|
| `ansible-dev-tools` | Full Ansible developer toolchain (`ansible-core`, `ansible-lint`, `ansible-navigator`, `ansible-builder`, `molecule`) |
| `awxkit` | CLI and Python library for interacting with AAP/AWX |
| `ansible-galaxy` | Collection and role management (via ansible-core) |

### Cloud & infrastructure

| Tool | Purpose |
|------|---------|
| `aws` (AWS CLI v2) | Amazon Web Services management |
| `oc` / `kubectl` | OpenShift and Kubernetes cluster management |
| `helm` | Kubernetes package management |
| `terraform` | Infrastructure as Code |
| `govc` | VMware vSphere CLI |
| `vault` | HashiCorp Vault CLI |

### Development

| Tool | Purpose |
|------|---------|
| `podman` | Rootless container builds inside the workspace |
| `gh` | GitHub CLI |
| `1password-cli` (`op`) | 1Password secret management |
| `claude-code` | Anthropic Claude Code AI assistant |
| `powershell` | Cross-platform PowerShell for Windows automation |
| `vim`, `jq`, `wget` | General utilities |

### Languages & runtimes

| Runtime | Version |
|---------|---------|
| Python | 3.11 |
| Node.js | 20 |

### Network & directory

| Tool | Purpose |
|------|---------|
| `nmap` | Network scanning |
| `bind-utils` | DNS utilities (`dig`, `nslookup`) |
| `openldap-clients` | LDAP queries |
| `krb5-workstation` | Kerberos authentication |

## Ansible collections

All collections are installed at build time into `/collections`:

=== "AAP & Platform"
    - `ansible.controller`
    - `ansible.eda`
    - `ansible.hub`
    - `ansible.platform`
    - `infra.aap_utilities`
    - `infra.aap_configuration`
    - `infra.aap_configuration_extended`
    - `infra.ah_configuration`
    - `infra.controller_configuration`
    - `infra.eda_configuration`
    - `infra.ee_utilities`

=== "Cloud & Infrastructure"
    - `amazon.aws`
    - `cloud.terraform`
    - `cloud.terraform_ops`
    - `kubernetes.core`
    - `redhat.openshift`
    - `redhat.openshift_virtualization`

=== "Platform & OS"
    - `ansible.posix`
    - `ansible.utils`
    - `ansible.windows`
    - `community.windows`
    - `community.general`
    - `microsoft.ad`
    - `redhat.rhel_system_roles`
    - `redhat.satellite`

=== "Other"
    - `containers.podman`
    - `onepassword.connect`
    - `servicenow.itsm`

## Rootless Podman

The image is configured for rootless Podman inside DevSpaces workspaces.
It sets up `/etc/subuid` and `/etc/subgid` ranges for UID 10001 and configures `fuse-overlayfs` as the storage driver to avoid kernel overlay mount restrictions.

## Vault integration

The image includes `vault_env_reader.sh` configured as `ANSIBLE_VAULT_PASSWORD_FILE`.
This allows Ansible Vault encrypted files to be decrypted transparently using secrets from HashiCorp Vault, which are injected into the workspace pod at runtime by the Vault agent sidecar.
