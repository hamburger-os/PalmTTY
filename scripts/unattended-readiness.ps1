# Read-only readiness probe. No credential collection, enabling of RDP or Hyper-V,
# firewall mutations, desktop switching, logon or privileged process creation.
param([string]$VmName = "")
$ErrorActionPreference = "Stop"
function Probe-Property([string]$Path, [string]$Name) {
  try {
    return (Get-ItemProperty -LiteralPath $Path -Name $Name -ErrorAction Stop).$Name
  } catch {
    return $null
  }
}
$os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop
$edition = [string](Probe-Property 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' 'EditionID')
$buildString = [string](Probe-Property 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' 'CurrentBuildNumber')
$build = 0
[void][int]::TryParse($buildString, [ref]$build)
$windows11Pro = ($build -ge 22000 -and ($edition -eq 'Professional' -or $edition -eq 'ProfessionalN'))
$denyRdp = Probe-Property 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' 'fDenyTSConnections'
$requireNla = Probe-Property 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' 'UserAuthentication'
$serviceRunning = $null
try { $serviceRunning = ((Get-Service -Name TermService -ErrorAction Stop).Status -eq 'Running') } catch {}
$vmCommand = Get-Command Get-VM -ErrorAction SilentlyContinue
$vmAvailable = $null -ne $vmCommand
$vm = [ordered]@{found = $null; running = $null; automaticStart = $null}
if ($VmName -ne "") {
  if ($vmAvailable) {
    try {
      $machine = Get-VM -Name $VmName -ErrorAction Stop
      $vm.found = $true
      $vm.running = [bool]($machine.State -eq 'Running')
      $vm.automaticStart = [bool]($machine.AutomaticStartAction -eq 'Start')
    } catch {
      # Access denied / no such VM are both unknown. Do not claim it is absent.
      $vm.found = $null
    }
  }
}
[ordered]@{
  schema = 1
  osEdition = $edition
  osBuild = $build
  windows11Pro = [bool]$windows11Pro
  rdpEnabled = if ($null -eq $denyRdp) { $null } else { [bool]($denyRdp -eq 0) }
  nlaRequired = if ($null -eq $requireNla) { $null } else { [bool]($requireNla -eq 1) }
  rdpServiceRunning = $serviceRunning
  hyperVAvailable = [bool]$vmAvailable
  vm = $vm
} | ConvertTo-Json -Compress -Depth 4
