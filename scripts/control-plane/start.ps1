param([ValidateRange(1024,65535)][int]$Port = 4310, [switch]$Build)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $projectRoot
. (Join-Path $PSScriptRoot 'processes.ps1')
$nodePath = (Get-Command node).Source
$versionParts = (& $nodePath --version).TrimStart('v').Split('.')
if ([int]$versionParts[0] -lt 22 -or ([int]$versionParts[0] -eq 22 -and [int]$versionParts[1] -lt 18)) { throw '需要 Node.js >=22.18（建议24及以上）以运行只读采集器。' }
if (-not (Test-Path -LiteralPath 'node_modules\next\dist\bin\next')) {
    & pnpm.cmd install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' }
}
& $nodePath (Join-Path $PSScriptRoot 'bootstrap.mjs')
if ($LASTEXITCODE -ne 0) { throw '本地配置初始化失败。' }
$env:MC_AGENTDOCK_P0 = '1'
$env:MC_DISABLE_RUNTIME_SCAN = '1'
$env:NEXT_PUBLIC_GATEWAY_OPTIONAL = 'true'
$envPath = Join-Path $projectRoot '.env.local'
$nextPath = Join-Path $projectRoot 'node_modules\next\dist\bin\next'
if ($Build -or -not (Test-Path -LiteralPath '.next\BUILD_ID')) {
    & $nodePath $nextPath build --webpack
    if ($LASTEXITCODE -ne 0) { throw '构建失败，未启动服务。' }
}
$recordPath = Join-Path $projectRoot '.data\processes.json'
Stop-ControlPlaneProcesses -RecordPath $recordPath
$portProbe = [Net.Sockets.TcpClient]::new()
try { $occupied = $portProbe.ConnectAsync('127.0.0.1',$Port).Wait(500) -and $portProbe.Connected } catch { $occupied = $false } finally { $portProbe.Dispose() }
if ($occupied) { throw "端口 $Port 已被其他程序占用；未关闭该程序。" }
$web = $null
$collector = $null
try {
    $web = Start-Process -FilePath $nodePath -ArgumentList @("--env-file=`"$envPath`"", "`"$nextPath`"", 'start', '--hostname', '127.0.0.1', '--port', "$Port") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput '.data\web.out.log' -RedirectStandardError '.data\web.err.log' -PassThru
    $collectorPath = Join-Path $PSScriptRoot 'collector.mjs'
    $collector = Start-Process -FilePath $nodePath -ArgumentList @("--env-file=`"$envPath`"", "`"$collectorPath`"") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput '.data\collector.out.log' -RedirectStandardError '.data\collector.err.log' -PassThru
    $records = @($web,$collector) | ForEach-Object { @{id=$_.Id;startedTicks=$_.StartTime.ToUniversalTime().Ticks.ToString()} }
    $records | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding utf8
    $ready = $false
    for ($attempt=0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 500
        try { $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2; if ($response.StatusCode -eq 200) { $ready = $true; break } } catch {}
        if ($web.HasExited -or $collector.HasExited) { break }
    }
    if (-not $ready) { throw '服务启动失败，请查看 .data/web.err.log 和 collector.err.log。' }
    "P0 已运行：http://127.0.0.1:$Port/agentdock"
    "登录信息：$(Join-Path $projectRoot '.data\登录信息.txt')"
} catch {
    foreach ($ownedProcess in @($web,$collector)) { if ($ownedProcess -and -not $ownedProcess.HasExited) { Stop-Process -Id $ownedProcess.Id -ErrorAction SilentlyContinue } }
    throw
}
