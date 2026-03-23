output "admin_password" {
  value     = local.admin_password
  sensitive = true
}

output "dc_public_ip" {
  value = aws_instance.server["dc"].public_ip
}

output "dc_private_ip" {
  value = aws_instance.server["dc"].private_ip
}

output "sql_public_ip" {
  value = aws_instance.server["sql"].public_ip
}

output "sccm_public_ip" {
  value = aws_instance.server["sccm"].public_ip
}

output "client_public_ips" {
  value = [for c in aws_instance.client : c.public_ip]
}

output "client_private_ips" {
  value = [for c in aws_instance.client : c.private_ip]
}

output "inventory" {
  description = "Ansible inventory in YAML format"
  sensitive   = true
  value = yamlencode({
    all = {
      vars = {
        ansible_connection                    = "winrm"
        ansible_winrm_transport               = "credssp"
        ansible_winrm_server_cert_validation  = "ignore"
        ansible_port                          = 5986
        ansible_user                          = "Administrator"
        ansible_password                      = local.admin_password
        sccm_lab_domain_name                  = var.domain_name
        sccm_lab_domain_netbios               = var.domain_netbios
      }
      children = {
        domain_controllers = {
          hosts = {
            DC01 = {
              ansible_host = aws_instance.server["dc"].public_ip
              private_ip   = aws_instance.server["dc"].private_ip
            }
          }
        }
        sql_servers = {
          hosts = {
            SQL01 = {
              ansible_host = aws_instance.server["sql"].public_ip
              private_ip   = aws_instance.server["sql"].private_ip
            }
          }
        }
        sccm_servers = {
          hosts = {
            SCCM01 = {
              ansible_host = aws_instance.server["sccm"].public_ip
              private_ip   = aws_instance.server["sccm"].private_ip
            }
          }
        }
        sccm_clients = {
          hosts = { for i, c in aws_instance.client :
            "CLIENT${format("%02d", i + 1)}" => {
              ansible_host = c.public_ip
              private_ip   = c.private_ip
            }
          }
        }
      }
    }
  })
}
