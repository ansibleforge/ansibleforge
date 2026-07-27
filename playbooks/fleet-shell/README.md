# Fleet command runner

`run_command.yml` runs one operator-supplied command across selected hosts and
reports per-host rc, stdout and stderr. It is fronted by the **Fleet - Run
Command** job template (`controller_job_templates.d/fleet_shell.yml`).

## Why a template instead of ad hoc commands

AAP's built-in Ad Hoc Commands feature does the same job, but the permission it
needs — the inventory `Ad Hoc` role — applies to *every host in that
inventory*. Execute on this template is a per-template grant instead, and it
comes with a survey, scheduling, notifications, workflow embedding, and an
EDA/ServiceNow launch path. Use ad hoc for your own one-offs; use this when
anyone else needs the capability.

## Guard rails

- Defaults to `ansible.builtin.command`, which does not invoke a shell. Turn on
  **Use shell** only when you need pipes, redirects or globs.
- Privilege escalation is off by default.
- A **Limit** is required; an unscoped launch aborts unless **Allow fleet-wide**
  is explicitly set to true.
- **Batch size** maps to `serial`, so a risky command can be staged.

None of these change the underlying fact that this runs operator-supplied
commands, optionally as root. Who holds Execute on the template is the security
boundary.

## Running it from the command line

Pass extra vars as JSON:

```bash
ansible-playbook playbooks/fleet-shell/run_command.yml \
  -l tag_Environment_dev -e '{"fleet_command": "systemctl status sshd"}'
```

Not `-e fleet_command='systemctl status sshd'`. Ansible shlex-splits the
`key=value` form, so a command with arguments silently arrives truncated to its
first word — `id -un` becomes `id`, which still exits 0 and returns plausible
output. AAP surveys send extra vars as JSON, so this only affects direct
`ansible-playbook` runs.

## Prerequisite: the machine credential

`Linux Fleet - EC2` (`controller_credentials.d/linux_fleet.yml`) reads its
private key from Vault `secret/linux-fleet`, seeded by the vault config job
from a k8s secret:

```bash
oc create secret generic linux-fleet-credentials -n secrets \
  --from-file=ssh_private_key=/path/to/fleet-key.pem
```

Then re-run the vault config job (or re-sync the vault Argo app) and apply CaC.

## Fleet state as of 2026-07-27

The `VM Portal - AWS` inventory is not uniformly reachable with one key, and
not every host in it is a sensible target:

| Host | Platform | AWS key pair | Notes |
|---|---|---|---|
| `matt` | RHEL | `ocpkey` | |
| `mcp-demo` | RHEL | `htfenner-laptop` | personal key, not an automation key |
| `iis-demo` | Windows | – | WinRM, not bash |
| `ocp-r7s88-master-0` | Linux/UNIX | – | RHCOS control-plane node — do not target |
| `ssh-term-test` | Linux/UNIX | – | no key pair recorded |

The credential holds one key, so it will authenticate to whichever hosts carry
that key pair. Re-keying the Linux hosts onto a single automation key pair is
the clean fix; until then expect partial coverage and scope the Limit
accordingly.
