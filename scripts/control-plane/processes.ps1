function Stop-ControlPlaneProcesses {
    param([string]$RecordPath)
    if (-not (Test-Path -LiteralPath $RecordPath)) { return }
    $records = Get-Content -LiteralPath $RecordPath -Raw | ConvertFrom-Json
    foreach ($record in $records) {
        $ownedProcess = Get-Process -Id $record.id -ErrorAction SilentlyContinue
        if ($ownedProcess -and $ownedProcess.ProcessName -eq 'node' -and $ownedProcess.StartTime.ToUniversalTime().Ticks.ToString() -eq $record.startedTicks) {
            Stop-Process -Id $ownedProcess.Id
        }
    }
}
