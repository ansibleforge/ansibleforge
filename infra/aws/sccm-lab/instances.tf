resource "random_password" "admin" {
  count   = var.admin_password == "" ? 1 : 0
  length  = 24
  special = true
  override_special = "!@#$%"
}

locals {
  admin_password = var.admin_password != "" ? var.admin_password : random_password.admin[0].result

  userdata = templatefile("${path.module}/userdata/winrm_bootstrap.ps1.tpl", {
    admin_password = local.admin_password
  })

  instances = {
    dc = {
      instance_type = "t3a.medium"
      private_ip    = "10.0.1.10"
      hostname      = "DC01"
      root_size     = 60
      spot          = false
    }
    sql = {
      instance_type = "r5a.large"
      private_ip    = "10.0.1.20"
      hostname      = "SQL01"
      root_size     = 100
      spot          = false
    }
    sccm = {
      instance_type = "m5a.xlarge"
      private_ip    = "10.0.1.30"
      hostname      = "SCCM01"
      root_size     = 200
      spot          = false
    }
  }
}

data "aws_ami" "windows_2022" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["Windows_Server-2022-English-Full-Base-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "server" {
  for_each = local.instances

  ami                    = data.aws_ami.windows_2022.id
  instance_type          = each.value.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.lab.id]
  private_ip             = each.value.private_ip
  key_name               = var.key_pair_name != "" ? var.key_pair_name : null
  user_data              = local.userdata
  get_password_data      = false

  root_block_device {
    volume_size = each.value.root_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name     = "${var.lab_name}-${each.value.hostname}"
    Hostname = each.value.hostname
    Role     = each.key
  }
}

resource "aws_instance" "client" {
  count = var.client_count

  ami                    = data.aws_ami.windows_2022.id
  instance_type          = "t3a.small"
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.lab.id]
  private_ip             = "10.0.1.${101 + count.index}"
  key_name               = var.key_pair_name != "" ? var.key_pair_name : null
  user_data              = local.userdata

  instance_market_options {
    market_type = "spot"
    spot_options {
      spot_instance_type = "one-time"
    }
  }

  root_block_device {
    volume_size = 40
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name     = "${var.lab_name}-CLIENT${format("%02d", count.index + 1)}"
    Hostname = "CLIENT${format("%02d", count.index + 1)}"
    Role     = "client"
  }
}
