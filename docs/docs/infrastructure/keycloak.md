# Keycloak

**Chart:** `ocp/gitops/keycloak/`
**Namespace:** `keycloak`

## Overview

Keycloak is the identity provider for AnsibleForge, providing SSO across OpenShift, Gitea, GitHub, and other applications. It is deployed via the RHBK (Red Hat Build of Keycloak) Operator.

## Components deployed

- Keycloak Operator Subscription
- Keycloak instance with cluster-specific hostname
- `KeycloakRealmImport` for the `sso` realm with pre-configured identity providers
- ExternalSecrets pulling credentials from AWS Secrets Manager
- ConsoleLink for access from the OpenShift application menu

## Realm configuration

The `sso` realm is configured via a `KeycloakRealmImport` resource that includes:

- **idp-4-ocp** client — OIDC client used by OpenShift OAuth to authenticate users via Keycloak
- **sysadmin** user — local Keycloak user with password from AWS Secrets Manager
- **Identity providers** (conditionally enabled via Helm values):
    - **GitHub** — GitHub App OAuth for external authentication

## Secrets

All secrets are stored in AWS Secrets Manager under per-cluster keys and synced via ExternalSecrets:

| AWS SM Key | Properties | K8s Secret |
|------------|-----------|------------|
| `<clusterName>/keycloak` | `db-password` | `keycloak-db-secret` |
| `<clusterName>/keycloak` | `sysadmin-password` | `keycloak-sysadmin-password` |
| `<clusterName>/keycloak` | `ocp-client-secret` | `keycloak-ocp-client-secret` |
| `<clusterName>/keycloak` | `gitea-client-secret` | `keycloak-gitea-client-secret` |
| `<clusterName>/github-app` | `client-id`, `client-secret` | `github-app-credentials` |

## Identity providers

### GitHub

Enabled by setting `github.broker: true` in the Keycloak Helm values (enabled by default on AWS clusters via `values-aws.yaml`). Uses a GitHub App for OAuth authentication.

#### Creating a GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**

2. Configure the app:

    | Field | Value |
    |-------|-------|
    | **App name** | `ansibleforge-sso` (or any unique name) |
    | **Homepage URL** | Your cluster's Keycloak URL |
    | **Callback URLs** | See below |
    | **Webhook** | Uncheck "Active" (not needed) |

3. Add a **callback URL** for each cluster that will use this app:

    ```
    https://keycloak.<clusterDomain>/realms/sso/broker/github/endpoint
    ```

    For example:
    ```
    https://keycloak.apps.fire.sandbox1370.opentlc.com/realms/sso/broker/github/endpoint
    https://keycloak.apps.ice.sandbox1370.opentlc.com/realms/sso/broker/github/endpoint
    ```

    !!! note
        Multiple clusters can share the same GitHub App — just add a callback URL for each cluster.

4. Set **Account permissions**:

    | Permission | Access | Required for |
    |-----------|--------|--------------|
    | **Email addresses** | Read-only | Login (always required) |
    | **Organization members** | Read-only | Org/team group mapping (only if using `github.mapper`) |

    !!! warning
        The `Email addresses: Read-only` permission is **required**. Without it, Keycloak cannot retrieve the user's email from GitHub and login will fail with "Unexpected error when authenticating with identity provider".

    !!! note
        The `Organization members: Read-only` permission is only needed if you enable the GitHub org-to-group mapper (`github.mapper: true`). It allows Keycloak to check org/team membership via the GitHub API.

5. Click **Create GitHub App**

6. After creation, generate a **client secret** on the app settings page

7. **Install the app on your GitHub organization:**

    Go to the app's settings page → **Install App** → select your organization (e.g., `infrabuildxyz`) → **Install**

    !!! warning
        This step is required for the org/team membership mapper to work. Without installing the app on the org, the GitHub API returns 404 for team membership checks, even if the user has `read:org` scope.

8. Store the credentials in AWS Secrets Manager:

    ```bash
    aws secretsmanager put-secret-value \
      --secret-id <clusterName>/github-app \
      --secret-string '{
        "client-id": "<Client ID from app settings>",
        "client-secret": "<generated client secret>"
      }'
    ```

    Repeat for each cluster that uses this app, using the cluster's name prefix.

## Configuration

The chart is configured via Helm values, which are set per-cluster in the bootstrap:

```yaml
clusterDomain: ""    # Auto-discovered if not set
clusterName: ""      # Set by bootstrap (e.g., "fire", "ice")
namespace: keycloak

gitlab:
  broker: false      # Enable GitLab as identity broker

github:
  broker: false      # Enable GitHub as identity broker
  mapper: false      # Deploy GitHub org-to-group mapper SPI
  org: ""            # GitHub org for admin group mapping
  team: ""           # GitHub team slug (optional, narrows to team)
```

## GitHub org-to-group mapper

A custom Keycloak SPI that maps GitHub organization or team membership to Keycloak groups. This enables automatic admin group assignment for users who authenticate via GitHub.

### How it works

