# Ansible Automation Platform

**Chart:** `ocp/aap/`
**Namespace:** `aap`

## Overview

Ansible Automation Platform (AAP) is deployed via the Red Hat AAP Operator. It provides the controller (formerly AWX/Tower) for scheduling and running automation jobs using the [ee-ansibleforge](../containers/ee-ansibleforge.md) Execution Environment.

## Components deployed

- AAP Operator Subscription (from Red Hat Operators)
- `AnsibleAutomationPlatform` instance
- ConsoleLink for access from the OpenShift application menu

## Using ee-ansibleforge as the EE

The `ee-ansibleforge` image built by [Shared Builds](shared-builds.md) is available to AAP via the internal image registry. Configure it as an EE in AAP:

```
image-registry.openshift-image-registry.svc:5000/shared-builds/ee-ansibleforge:latest
```

This ensures automation runs with the same collections and tools available in the DevSpaces workspace.

## Configuration

Update `ocp/aap/values.yaml` with your cluster domain:

```yaml
domain: apps.<cluster-domain>
```
