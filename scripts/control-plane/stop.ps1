$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'processes.ps1')
Stop-ControlPlaneProcesses -RecordPath (Join-Path $projectRoot '.data\processes.json')
'Stopped processes owned by this Control Plane. AgentDock was not stopped.'
