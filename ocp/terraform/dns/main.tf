terraform {
  required_version = ">= 1.5"

  backend "s3" {
    bucket         = "ansibleforge-tfstate"
    region         = "us-east-2"
    dynamodb_table = "tfstate-lock"
    encrypt        = true
    # key is set dynamically: -backend-config="key=dns/<cluster_name>/terraform.tfstate"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

variable "aws_region" {
  type    = string
  default = "us-east-2"
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "base_domain" {
  type    = string
  default = "ansibleforge.dev"
}

data "cloudflare_zone" "base" {
  name = var.base_domain
}

variable "cluster_name" {
  type        = string
  description = "Cluster name (e.g. forge). Creates <cluster_name>.ansibleforge.dev zone."
}

variable "cluster_vpc_id" {
  type        = string
  default     = ""
  description = "VPC ID of the IPI-provisioned cluster. Set post-install to create EFS mount targets."
}

# ---------------------------------------------------------------------------
# DNS
# ---------------------------------------------------------------------------

# Route 53 public hosted zone for the cluster subdomain
resource "aws_route53_zone" "cluster" {
  name = "${var.cluster_name}.${var.base_domain}"
}

# NS delegation records in Cloudflare (Route 53 always assigns 4 nameservers)
resource "cloudflare_record" "ns" {
  count = 4

  zone_id = data.cloudflare_zone.base.id
  name    = var.cluster_name
  type    = "NS"
  content = aws_route53_zone.cluster.name_servers[count.index]
  ttl     = 300
}

# ---------------------------------------------------------------------------
# EFS — all resources created during bootstrap once cluster_vpc_id is known
# ---------------------------------------------------------------------------

resource "aws_efs_file_system" "cluster" {
  count          = var.cluster_vpc_id != "" ? 1 : 0
  creation_token = "${var.cluster_name}-efs"
  encrypted      = true

  tags = {
    Name = "${var.cluster_name}-efs"
  }
}

data "aws_subnets" "private" {
  count = var.cluster_vpc_id != "" ? 1 : 0

  filter {
    name   = "vpc-id"
    values = [var.cluster_vpc_id]
  }

  tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
}

data "aws_security_groups" "worker" {
  count = var.cluster_vpc_id != "" ? 1 : 0

  filter {
    name   = "vpc-id"
    values = [var.cluster_vpc_id]
  }

  filter {
    name   = "tag:Name"
    values = ["${var.cluster_name}*-worker-sg"]
  }
}

resource "aws_security_group" "efs" {
  count = var.cluster_vpc_id != "" ? 1 : 0

  name        = "${var.cluster_name}-efs"
  description = "Allow NFS from cluster workers to EFS"
  vpc_id      = var.cluster_vpc_id

  ingress {
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = data.aws_security_groups.worker[0].ids
  }

  tags = {
    Name = "${var.cluster_name}-efs"
  }
}

resource "aws_efs_mount_target" "cluster" {
  for_each = var.cluster_vpc_id != "" ? toset(data.aws_subnets.private[0].ids) : toset([])

  file_system_id  = aws_efs_file_system.cluster[0].id
  subnet_id       = each.value
  security_groups = [aws_security_group.efs[0].id]
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "route53_zone_id" {
  value = aws_route53_zone.cluster.zone_id
}

output "route53_name_servers" {
  value = aws_route53_zone.cluster.name_servers
}

output "efs_filesystem_id" {
  value = var.cluster_vpc_id != "" ? aws_efs_file_system.cluster[0].id : ""
}
