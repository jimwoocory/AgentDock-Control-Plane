param(
  [string]$DataDir = (Join-Path $PSScriptRoot '.data'),
  [string]$NodePath = (Get-Command node -ErrorAction Stop).Source
)
$ErrorActionPreference = 'Stop'
function Test-CommandArgument([string]$CommandLine,[string]$Argument) {
  $Escaped = [Regex]::Escape($Argument)
  $Alternatives = '"' + $Escaped + '"'
  if ($Argument -notmatch '\s') { $Alternatives += '|' + $Escaped }
  return [Regex]::IsMatch($CommandLine,'(?:^|\s)(?:' + $Alternatives + ')(?:\s|$)',[Text.RegularExpressions.RegexOptions]::IgnoreCase)
}
$DataDir = [IO.Path]::GetFullPath($DataDir)
$CollectorPath = Join-Path $PSScriptRoot 'collector.mjs'
$NodePath = (Resolve-Path -LiteralPath $NodePath).Path
if (-not (Test-Path -LiteralPath (Join-Path $DataDir 'config.json') -PathType Leaf)) { throw 'Configure bridge first' }
if ((Get-Item -LiteralPath $DataDir).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked bridge data rejected' }
$RecordPath = Join-Path $DataDir 'process.json'
$LockPath = Join-Path $DataDir 'start.lock'
$LockHandle = [IO.File]::Open($LockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try {
  if (Test-Path -LiteralPath $RecordPath) {
    $Recorded = Get-Content -LiteralPath $RecordPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $Existing = Get-Process -Id ([int]$Recorded.pid) -ErrorAction SilentlyContinue
    if ($Existing) {
      $Command = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$Recorded.pid)
      if ($Existing.StartTime.ToUniversalTime().Ticks.ToString() -eq [string]$Recorded.startTicks -and $Existing.Path -eq $NodePath -and $Recorded.collectorPath -eq $CollectorPath -and $Recorded.dataDir -eq $DataDir -and (Test-CommandArgument $Command.CommandLine $CollectorPath) -and (Test-CommandArgument $Command.CommandLine $DataDir)) {
        Write-Output 'Readonly bridge already running'
        exit 0
      }
      throw 'Process record belongs to a different process; refusing to replace it'
    }
  }
  $LauncherPath = Join-Path $PSScriptRoot 'launch.mjs'
  $LaunchResult = & $NodePath $LauncherPath '--data-dir' $DataDir | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or -not $LaunchResult.pid) { throw 'Readonly bridge launch failed' }
  $Process = Get-Process -Id ([int]$LaunchResult.pid) -ErrorAction Stop
  $Process.Refresh()
  if ($Process.HasExited) { throw 'Readonly bridge exited during launch' }
  $Record = @{pid=$Process.Id;startTicks=$Process.StartTime.ToUniversalTime().Ticks.ToString();collectorPath=$CollectorPath;nodePath=$NodePath;dataDir=$DataDir}
  $Record | ConvertTo-Json -Compress | Set-Content -LiteralPath $RecordPath -Encoding UTF8
  Write-Output 'Readonly bridge started'
} finally {
  $LockHandle.Dispose()
  Remove-Item -LiteralPath $LockPath -ErrorAction SilentlyContinue
}
