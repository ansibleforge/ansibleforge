# Arista VXLAN VTEP — HER-without-unicast-tunnel check

This playbook runs `show platform trident vxlan vtep detail` on your Arista EOS
devices and flags any remote **VTEP IP** that has a **HER tunnel** programmed in
hardware but **no unicast VXLAN tunnel**. That is the condition you described:
an entry with `vxlanHwHerTunnel` but no `vxlanTunnel` for the same IP.

---

## 1. What am I actually looking at? (plain-English background)

**VXLAN** lets you stretch Layer‑2 networks across a Layer‑3 fabric by wrapping
Ethernet frames in UDP/IP. The device that does the wrapping/unwrapping is a
**VTEP** (VXLAN Tunnel End Point). Each switch in the fabric is a VTEP, and it
keeps a list of the *other* (remote) VTEPs it talks to — those are the IPs in
this command's output.

`show platform trident vxlan vtep detail` is a **hardware / data-plane** command.
"Trident" is the Broadcom ASIC family in many Arista switches, and this command
shows what is actually programmed into the chip's forwarding tables — not just
what the control plane (EVPN/BGP) *thinks* should be there. That distinction is
the whole point: it can catch cases where the software state and the silicon
state disagree.

For each remote VTEP there are two different kinds of forwarding entry:

| Entry | What it carries | When it's needed |
|-------|-----------------|------------------|
| **`vxlanHwHerTunnel`** — Head‑End Replication tunnel | **BUM** traffic: Broadcast, Unknown‑unicast, and Multicast. The switch replicates a copy of each flooded frame to every remote VTEP in this list. | Always, for any remote VTEP that's part of an L2 domain (VNI) you share. |
| **`vxlanTunnel`** — unicast tunnel | **Known unicast**: traffic to a specific MAC address that the switch has already learned lives behind that remote VTEP. | Once the switch has learned at least one remote MAC behind that VTEP. |

### Why "HER but no unicast" is worth a look

If a remote VTEP shows up in the **HER (flood) list** but has **no unicast
tunnel** programmed, it can mean the hardware never installed the path used to
forward *known unicast* traffic to MACs behind that VTEP. In that situation,
unicast traffic to those hosts can be **black‑holed or stuck flooding** instead
of being forwarded cleanly — a real but intermittent‑looking data‑plane problem
that the control plane may report as "fine."

### …but it is a *screening* signal, not a proven fault

**Important, so you don't chase 500 false alarms:** a HER tunnel with no unicast
tunnel is frequently **completely normal**. The unicast tunnel/adjacency is
often only programmed *on demand* — once the switch has actually learned a
remote MAC behind that VTEP. A VTEP that's reachable but has no learned MACs
behind it yet will legitimately show HER‑only. So treat a hit as **"investigate
this device/IP,"** not **"this is broken."** See *Next steps* below.

---

## 2. What the playbook produces

After a run, look in `artifacts/` (next to the playbook, on the AAP execution
node / controller):

- `vxlan_vtep_report.txt` — one consolidated summary: which devices have suspect
  VTEPs, which IPs, totals, and which devices returned no data. For each suspect
  IP it also shows the hex key it was converted to and whether that key was
  present in the hardware MPLS entry table (see §3a).
- `<hostname>.raw.txt` — the raw command output from every device, so you can
  eyeball anything by hand.
- `<hostname>.mpls_entry.txt` — only written for devices with a suspect VTEP: the
  raw `platform trident diag d chg MPLS_ENTRY_SINGLE` dump used for the hardware
  cross-check.

Each device also logs a one‑line result in the job output.

---

## 3. Step 0 — validate the parser on ONE device first (do not skip)

I built the parser from the field names you described, **not** from a real
sample of your output, so confirm it reads your EOS build correctly before
trusting it across 500 devices.

The parser assumes the output is **indentation‑structured**: each remote VTEP is
a header line containing its IP at the outer margin, with its detail lines
(including `vxlanHwHerTunnel` / `vxlanTunnel`) indented underneath. The absolute
indentation doesn't matter, only that detail lines are indented *more* than the
header. This is what keeps `nexthop`/underlay IPs inside a block from being
mistaken for new VTEPs.

To validate:

1. Run against a single known‑good device (set `target_hosts` / limit to one
   host), or just SSH in and capture the command output to a file `sample.txt`.
2. Sanity‑check the parser against that file locally:

   ```bash
   python3 - <<'PY'
   import sys; sys.path.insert(0, 'filter_plugins')
   from vxlan_vtep import parse_vxlan_vtep
   raw = open('sample.txt').read()
   r = parse_vxlan_vtep(raw)
   print("total VTEPs :", r["total"])
   print("suspect IPs :", r["suspect_ips"])
   PY
   ```

3. Compare `total` against the number of remote VTEPs you expect, and eyeball a
   couple of the `suspect IPs` against the raw output by hand.

