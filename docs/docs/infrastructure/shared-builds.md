# Shared Builds

**Chart:** `ocp/shared-builds/`
**Namespace:** `shared-builds`

## Overview

The `shared-builds` namespace centralizes container image builds so all user workspaces pull from the same up-to-date images without each building their own copy. Images are stored in OpenShift's internal image registry and shared cluster-wide.

## Images built

| BuildConfig | Source | Output |
|-------------|--------|--------|
| `ansible-devspaces` | `containers/ansible-devspaces/` | DevSpaces workspace container |
| `ee-ansibleforge` | `containers/ee-ansibleforge/context/` | Ansible Execution Environment |

Both BuildConfigs pull source from this repository (`hfenner/ansibleforge`) and output to ImageStreams in the `shared-builds` namespace.

## Cross-namespace image access

ImageStreams have `lookupPolicy.local: true`, enabling any pod to reference them by short name. A ClusterRoleBinding grants `system:image-puller` to `system:authenticated`, so all user namespaces can pull without additional RBAC.

Workspace containers reference images using the internal registry:
```
image-registry.openshift-image-registry.svc:5000/shared-builds/ansible-devspaces:latest
image-registry.openshift-image-registry.svc:5000/shared-builds/ee-ansibleforge:latest
```

## RHEL entitlement sync

A CronJob copies RHEL entitlement certificates from `openshift-config-managed` into `shared-builds` so BuildConfigs can install packages from RHEL and AAP repos without separate subscription credentials.

## Triggering builds

```bash
# Build the dev container
oc start-build ansible-devspaces -n shared-builds --follow

# Build the execution environment
oc start-build ee-ansibleforge -n shared-builds --follow

# Watch all builds
oc get builds -n shared-builds -w
```
