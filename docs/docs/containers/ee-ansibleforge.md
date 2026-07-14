# ee-ansibleforge

**Source:** `containers/ee-ansibleforge/`
**Base:** `registry.redhat.io/ansible-automation-platform-27/ee-minimal-rhel9:2.16`
**Used by:** Ansible Automation Platform job execution

## Overview

`ee-ansibleforge` is a custom Ansible Execution Environment (EE) built on the AAP 2.7 minimal RHEL 9 base image.
It extends the base with the same collection set used in the developer workspace, plus Terraform and OpenShift client tools, so automation written in the DevSpaces workspace runs identically in AAP.

## Build process

EEs are built using `ansible-builder`. The `execution-environment.yaml` defines dependencies; `ansible-builder create` generates the build context in `context/` before the OpenShift BuildConfig runs.

```bash
# Generate build context (run locally or via Tekton pipeline)
cd containers/ee-ansibleforge
ansible-builder create

# Build in OpenShift (via shared-builds BuildConfig)
oc start-build bc-ee-ansibleforge -n shared-builds --follow
```

See [Execution Environment BuildConfig](../implementation/execution-environment-buildconfig.md) for the reusable pattern used to add more EEs.

## System dependencies

| Package | Purpose |
|---------|---------|
| `terraform` | Infrastructure as Code execution |
| `gcc` / `gcc-c++` / `python3-devel` | Python package compilation |
| `openldap-devel` | LDAP integration |
| `systemd-devel` | Systemd interaction |
| `python3-pip` / `python3-setuptools` | Python package management |

OpenShift client tools (`oc`, `kubectl`) are enabled via the `rhocp-4.19` repo during the build.

## Ansible collections

The EE includes the same comprehensive collection set as the `tools-ansibleforge` container, covering AAP management, cloud providers, OpenShift, Windows, satellite, and more. See the [tools-ansibleforge collections list](tools-ansibleforge.md#ansible-collections) for the full set.

## Parity with tools-ansibleforge

Both images share the same `requirements.yaml` (collections) and `requirements.txt` (Python packages), ensuring that automation developed in a DevSpaces workspace behaves identically when run by AAP using this EE.
