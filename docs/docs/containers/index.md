# Containers

AnsibleForge ships two purpose-built container images, both built from source in the internal OpenShift registry via the [Shared Builds](../infrastructure/shared-builds.md) component.

| Image | Base | Purpose |
|-------|------|---------|
| [tools-ansibleforge](tools-ansibleforge.md) | UBI 9 | Developer workspace container |
| [ee-ansibleforge](ee-ansibleforge.md) | AAP 2.6 EE Minimal (RHEL 9) | Ansible Execution Environment |
