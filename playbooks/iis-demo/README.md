# IIS auto-heal demo

A Windows EC2 host running IIS, plus an EDA loop: `IIS Chaos` plants a
`fail.flag` every 90–120s, `/health.aspx` starts returning 500, the
`IIS Auto-Heal` rulebook sees it and launches `IIS Demo - Restart IIS`, which
clears the flag and runs `iisreset`.

## How the host address is resolved

The three templates that connect *into* the host — Trigger Error, Restart IIS,
Chaos Tick — run against the **`VM Portal - AWS`** inventory and target the
host named `iis-demo`. That inventory's `aws_ec2` source composes
`ansible_host` from `public_ip_address`, so the address is resolved from AWS at
launch rather than stored anywhere.

Provision, Rotate Password and Destroy stay on `Localhost`: they drive the AWS
API rather than connecting to the host.

The `IIS Demo Secrets` credential still supplies `IIS_ADMIN_PASSWORD`. It also
still carries `IIS_HOST`, but **only** because `controller_config/dispatch.yml`
derives the EDA activation's `IIS_HEALTH_URL` from it. No playbook reads
`IIS_HOST` any more.

## Why there is an Elastic IP

An auto-assigned EC2 public IP changes on every stop/start. That is not
hypothetical — on 2026-07-27 the instance was stopped overnight, restarted at
15:06 UTC with a new address, and roughly 500 jobs failed over the following
six hours with WinRM connect timeouts against the old one. IIS itself was
healthy the whole time.

Dynamic inventory alone would not have prevented that, because the EDA
rulebook's `url_check` source polls a static `IIS_HEALTH_URL` extra var and
does not read AAP inventory. So the health check would have kept reporting
"down" against a dead address and kept firing heals forever.

`provision.yml` therefore allocates and associates an Elastic IP, which pins
the address for the life of the instance and keeps the health URL valid.
`destroy.yml` releases it — AWS bills for an allocated-but-unassociated EIP, so
skipping that leaves a silent charge behind.

## After anything changes the address

If the EIP is ever replaced, update both, in this order:

1. Set `IIS_HOST` on the `IIS Demo Secrets` credential to the new address.
2. Run the CaC dispatch job template, which patches the `IIS Auto-Heal`
   activation's `IIS_HEALTH_URL`.
3. Restart the `IIS Auto-Heal` activation so it picks up the new extra var.

Step 2 is easy to forget: fixing only the credential leaves the rulebook
polling the old address, so the heal loop keeps firing even though the
playbooks now reach the host fine.

## Debug checklist

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://<address>/health.aspx   # expect 200
aws ec2 describe-instances --region us-east-2 --instance-ids <id> \
  --query 'Reservations[0].Instances[0].PublicIpAddress'
```

A WinRM **timeout** (rather than connection refused) on 5985 almost always
means the address is wrong, not that the service is down.
