variable "aws_region" {
  type    = string
  default = "us-east-2"
}

variable "lab_name" {
  type    = string
  default = "sccm-lab"
}

variable "domain_name" {
  type    = string
  default = "sccmlab.local"
}

variable "domain_netbios" {
  type    = string
  default = "SCCMLAB"
}

variable "client_count" {
  type    = number
  default = 2
  validation {
    condition     = var.client_count >= 1 && var.client_count <= 5
    error_message = "client_count must be between 1 and 5"
  }
}

variable "allowed_cidr_blocks" {
  type        = list(string)
  description = "CIDRs allowed for WinRM and RDP ingress"
  default     = ["0.0.0.0/0"]
}

variable "admin_password" {
  type      = string
  sensitive = true
  default   = ""
}

variable "key_pair_name" {
  type    = string
  default = ""
}

variable "instance_profile_name" {
  type        = string
  description = "Pre-created IAM instance profile name for S3 access"
  default     = "sccm-lab-instance"
}
