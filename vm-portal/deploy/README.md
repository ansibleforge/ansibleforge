# Deploying the in-browser SSH terminal

The terminal feature adds a second container, **`vm-portal-gateway`**, that bridges a
browser WebSocket to an EC2 instance using **EC2 Instance Connect (EIC)** with ephemeral,
in-memory keys. The portal's nginx proxies `wss://<portal>/ws/terminal` to it.

```
browser xterm.js ── wss /ws/terminal ──▶ nginx (vm-portal) ──▶ host.containers.internal:8091
                                                                  └▶ vm-portal-gateway
   validate OAuth token (AAP /api/gateway/v1/me/) → DescribeInstances → authorize
   (running + ManagedBy=ansible) → ephemeral ed25519 key → SendSSHPublicKey → ssh2 PTY
```

## Operator prerequisites

These must exist or "Connect (SSH)" will fail with a specific error in the terminal:

1. **IAM credentials for the gateway.** It runs in podman on a non-AWS host, so there is no
   instance profile — supply an IAM principal's keys. Attach `iam-policy-gateway.json`
   (least privilege: `ec2:DescribeInstances` + tag/region/osuser-scoped
   `ec2-instance-connect:SendSSHPublicKey`). Deliver as podman secrets (below), never plaintext.
2. **Security group inbound `:22`** from the gateway host's public egress IP. This is the most
   common first-run failure → surfaced as `ssh_connect_timeout`.
3. **EIC-capable AMI.** Amazon Linux 2/2023 and Ubuntu ship the EC2 Instance Connect agent.
   RHEL/Windows AMIs the portal can also provision will **not** work → surfaced as
   `ssh_auth_failed`.
4. **Public IPv4** on the instance. Private-only instances need an EC2 Instance Connect
   Endpoint, which is out of scope here → surfaced as `no_public_ip`.

## Automating the prerequisites from AAP

Prerequisites 1–2 (and optionally 4) can be done by the job template wrapping
**`playbooks/vm-portal/setup-terminal-gateway-prereqs.yml`** instead of by hand. It
creates the least-privilege IAM policy + user + access key, opens SSH (`:22`) on the
target security group from the gateway's egress IP, and — when `manage_podman_secrets=true`
— installs the `vmp_aws_*` podman secrets on the gateway host. Survey/extra vars:

| var | required | meaning |
|-----|----------|---------|
| `target_security_group_id` | yes | `sg-…` your instances use |
| `gateway_egress_cidr` | yes | gateway host's public egress IP `/32` (`curl -s https://checkip.amazonaws.com` on the host) |
| `aws_region` | no | default `us-east-2` |
| `manage_podman_secrets` | no | `true` to also create the podman secrets |
| `gateway_host` | no | inventory host running podman (when managing secrets) |

The job template's AWS credential needs **IAM write + `AuthorizeSecurityGroupIngress`**
(broader than the EC2-only provisioning credential) — use a dedicated admin credential.
It still won't fix prerequisite 3 (EIC-capable AMI + public IP), which is a per-instance
provisioning choice.

## Build & deploy (rootless podman on the AAP host)

```bash
# 1. Pull the merged code into the build clone.
cd ~/vm-portal-build/vm-portal-repo
git pull --ff-only origin main

# 2. Create the AWS credential secrets once (paste value, then Ctrl-D).
podman secret create vmp_aws_access_key_id -
podman secret create vmp_aws_secret_access_key -

# 3. Build both images (the portal image carries the new nginx /ws/terminal block).
podman build -t vm-portal-gateway ./gateway
podman build -t vm-portal .

# 4. Install the gateway quadlet and (re)start both services.
cp deploy/vm-portal-gateway.container ~/.config/containers/systemd/
systemctl --user daemon-reload
systemctl --user restart vm-portal-gateway vm-portal
```

## Configuration

The gateway is configured entirely by environment (see `gateway/.env.example` and the
`Environment=` lines in `vm-portal-gateway.container`). The SPA side reads
`VITE_TERMINAL_WS_PATH` (default `/ws/terminal`) and `VITE_TERMINAL_SSH_USER`
(default `ec2-user`) at build time.

**Sandbox caveat:** `AAP_TLS_INSECURE=true` skips verification of AAP's self-signed cert —
the same posture as the existing nginx `proxy_ssl_verify off`. Replace with proper CA
validation before exposing beyond a sandbox.
