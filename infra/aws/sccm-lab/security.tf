################################################################################
# IAM – instance profile for all lab hosts
################################################################################

resource "aws_iam_role" "instance" {
  name = "${var.lab_name}-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.lab_name}-instance" }
}

resource "aws_iam_role_policy" "s3_read" {
  name = "${var.lab_name}-s3-read"
  role = aws_iam_role.instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:ListBucket"]
      Resource = [
        "arn:aws:s3:::ansibleforge-tfstate",
        "arn:aws:s3:::ansibleforge-tfstate/*",
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "instance" {
  name = "${var.lab_name}-instance"
  role = aws_iam_role.instance.name
}

################################################################################
# Security group
################################################################################

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