If the field names differ on your build (e.g. different capitalization or a
different label), change `her_token` / `uni_token` at the top of
`check_vxlan_vtep.yml` — matching is case‑ and whitespace‑insensitive. If the
output is *not* indentation‑structured, tell me what it looks like and I'll
adjust the parser.

---

## 3a. Step 0b — validate the hardware MPLS cross-check

For every **suspect** VTEP IP (HER tunnel but no unicast tunnel), the playbook
does a second-level confirmation against the silicon:

1. It converts the VTEP IP to its packed 32-bit hex form and **strips the
   leading-zero padding** — e.g. `10.1.1.10` → `0x0a01010a` → **`a01010a`**.
2. It dumps `platform trident diag d chg MPLS_ENTRY_SINGLE` from the device.
3. It searches that output (case-insensitive) for the hex key and reports
   `present` / `ABSENT` plus a match count per IP.

The strip is deliberate: it makes the key match whether the dump prints the
value padded (`0x0a01010a`) or not (`0xa01010a`), since `a01010a` is a substring
of both.

**Validate this the same way you validated the parser — on ONE real device
before trusting 500 runs:**

1. On a device that has a known suspect VTEP, capture the dump by hand:

   ```bash
   # in enable mode on the switch
   platform trident diag d chg MPLS_ENTRY_SINGLE
   ```

2. Confirm the hex key and the search logic locally against that capture:

   ```bash
   python3 - <<'PY'
   import sys; sys.path.insert(0, 'filter_plugins')
   from vxlan_vtep import ip_to_trident_hex, trident_mpls_hits
   ip = '10.1.1.10'                       # <- a suspect IP from your device
   print('hex key  :', ip_to_trident_hex(ip))
   mpls = open('mpls_sample.txt').read()  # <- the captured dump
   for h in trident_mpls_hits([ip], mpls):
       print(h['ip'], 'found=' + str(h['found']), 'matches=' + str(h['match_count']))
       for line in h['matches']:
           print('   ', line.strip())
   PY
   ```

3. Eyeball the printed `hex key` against the value as it actually appears in the
   dump, and confirm the matched lines are the right table entries.

Two things to check on your build:

- **Command form.** This is a Broadcom diag-shell command, run under the same
  `enable` mode the playbook already requests — note there is **no `show`
  prefix**. If your EOS build wraps it differently, change `mpls_command` at the
  top of `check_vxlan_vtep.yml`.
- **Field width / false hits.** Matching is a case-insensitive substring search.
  A short stripped key (e.g. `a01010a`) *could* in principle appear inside a
  wider hex field in the dump and produce a spurious `present`. If you see that
  on your output layout, say the word and I'll tighten the match to a hex word
  boundary.

---

## 4. Running it in Ansible Automation Platform

Files in this directory:

```
check_vxlan_vtep.yml          # the playbook
selftest_vxlan_vtep.yml       # offline self-test (no hardware/credential) — see §7
filter_plugins/vxlan_vtep.py  # the parser + IP→hex / MPLS-lookup filters
templates/report.j2           # consolidated report template
group_vars/arista_vxlan.yml   # connection settings (no secrets)
inventory.example.yml         # sample inventory layout
requirements.yml              # required collections
ansible.cfg                   # local-run defaults (NOTE: AAP ignores this — see §7)
tests/                        # canned sample output + inventory for the self-test
```

**Set up the Job Template:**

1. **Project** — put this directory in a Git repo and add it as a Project in
   AAP (Resources → Projects), then Sync.
2. **Inventory** — create an Inventory with your 500 devices in a group named
   `arista_vxlan` (or pass `target_hosts=<your_group>` as an extra var). The
   connection settings in `group_vars/arista_vxlan.yml` apply automatically.
3. **Credential** — attach a **Machine** credential with the SSH username and
   password (or key) for the switches. If the devices use an enable secret, put
   it in the credential's **Privilege Escalation Password** field. The playbook
   already requests `enable` (privileged) mode, which these platform commands
   need.
4. **Execution Environment** — use the standard AAP **Network** EE, or any EE
   that includes `arista.eos` and `ansible.netcommon` (see `requirements.yml`).
5. **Job Template** — point it at `check_vxlan_vtep.yml`. For 500 devices, raise
   **Forks** (e.g. 25–50) so it fans out instead of running one at a time.
   Optionally enable **job slicing** to spread the run across execution nodes.
6. (Optional) Run with extra var `fail_on_suspect=true` if you want the job to
   end **failed** when any device has a suspect VTEP (useful for alerting). It's
   `false` by default so a full run always completes and produces the report.

**Reading results:** open `artifacts/vxlan_vtep_report.txt` (or surface it via a
job artifact / fact). Lines marked `[SUSPECT]` list the device and the VTEP IP(s)
to investigate; `[NO DATA]` means that device errored or returned nothing.

