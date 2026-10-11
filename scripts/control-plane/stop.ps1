$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'processes.ps1')
Stop-ControlPlaneProcesses -RecordPath (Join-Path $projectRoot '.data\processes.json')
'已停止本控制台记录的进程，AgentDock 不受影响。'
