terraform {
  required_version = ">= 1.5"

  backend "s3" {
    bucket         = "ansibleforge-tfstate"
    key            = "sccm-lab/terraform.tfstate"
    region         = "us-east-2"
    dynamodb_table = "tfstate-lock"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.lab_name
      ManagedBy   = "terraform"
      AutoDestroy = "true"
    }
  }
}