1. User authenticates via GitHub through Keycloak
2. On login, the mapper calls the GitHub API to check org/team membership
3. If the user is a member, they are added to the configured Keycloak group
4. The `groups` OIDC claim in the token propagates group membership to OpenShift

### Enabling the mapper

Set the following Helm values on the keycloak component:

```yaml
github:
  broker: true          # GitHub IdP must be enabled
  mapper: true          # Deploy the SPI pipeline and init container
  org: infrabuildxyz    # GitHub organization to check
  team: admins          # (optional) Narrow to a specific team
```

When `github.mapper` is `true`, the chart deploys:

- A **Tekton Pipeline** (`build-github-org-mapper`) that builds the Java SPI JAR
- An **ImageStream** for the built artifact
- An **init container** on the Keycloak pod that loads the JAR at startup

### Building the mapper

After the pipeline is deployed, run it to build the JAR:

```bash
oc create -f - <<EOF
apiVersion: tekton.dev/v1
kind: PipelineRun
metadata:
  generateName: build-github-org-mapper-
  namespace: keycloak
spec:
  pipelineRef:
    name: build-github-org-mapper
  workspaces:
    - name: source
      volumeClaimTemplate:
        spec:
          accessModes:
            - ReadWriteOnce
          resources:
            requests:
              storage: 1Gi
EOF
```

Once the pipeline completes, the Keycloak pod will pick up the JAR on its next restart.

### GitHub App permissions

The GitHub App must have **Organization members: Read-only** permission under **Organization permissions** for the mapper to check membership. Users who authorized the app before this permission was added will need to re-approve.

### Source code

The mapper source is at `keycloak-extensions/github-org-mapper/`. It implements the `IdentityProviderMapper` SPI and is compatible with Keycloak 26.x / RHBK 26.

## OpenShift OAuth integration

The `cluster-auth` chart (`ocp/gitops/auth/`) configures OpenShift to use Keycloak as an OIDC identity provider named `rhbk`. It creates:

- An ExternalSecret that syncs the `ocp-client-secret` from AWS SM into `keycloak-oidc-secret` in `openshift-config`
- The `OAuth/cluster` resource pointing to the Keycloak `sso` realm

!!! note
    OpenShift's OAuth server does not support PKCE. The `idp-4-ocp` client in Keycloak must **not** have `pkce.code.challenge.method` set, or login will fail with "Missing parameter: code_challenge_method".

## Break-glass accounts

Two break-glass accounts provide emergency access to the OpenShift console when GitHub or Keycloak are unavailable.

### ocpsysadmin (htpasswd)

A local OpenShift htpasswd user with a direct `ClusterRoleBinding` to `cluster-admin`. This account does not depend on Keycloak — use it when Keycloak is down or misconfigured.

- **Identity provider:** `Local` (htpasswd)
- **ClusterRoleBinding:** `ocpsysadmin-cluster-admin` (managed by the `cluster-auth` chart)
- **Password stored in:** AWS Secrets Manager key `openshift`, property `sysadmin-password` (plaintext)
- **Htpasswd generation:** The ExternalSecret template uses the Sprig `htpasswd` function to auto-generate the bcrypt hash

To set or change the password:

```bash
# Update the plaintext password in AWS Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id openshift \
  --secret-string '{"sysadmin-password": "NEW_PASSWORD_HERE"}'
```

The ExternalSecret in `openshift-config` will auto-generate the bcrypt htpasswd entry and sync the change within 1 hour, or you can force it:

```bash
oc annotate externalsecret htpasswd-secret -n openshift-config force-sync=$(date +%s) --overwrite
```

### sysadmin (Keycloak)

A local Keycloak user in the `sso` realm. This account authenticates through Keycloak (via the `rhbk` identity provider) but does not depend on GitHub. Use it when GitHub is down but Keycloak is healthy.

- **Identity provider:** `rhbk` (Keycloak OIDC)
- **Admin access:** Must be a member of the `admins` group in the Keycloak `sso` realm
- **Password stored in:** AWS Secrets Manager key `<clusterName>/keycloak`, property `sysadmin-password`

To change the password:

```bash
# Update the password in AWS Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id <clusterName>/keycloak \
  --secret-string "$(
    aws secretsmanager get-secret-value \
      --secret-id <clusterName>/keycloak \
      --query SecretString --output text |
    python3 -c "import json,sys; d=json.load(sys.stdin); d['sysadmin-password']='NEW_PASSWORD_HERE'; print(json.dumps(d))"
  )"
```

Then either wait for the ExternalSecret to sync or force it, and re-import the realm (or update the password via the Keycloak admin console).

!!! note
    Changing the password in AWS SM updates the Kubernetes Secret, but the Keycloak user's password is only set during the initial `KeycloakRealmImport`. To update it on an existing cluster, change it directly in the Keycloak admin console under **SSO realm → Users → sysadmin → Credentials**.

## Sync wave order

| Wave | Resource |
|------|----------|
| 1 | ExternalSecrets (all credentials) |
| 2 | Operator Subscription |
| 3 | Keycloak instance |
| 5 | KeycloakRealmImport (sso realm with IdPs) |
