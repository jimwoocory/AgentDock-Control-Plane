param([string]$DataDir = (Join-Path $PSScriptRoot '.data'))
$ErrorActionPreference = 'Stop'
function Test-CommandArgument([string]$CommandLine,[string]$Argument) {
  $Escaped = [Regex]::Escape($Argument)
  $Alternatives = '"' + $Escaped + '"'
  if ($Argument -notmatch '\s') { $Alternatives += '|' + $Escaped }
  return [Regex]::IsMatch($CommandLine,'(?:^|\s)(?:' + $Alternatives + ')(?:\s|$)',[Text.RegularExpressions.RegexOptions]::IgnoreCase)
}
$DataDir = [IO.Path]::GetFullPath($DataDir)
if (Test-Path -LiteralPath $DataDir) {
  if ((Get-Item -LiteralPath $DataDir).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked bridge data rejected' }
}
$RecordPath = Join-Path $DataDir 'process.json'
if (-not (Test-Path -LiteralPath $RecordPath)) { Write-Output 'Readonly bridge has no owned process'; exit 0 }
$Recorded = Get-Content -LiteralPath $RecordPath -Raw -Encoding UTF8 | ConvertFrom-Json
$Process = Get-Process -Id ([int]$Recorded.pid) -ErrorAction SilentlyContinue
if (-not $Process) { Remove-Item -LiteralPath $RecordPath; Write-Output 'Readonly bridge already stopped'; exit 0 }
$CollectorPath = Join-Path $PSScriptRoot 'collector.mjs'
$Command = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$Recorded.pid)
if ($Process.StartTime.ToUniversalTime().Ticks.ToString() -ne [string]$Recorded.startTicks -or $Process.Path -ne [string]$Recorded.nodePath -or $Recorded.collectorPath -ne $CollectorPath -or $Recorded.dataDir -ne $DataDir -or -not (Test-CommandArgument $Command.CommandLine $CollectorPath) -or -not (Test-CommandArgument $Command.CommandLine $DataDir)) {
  throw 'Process ownership mismatch; refusing to stop this PID'
}
Stop-Process -Id $Process.Id -ErrorAction Stop
Remove-Item -LiteralPath $RecordPath
Write-Output 'Readonly bridge stopped'
