# Execution Environment BuildConfig

## Goal

Build one Ansible Execution Environment (EE) image in OpenShift using only raw resources and `oc apply`.

This first slice deliberately avoids Helm. The useful primitive is:

- EE source files under `containers/<ee-name>/`
- a generated `ansible-builder` context
- an ImageStream for the output image
- a BuildConfig that builds the generated context from Git

Once that flow is easy to understand and review, a second pass can wrap it in the `shared-builds` Helm chart.

## How it works

`ansible-builder` creates a Docker build context from `execution-environment.yaml`, collection requirements, Python requirements, and system package requirements.

OpenShift BuildConfig does not run `ansible-builder` in this slice. It clones the Git repository and builds the generated `context/` directory. That means every EE change must be committed and pushed before the cluster build can see it.

## Files

| File | Purpose |
|------|---------|
| `containers/<ee-name>/execution-environment.yaml` | EE base image and dependency declaration |
| `containers/<ee-name>/requirements.yaml` | Ansible collection requirements |
| `containers/<ee-name>/requirements.txt` | Python package requirements |
| `containers/<ee-name>/bindep.txt` | Optional system package requirements |
| `containers/<ee-name>/context/` | Generated build context used by OpenShift |
| `examples/execution-environment-buildconfig/ee-ansibleforge-buildconfig.yaml` | Raw ImageStream and BuildConfig example |

## Start from the minimal EE

Copy the starter into `containers/`:

```bash
cp -R examples/execution-environments/minimal containers/ee-example
cd containers/ee-example
```

Edit these files for the automation this EE should run:

```text
execution-environment.yaml
requirements.yaml
requirements.txt
bindep.txt
```

Generate the OpenShift build context:

```bash
ansible-builder create
```

Commit and push the generated context:

```bash
git add containers/ee-example
git commit -m "Add ee-example execution environment"
git push
```

## Apply the BuildConfig

Set values for your fork and branch:

```bash
NAMESPACE=shared-builds
EE_NAME=ee-example
BUILD_CONFIG=bc-ee-example
REPO_URL=https://github.com/<your-user>/ansibleforge.git
BRANCH=<your-branch>
CONTEXT_DIR=containers/ee-example/context
```

Use an existing namespace. For a throwaway standalone test, create one first and set `NAMESPACE` to that project:

```bash
oc new-project ee-builds
NAMESPACE=ee-builds
```

Apply an ImageStream and BuildConfig directly:

```bash
cat <<EOF | oc apply -n "${NAMESPACE}" -f -
apiVersion: image.openshift.io/v1
kind: ImageStream
metadata:
  name: ${EE_NAME}
spec:
  lookupPolicy:
    local: true
---
apiVersion: build.openshift.io/v1
kind: BuildConfig
metadata:
  name: ${BUILD_CONFIG}
spec:
  source:
    git:
      uri: ${REPO_URL}
      ref: ${BRANCH}
    contextDir: ${CONTEXT_DIR}
  strategy:
    type: Docker
    dockerStrategy:
      dockerfilePath: Containerfile
  output:
    to:
      kind: ImageStreamTag
      name: ${EE_NAME}:latest
  triggers: []
EOF
```

This minimal BuildConfig does not mount RHEL entitlements or a custom `ansible.cfg`. Add those only when the EE needs private Automation Hub content or RPM packages from entitled Red Hat repositories.

## Build the image

Start the build:

```bash
oc start-build "${BUILD_CONFIG}" -n "${NAMESPACE}" --follow
```

Check the output image:

```bash
oc get imagestreamtag "${EE_NAME}:latest" -n "${NAMESPACE}"
```

Use the built image from AAP, DevSpaces, or another namespace:

```text
image-registry.openshift-image-registry.svc:5000/<namespace>/ee-example:latest
```

## Existing EE example

To apply the current `ee-ansibleforge` BuildConfig without Helm, use the raw example:

```bash
oc apply -n shared-builds -f examples/execution-environment-buildconfig/ee-ansibleforge-buildconfig.yaml
oc start-build bc-ee-ansibleforge -n shared-builds --follow
```

That example includes the entitlement and `ansible-config` secret mounts used by the full AnsibleForge EE.

## Step 2: Helm

After this raw `oc apply` path is proven, the next implementation slice can move the same ImageStream and BuildConfig into `ocp/gitops/shared-builds` so ArgoCD owns it.

Keep the Helm pass separate. It should not change the EE itself; it should only translate the already-working resources into the GitOps chart.

## Definition of done

- EE source files exist under `containers/<ee-name>/`
- `ansible-builder create` generated `containers/<ee-name>/context/`
- the generated context is committed and pushed
- `oc apply` creates an ImageStream and BuildConfig
- `oc start-build bc-<ee-name> -n <namespace> --follow` completes
- the new image is available as `image-registry.openshift-image-registry.svc:5000/<namespace>/<ee-name>:latest`
