resource "aws_security_group" "lab" {
  name_prefix = "${var.lab_name}-"
  vpc_id      = aws_vpc.lab.id
  description = "SCCM Lab - WinRM, RDP, intra-VPC"

  # WinRM HTTPS
  ingress {
    from_port   = 5986
    to_port     = 5986
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
    description = "WinRM HTTPS"
  }

  # RDP
  ingress {
    from_port   = 3389
    to_port     = 3389
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
    description = "RDP"
  }

  # All intra-VPC (AD, SQL, SCCM, DNS, etc.)
  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["10.0.0.0/16"]
    description = "All intra-VPC traffic"
  }

  # All outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound"
  }

  tags = { Name = "${var.lab_name}-sg" }

  lifecycle {
    create_before_destroy = true
  }
}
