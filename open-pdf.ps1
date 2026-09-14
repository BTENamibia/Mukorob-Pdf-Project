param([Parameter(Mandatory=$true)][string]$Path)
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$port=8787
$alive=$false
try { $alive=(Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue).TcpTestSucceeded } catch {}
if(-not $alive){ Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'serve.ps1'),'-Port',$port) | Out-Null; Start-Sleep -Milliseconds 700 }
$enc=[Uri]::EscapeDataString((Resolve-Path -LiteralPath $Path).Path)
$url="http://127.0.0.1:$port/?open=$enc"
$edge=(Get-Command msedge.exe -ErrorAction SilentlyContinue).Source
if($edge){ Start-Process $edge -ArgumentList @('--app='+$url) }
else { Start-Process "http://127.0.0.1:$port/?open=$enc" }
