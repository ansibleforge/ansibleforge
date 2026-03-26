<powershell>
# Set admin password
$password = ConvertTo-SecureString '${admin_password}' -AsPlainText -Force
Get-LocalUser -Name Administrator | Set-LocalUser -Password $password
Get-LocalUser -Name Administrator | Enable-LocalUser

# Create self-signed cert for WinRM HTTPS
$cert = New-SelfSignedCertificate -DnsName $env:COMPUTERNAME -CertStoreLocation Cert:\LocalMachine\My
$thumbprint = $cert.Thumbprint

# Configure WinRM
winrm quickconfig -force
winrm set winrm/config/service '@{AllowUnencrypted="false"}'
winrm set winrm/config/service/auth '@{Basic="true";CredSSP="true"}'
winrm set winrm/config/winrs '@{MaxMemoryPerShellMB="1024"}'

# Remove HTTP listener, add HTTPS
winrm delete winrm/config/listener?Address=*+Transport=HTTP 2>$null
winrm create winrm/config/listener?Address=*+Transport=HTTPS "@{Hostname=`"$env:COMPUTERNAME`";CertificateThumbprint=`"$thumbprint`"}"

# Enable CredSSP server and allow legacy encryption oracle
Enable-WSManCredSSP -Role Server -Force
New-Item -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\CredSSP\Parameters -Force | Out-Null
Set-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\CredSSP\Parameters -Name AllowEncryptionOracle -Value 2 -Type DWord

# Open firewall
New-NetFirewallRule -Name "WinRM-HTTPS" -DisplayName "WinRM HTTPS" -Enabled True -Direction Inbound -Protocol TCP -LocalPort 5986 -Action Allow

# Restart WinRM
Restart-Service WinRM
</powershell>
