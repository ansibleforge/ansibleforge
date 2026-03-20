terraform {
  required_version = ">= 1.5"

  backend "s3" {
    bucket         = "ansibleforge-tfstate"
    key            = "dns/terraform.tfstate"
    region         = "us-east-2"
    dynamodb_table = "tfstate-lock"
    encrypt        = true
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

# Route 53 public hosted zone for the cluster subdomain
resource "aws_route53_zone" "cluster" {
  name = "${var.cluster_name}.${var.base_domain}"
}

# NS delegation records in Cloudflare
resource "cloudflare_record" "ns" {
  for_each = toset(aws_route53_zone.cluster.name_servers)

  zone_id = data.cloudflare_zone.base.id
  name    = var.cluster_name
  type    = "NS"
  content = each.value
  ttl     = 300
}

output "route53_zone_id" {
  value = aws_route53_zone.cluster.zone_id
}

output "route53_name_servers" {
  value = aws_route53_zone.cluster.name_servers
}
