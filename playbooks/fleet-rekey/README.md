# Fleet re-keying

`rekey_authorized_keys.yml` converges the Linux fleet onto one automation key
pair, so the `Linux Fleet - EC2` machine credential reaches every host instead
of the current mix of `ocpkey`, `htfenner-laptop`, and hosts with no key at
all. It is fronted by the **Fleet - Re-key Authorized Keys** job template.

## The bootstrap constraint

Re-keying a host over SSH requires already being able to log into it. This
playbook cannot reach a host whose current key you do not hold — there is no
way around that with SSH alone.

So re-keying is **per-key-pair, not per-fleet**. Launch the template once for
each existing key, selecting the machine credential that can log into those
hosts today and limiting to just them. Repeat until every host carries the
automation key.

## Add, verify, then prune

The playbook only **adds** the automation key by default and leaves existing
keys in place, so a failed re-key is never a lockout. Removing the old keys is
a separate opt-in requiring both `prune_other_keys: true` and the literal
confirmation `REMOVE-OTHER-KEYS`.

Do not prune until you have proven the new key authenticates:

1. Run **Fleet - Re-key Authorized Keys** with the old credential (adds only).
2. Run **Fleet - Run Command** against the same hosts with the
   `Linux Fleet - EC2` credential and something harmless like `true`.
3. Only if step 2 succeeds, re-run step 1 with pruning enabled.

Pruning before verifying locks you out of the host permanently. The playbook
reads authorized_keys back and asserts the automation key is present before it
will consider pruning, but that only proves the key is on disk — it does not
prove it authenticates. Step 2 is what proves that.

## What this will and won't reach

| Host | Platform | Current key | Re-key path |
|---|---|---|---|
| `matt` | RHEL | `ocpkey` | credential holding `ocpkey` |
| `mcp-demo` | RHEL | `htfenner-laptop` | credential holding that key, or AWS SSM (it has an SSM instance profile) |
| `ssh-term-test` | Linux/UNIX | none recorded | **no SSH path and no SSM instance profile** — likely needs rebuild or volume rescue |
| `iis-demo` | Windows | – | not applicable, WinRM |
| `ocp-r7s88-master-0` | RHCOS | – | **refused by the playbook** — see below |

The playbook hard-fails on ostree-managed nodes. On RHCOS the authorized keys
are owned by the Machine Config Operator: editing them directly is reverted and
can degrade the node. Re-key OpenShift nodes through a MachineConfig instead.

## Generating the automation key pair

```bash
ssh-keygen -t ed25519 -C ansibleforge-automation -f fleet-key
```

The **public** half (`fleet-key.pub`) goes into the survey — it is not secret.
The **private** half seeds the credential:

```bash
oc create secret generic linux-fleet-credentials -n secrets \
  --from-file=ssh_private_key=fleet-key
```

Optionally import the pair into EC2 as a key pair so future instances launch
with it already installed, which avoids growing this problem again.
