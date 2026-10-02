# Windows-native Devolutions Gateway readiness probe. Read-only.
# Intentionally do not print gateway.json, private-key paths, listener hostnames or user credentials.
$ErrorActionPreference = 'Stop'
function Read-Value([string]$Path, [string]$Name) {
  try { return (Get-ItemProperty -LiteralPath $Path -Name $Name -ErrorAction Stop).$Name }
  catch { return $null }
}
$edition = [string](Read-Value 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' 'EditionID')
$buildText = [string](Read-Value 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' 'CurrentBuildNumber')
$build = 0
[void][int]::TryParse($buildText, [ref]$build)
$denyRdp = Read-Value 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' 'fDenyTSConnections'
$nlaRegistry = Read-Value 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' 'UserAuthentication'
$rdpEnabled = $null
if ($null -ne $denyRdp) { $rdpEnabled = [bool]($denyRdp -eq 0) }
$nlaEnabled = $null
if ($null -ne $nlaRegistry) { $nlaEnabled = [bool]($nlaRegistry -eq 1) }
$termRunning = $null
try { $termRunning = [bool]((Get-Service -Name TermService -ErrorAction Stop).Status -eq 'Running') } catch {}

$serviceFound = $null
$serviceRunning = $null
$autoStart = $null
try {
  $service = Get-CimInstance -ClassName Win32_Service -Filter "Name = 'devolutionsgateway'" -ErrorAction Stop
  $serviceFound = [bool]($null -ne $service)
  if ($serviceFound) {
    $serviceRunning = [bool]($service.State -eq 'Running')
    $autoStart = [bool]($service.StartMode -eq 'Auto')
  }
} catch {}

$configReadable = $null
$webAppEnabled = $null
$customAuthEnabled = $null
$provisionerConfigured = $null
$loopbackOnly = $null
$configPath = Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Devolutions\Gateway\gateway.json'
try {
  $config = Get-Content -LiteralPath $configPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  if ($null -eq $config -or $config -is [array]) { throw 'Invalid configuration root' }
  $configReadable = $true
  $webAppEnabled = [bool]($config.WebApp.Enabled -eq $true)
  $customAuthEnabled = [bool]($config.WebApp.Authentication -ceq 'Custom')
  $provisionerConfigured = [bool](-not [string]::IsNullOrWhiteSpace([string]$config.ProvisionerPrivateKeyFile))
  $listeners = @($config.Listeners | Where-Object { $null -ne $_ })
  $loopbackOnly = ($listeners.Count -gt 0)
  foreach ($listener in $listeners) {
    $uri = $null
    if (-not [Uri]::TryCreate([string]$listener.InternalUrl, [UriKind]::Absolute, [ref]$uri)) {
      $loopbackOnly = $false
      continue
    }
    if ($uri.Host -cne '127.0.0.1' -and $uri.Host -cne '::1' -and $uri.Host -cne 'localhost') {
      $loopbackOnly = $false
    }
    if ($uri.Scheme -cne 'https' -and $uri.Scheme -cne 'http') { $loopbackOnly = $false }
  }
} catch {
  # Permission errors, missing files and malformed JSON cannot authorize the deployment.
  $configReadable = $false
}

[ordered]@{
  schema = 2
  osEdition = $edition
  osBuild = $build
  windows11Pro = [bool]($build -ge 22000 -and ($edition -eq 'Professional' -or $edition -eq 'ProfessionalN'))
  rdpEnabled = $rdpEnabled
  nlaRequired = $nlaEnabled
  rdpServiceRunning = $termRunning
  gateway = [ordered]@{
    serviceFound = $serviceFound
    serviceRunning = $serviceRunning
    automaticStart = $autoStart
    configReadable = $configReadable
    webAppEnabled = $webAppEnabled
    customAuthEnabled = $customAuthEnabled
    provisionerConfigured = $provisionerConfigured
    loopbackOnly = $loopbackOnly
  }
} | ConvertTo-Json -Compress -Depth 5
