# customer-aap

Self-managed customer AAP tenancy. Each entry in `tenants:` provisions:

- a **namespace** with a `ResourceQuota` and `LimitRange` (their workloads
  cannot starve the node)
- a **namespace-scoped Argo CD instance** (`ArgoCD` CR) — the GitOps operator
  grants its service accounts permissions in the tenant namespace only, so the
  customer can deploy anything namespaced there from their own Git repo but
  cannot touch cluster configuration, other namespaces, or the platform
  `openshift-gitops` instance
- the **AAP operator** (`OperatorGroup` targeting only the tenant namespace,
  plus a `Subscription`) — operator lifecycle stays platform-managed; the
  bootstrap app's `selfHeal` reverts any tenant edits to these
- a **RoleBinding** giving the tenant admin group the `admin` ClusterRole in
  the namespace, and Argo CD RBAC mapping the same group to `role:admin` on
  their instance (login via OpenShift OAuth)

## Onboarding a customer

1. Add a tenant entry in `values.yaml` (name, adminGroup, quota).
2. Create the admin group and its membership via cluster auth
   (`ocp/gitops/auth`).
3. Enable the `customer-aap` component in `ocp/gitops/bootstrap/values.yaml`.
4. Hand the customer their Argo CD route
   (`argocd-server-<tenant>.<clusterDomain>`). They connect their own Git
   repo and manage their `AnsibleAutomationPlatform` CR and supporting
   resources from it.
5. The customer supplies their own AAP subscription manifest from
   access.redhat.com to license their instance.

## Constraints

- **Operator channel**: `operatorChannel` MUST match the channel in
  `ocp/gitops/aap/templates/operator.yaml`. AAP CRDs are cluster-scoped and
  shared with the platform install; whichever operator upgrades last owns the
  CRD versions for both. Keeping both Subscriptions on the same channel with
  automatic approval keeps them in step.
- **Capacity**: an AAP instance is many GB of footprint. On a single-node
  cluster, size the tenant quota deliberately and prefer a minimal
  `AnsibleAutomationPlatform` CR (controller only, hub/EDA disabled).
- The tenant admin group has namespace `admin`, so tenants can see (not edit)
  the quota, and can edit their own `ArgoCD` CR — both harmless: the GitOps
  operator never grants a namespace-scoped instance permissions beyond its
  namespace, and quota edits are denied by RBAC.
