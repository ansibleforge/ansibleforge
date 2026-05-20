# RHEL Lightspeed Self-Healing Demo

Reference for the **Detect → Route → Decide → Execute** architecture using Red
Hat Lightspeed (Insights) events, Event-Driven Ansible, and AAP.

## What's wired up

| Layer | Object |
|---|---|
| Rulebook | `extensions/eda/rulebooks/lightspeed-self-heal.yml` |
| Playbook | `playbooks/lightspeed-demo/apply_remediation.yml` |
| Job Template (CaC) | `controller_config/env/Default/env/common/controller_job_templates.d/lightspeed_demo.yml` |
| EDA Activation (CaC) | `controller_config/env/Default/env/common/eda_rulebook_activations.d/lightspeed_demo.yml` |

Only **Rule 1** has a concrete JT in CaC (`Lightspeed - Apply remediation playbook`).
Rules 2-4 reference workflow templates that are intentionally not provisioned —
bring those up before enabling them.

## Why the EDA activation ships disabled

Three prerequisites must be met before it can start successfully:

1. **Vault var `lightspeed_webhook_token`** — any long random string
   (`openssl rand -hex 32`). The activation extra_vars substitute it as
   `LIGHTSPEED_WEBHOOK_TOKEN`, which the rulebook source uses to authenticate
   inbound POSTs. Same value goes into the console.redhat.com webhook
   integration so they match.
2. **Listener reachable from console.redhat.com.** Either an AAP Event Stream
   (preferred — AAP creates a managed public URL) or a manual OCP Route
   fronting a Service on the activation pod's port 5000.
3. **`Lightspeed Demo Secrets`** credential populated with real values
   (`rh_console_offline_token`, optional `slack_webhook_url`). The credential
   and credential type ship empty/placeholder via CaC; replace via AAP UI or
   update the vault-backed inputs. Already attached to the
   `Lightspeed - Apply remediation playbook` JT.

Once those are in place, flip `enabled: true` in
`eda_rulebook_activations.d/lightspeed_demo.yml`.

## Console.redhat.com setup

In **Settings → Integrations**:

1. Add a **Webhook** integration pointing at the activation URL.
2. Authenticate with the same `LIGHTSPEED_WEBHOOK_TOKEN`.
3. In **Notifications**, attach a **Behavior Group** that routes vulnerability,
   compliance, and malware-detection events to that webhook.

## Triggering an event for the demo

On a registered RHEL host:

```bash
# Force a fresh fact upload (cheap)
sudo insights-client

# Trigger a compliance policy failure deliberately
sudo dnf install -y openscap-scanner scap-security-guide
sudo oscap xccdf eval --profile xccdf_org.ssgproject.content_profile_stig \
  --results /tmp/results.xml \
  /usr/share/xml/scap/ssg/content/ssg-rhel9-ds.xml || true
```

Event flow: `insights-client → Lightspeed Advisor → Notifications → EDA webhook
→ rulebook condition match → AAP Job Template`.

## Watching the audit trail

- Lightspeed Event Log — outbound event.
- EDA activation log — rule match.
- AAP Job → Output — playbook run.
- Jobs are labeled `lightspeed-eda` for filtering.

## SLED / production notes

`rh_console_offline_token` and `slack_webhook_url` live in AAP credentials with
RBAC, never in playbook vars. For air-gap-adjacent environments, run the
remediation playbook through Satellite's Cloud Connector instead of calling the
console API directly.

For production: swap `run_job_template` to `run_workflow_template` on Rule 1 too
and put an approval node ahead of the remediation step.