> Note: in an ephemeral execution environment the `artifacts/` directory lives
> for the duration of the job. If you need the report to persist, have AAP
> collect it (e.g. `set_stats`/job artifacts) or push it somewhere durable — say
> the word and I'll wire that in.

---

## 5. Next steps when a device is flagged

A `[SUSPECT]` hit means: *go look*, not *it's broken*. On the flagged device:

- Check whether MACs are actually learned behind that remote VTEP
  (`show vxlan address-table`, `show mac address-table`). No remote MACs ⇒ the
  HER‑only state is expected and benign.
- Compare control‑plane vs hardware: `show bgp evpn`, `show vxlan vtep`,
  `show vxlan flood vtep` against this hardware view. A mismatch (control plane
  knows the VTEP/MAC but hardware has no unicast tunnel) is the genuinely
  interesting case.
- If hardware and software disagree on a VTEP that *should* have unicast
  forwarding, that's worth a TAC case — capture the raw output (you already have
  it in `artifacts/`).

---

## 6. Honest limitations

- The parser was written from your description of the field names, not a
  verified sample of your EOS output — **Step 0 exists for exactly this reason.**
- It relies on the output being indentation‑structured (header IP at the margin,
  detail lines indented). If your build prints a flat or differently‑shaped
  layout, the per‑VTEP grouping needs adjusting.
- "HER without unicast" is a heuristic screen, not a diagnosis — see §1 and §5.

---

## 7. Offline self-test (run the logic in AAP with no hardware)

`selftest_vxlan_vtep.yml` exercises the **real** parser and the real
parse → MPLS-cross-check → assert → report logic against **canned** `show`
output under `tests/`, so you can watch the playbook pass on a clean device and
fail on a suspect device without any Arista switch or Machine credential. The
only thing it stubs is the live `arista.eos.eos_command` SSH call.

`tests/` contains:

```
tests/clean.sample.txt    # device where every VTEP has HER + unicast  -> 0 suspect
tests/suspect.sample.txt  # device with 10.2.2.20 = HER but no unicast  -> 1 suspect
tests/suspect.mpls.txt    # fake MPLS_ENTRY_SINGLE dump containing 10.2.2.20's hex key
tests/inventory.test.yml  # two fake localhost "devices": leaf-clean, leaf-suspect
```

### Run it locally (from this directory)

```bash
# Your ansible.cfg sets stdout_callback=yaml, a plugin removed in newer
# ansible-core. Override it for local runs (AAP does not use this cfg):
export ANSIBLE_STDOUT_CALLBACK=default ANSIBLE_CALLBACK_RESULT_FORMAT=yaml

# SEE IT WORK  — suspect host is reported, run still succeeds (exit 0)
ansible-playbook -i tests/inventory.test.yml selftest_vxlan_vtep.yml

# SEE IT FAIL  — assert trips on the suspect host (exit 2)
ansible-playbook -i tests/inventory.test.yml selftest_vxlan_vtep.yml -e fail_on_suspect=true
```

### Run it as a Job Template in AAP

> **Why this playbook lives in `VTEP/`, not `tests/`:** AAP does **not** read
> this directory's `ansible.cfg`, so the `filter_plugins = ./filter_plugins`
> line never applies. AAP finds the custom filters only because Ansible
> auto-discovers a `filter_plugins/` directory **adjacent to the playbook**.
> `selftest_vxlan_vtep.yml` sits next to `filter_plugins/` for exactly that
> reason — moving it under `tests/` would break filter discovery in AAP.

1. **Project** — the same Project you use for the real playbook (Sync it so the
   new files land).
2. **Inventory** — add an Inventory **sourced from this Project** pointing at
   `VTEP/tests/inventory.test.yml`. That brings in the two fake hosts
   (`leaf-clean`, `leaf-suspect`), their `sample_file`/`mpls_file` vars, and
   `ansible_connection: local`. No live hosts, no inventory plugin needed.
3. **Credential** — **none.** The self-test runs on localhost inside the EE and
   never opens an SSH session, so no Machine credential is required.
4. **Execution Environment** — any EE works. The self-test uses only
   `ansible.builtin` plus the bundled filters; it does **not** need `arista.eos`
   or `ansible.netcommon` (it stubs the `eos_command` calls).
5. **Job Template** — set **Playbook** to `VTEP/selftest_vxlan_vtep.yml` and the
   Inventory from step 2. Launch it: `leaf-suspect` is flagged `[SUSPECT]` and
   the job ends **successful**.
6. **See it fail in AAP** — add extra var `fail_on_suspect: true` on the Job
   Template (or check **Prompt on launch** and supply it at launch). Now the
   `assert` trips on `leaf-suspect` and the **job ends failed** — handy as a
   smoke test or alerting demo.

The job output shows the per-device lines and the per-suspect MPLS hit; the
consolidated `tests`-driven report is written to `artifacts/` in the job's
(ephemeral) working dir — see the §4 note on persisting artifacts if you want it
to survive the run.
