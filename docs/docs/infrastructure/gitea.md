# Gitea

Gitea is the in-cluster git server, deployed via the `ocp/gitops/gitea` Helm
chart (ArgoCD app `gitea`). It replaced GitLab in July 2026 — a single
rootless pod on SQLite instead of the GitLab operator's multi-pod stack.

- **URL**: `https://gitea.apps.<clusterDomain>`
- **Login**: Keycloak SSO ("Sign in with keycloak"). Local registration is
  disabled; accounts auto-create on first SSO login and link by email.
- **Admin**: `gitea-admin`, password in the `gitea-admin-credentials` secret
  (gitea namespace, generated once at install).

## SSO wiring

The keycloak chart defines a `gitea` OIDC client; the realm config job copies
its secret into the gitea namespace (`gitea-keycloak-oidc`), and the gitea
chart's PostSync provision job registers the Keycloak OIDC auth source via
the `gitea` CLI (auth sources have no REST API). The provision job also
creates an OAuth2 application for OpenShift cluster login and publishes it to
`openshift-config` (`gitea-oidc-secret`) for the auth chart's `gitea.login`
toggle, plus a bot PAT (`gitea-devspaces-credentials`) for the devspaces
chart's `gitea.scm` toggle.

## Toggles (dormant by default)

| Toggle | Chart | Effect |
| --- | --- | --- |
| `gitea.login` | auth | OpenShift cluster login via Gitea OIDC |
| `gitea.scm` | devspaces | Publishes the bot PAT in Che git-credentials format (DevSpaces has no native Gitea OAuth; distribute per user namespace to activate) |

The `values-devspaces-gitea.yaml` bootstrap variant enables both for a
minimal DevSpaces + Gitea deployment.

## Monitoring

`sso-monitor` includes gitea in its token-validation probe cycle.
