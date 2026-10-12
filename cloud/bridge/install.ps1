$ErrorActionPreference='Stop'
$TaskName='AgentDock-Control-Plane-Bridge'
if(Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue){throw 'Existing task must be inspected before changing it'}
$BridgeDir=$PSScriptRoot
$NodePath=(Get-Command node -ErrorAction Stop).Source
$UserName=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$Arguments='-NoProfile -NonInteractive -WindowStyle Hidden -Command "& '''+$NodePath+''' '''+(Join-Path $BridgeDir 'collector.mjs')+'''"'
$Action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $Arguments -WorkingDirectory $BridgeDir
$Trigger=New-ScheduledTaskTrigger -AtLogOn -User $UserName
$Principal=New-ScheduledTaskPrincipal -UserId $UserName -LogonType Interactive -RunLevel Limited
$Settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description 'Independent read-only private Sites collector; no AgentDock Core modifications.' | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Output 'Independent readonly collector task registered and started'
