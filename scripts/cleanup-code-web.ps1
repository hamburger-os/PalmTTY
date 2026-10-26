# Explicit operator cleanup for legacy direct `code serve-web` launches only.
# Managed PalmTTY instances use private Job Objects and do not need PID recovery.
$ErrorActionPreference = 'Stop'
$codeWebRoot = Join-Path $env:USERPROFILE '.vscode\cli\serve-web\'
$snapshot = @(Get-CimInstance Win32_Process)
$processById = @{}
foreach ($entry in $snapshot) { $processById[[int]$entry.ProcessId] = $entry }
function Test-PalmTTYManaged($candidate) {
    $ancestorId = [int]$candidate.ProcessId
    for ($depth = 0; $depth -lt 64 -and $processById.ContainsKey($ancestorId); $depth++) {
        $ancestor = $processById[$ancestorId]
        $name = [System.IO.Path]::GetFileName($ancestor.ExecutablePath)
        if ($name -match '^palmtty-process-host-[a-f0-9]{64}\.exe$' -or
            $name -eq 'palmtty-autostart-host.exe') { return $true }
        $ancestorId = [int]$ancestor.ParentProcessId
    }
    return $false
}
$candidates = @($snapshot | Where-Object {
    $_.Name -eq 'node.exe' -and $_.ExecutablePath -and
    $_.ExecutablePath.StartsWith($codeWebRoot, [StringComparison]::OrdinalIgnoreCase)
})
$stopped = 0
$preserved = 0
foreach ($candidate in $candidates) {
    if (Test-PalmTTYManaged $candidate) { $preserved++; continue }
    $current = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $candidate.ProcessId)
    if ($current -and $current.CreationDate -eq $candidate.CreationDate -and
        $current.ExecutablePath -eq $candidate.ExecutablePath) {
        & taskkill.exe /PID $candidate.ProcessId /T /F
        if ($LASTEXITCODE -ne 0) { throw 'Code Web cleanup failed; inspect remaining service processes.' }
        $stopped++
    }
}
Write-Output ('Stopped legacy Code Web roots: ' + $stopped)
Write-Output ('Preserved PalmTTY-managed Code Web nodes: ' + $preserved)
