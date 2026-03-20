# GitHub Actions Workflows

## CI & Deploy

| Workflow | Trigger | Description |
|----------|---------|-------------|
| **CI** | Push/PR to main | Runs yamllint, helm lint, and gitleaks secret detection |
| **Deploy to GitHub Pages** | Push to `site/` or `docs/` | Builds React site + MkDocs documentation and deploys to GitHub Pages |

## AWS & Infrastructure

| Workflow | Trigger | Description |
|----------|---------|-------------|
| **AWS: OIDC Bootstrap** | Manual / Callable | Creates the GitHub OIDC identity provider and IAM role in AWS. One-time setup — all other AWS workflows use this role for federated auth |
| **DNS: Deploy Terraform State Backend** | Manual / Callable | Deploys CloudFormation stack for S3 bucket + DynamoDB table used by Terraform state |
| **DNS: Manage Cluster Delegation** | Manual / Callable | Creates a Route 53 hosted zone and Cloudflare NS delegation for `<cluster>.ansibleforge.dev`. Each cluster gets isolated Terraform state |
| **Cluster: DNS Setup** | Manual | Chains OIDC Bootstrap → Terraform State Backend → DNS Delegation into a single run |

## OpenShift Clusters

| Workflow | Trigger | Description |
|----------|---------|-------------|
| **OCP: Provision Cluster** | Manual | Runs `openshift-install` IPI on AWS. Stores kubeconfig and kubeadmin password in AWS Secrets Manager. Auto-destroys on failure |
| **OCP: Destroy Cluster** | Manual | Tears down an OCP cluster using metadata stored in S3 |

## Containers

| Workflow | Trigger | Description |
|----------|---------|-------------|
| **Container: Build and Push** | Push to `containers/` / Manual | Builds `ee-community-ansibleforge` and `tools-community-ansibleforge` images and pushes to `ghcr.io`. No Red Hat registry auth required |

## Secrets & Variables

| Name | Type | Used By |
|------|------|---------|
| `AWS_ACCOUNT_ID` | Secret | All AWS workflows (constructs OIDC role ARN) |
| `AWS_ACCESS_KEY_ID` | Secret | OIDC Bootstrap only (one-time static key setup) |
| `AWS_SECRET_ACCESS_KEY` | Secret | OIDC Bootstrap only |
| `CLOUDFLARE_API_TOKEN` | Secret | DNS Manage (Cloudflare NS records) |
| `OCP_PULL_SECRET` | Secret | OCP Provision |
| `SSH_PUBLIC_KEY` | Secret | OCP Provision |
| `REDHAT_REGISTRY_USERNAME` | Secret | Not currently used (community images don't need it) |
| `REDHAT_REGISTRY_PASSWORD` | Secret | Not currently used |
