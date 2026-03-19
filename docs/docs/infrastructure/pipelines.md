# OpenShift Pipelines

**Chart:** `ocp/pipelines/`
**Namespace:** `openshift-operators` (cluster-scoped)

## Overview

OpenShift Pipelines (Tekton) is installed as a cluster-scoped operator via a GitOps-managed Subscription. It provides the pipeline primitives used for building and publishing container images in AnsibleForge.

## Installation

A single `Subscription` resource triggers OLM to install and keep the operator updated:

```yaml
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: openshift-pipelines-operator-rh
  namespace: openshift-operators
spec:
  channel: latest
  name: openshift-pipelines-operator-rh
  source: redhat-operators
  installPlanApproval: Automatic
```

## Planned: ee-ansibleforge build pipeline

The `ee-ansibleforge` EE requires `ansible-builder create` to generate a build context before the image can be built. A Tekton Pipeline will automate this:

1. Clone the `ansibleforge` repository
2. Run `ansible-builder create` to generate `containers/ee-ansibleforge/context/`
3. Trigger the `ee-ansibleforge` BuildConfig in `shared-builds`
4. Tag the resulting ImageStream on success

## Verify installation

```bash
oc get csv -n openshift-operators | grep pipelines
oc get pods -n openshift-pipelines
```
