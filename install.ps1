param([string]$SourceRoot)
$ErrorActionPreference='Stop'
if([string]::IsNullOrWhiteSpace($SourceRoot)){ $SourceRoot=Split-Path -Parent $MyInvocation.MyCommand.Path }
$nested=Join-Path $SourceRoot 'mukorob-pdf-app'
$source=if(Test-Path -LiteralPath $nested -PathType Container){$nested}else{$SourceRoot}
$dest=Join-Path $env:LOCALAPPDATA 'Mukorob PDF'
if(Test-Path $dest){Remove-Item $dest -Recurse -Force}
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item (Join-Path $source '*') $dest -Recurse -Force

$ps=Join-Path $dest 'open-pdf.ps1'
$serve=Join-Path $dest 'serve.ps1'
$edge=(Get-Command msedge.exe -ErrorAction SilentlyContinue).Source
if(-not $edge){
  $edgePaths=@("$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe","$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe","$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe")
  $edge=$edgePaths|Where-Object{Test-Path $_}|Select-Object -First 1
}

function New-Shortcut($path,$arguments,$description){
  $shell=New-Object -ComObject WScript.Shell
  $sc=$shell.CreateShortcut($path)
  $sc.TargetPath=(Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
  $sc.Arguments=$arguments
  $sc.WorkingDirectory=$dest
  $sc.Description=$description
  $sc.IconLocation=(Join-Path $dest 'icons\icon-192.png')+',0'
  $sc.Save()
}

$desktop=Join-Path ([Environment]::GetFolderPath('Desktop')) 'Mukorob PDF.lnk'
$startDir=Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'
New-Item -ItemType Directory -Path $startDir -Force|Out-Null
$start=Join-Path $startDir 'Mukorob PDF.lnk'
$args='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$ps+'"'
New-Shortcut $desktop $args 'Mukorob PDF — Bradz Internal PDF Reader & Editor'
New-Shortcut $start $args 'Mukorob PDF — Bradz Internal PDF Reader & Editor'

# Current-user PDF association. It launches the local HTTPS-capable PWA server and opens the selected PDF.
New-Item -Path 'HKCU:\Software\Classes\MukorobPDF' -Force|Out-Null
New-Item -Path 'HKCU:\Software\Classes\MukorobPDF\shell\open\command' -Force|Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\MukorobPDF' -Name '(default)' -Value 'Mukorob PDF document'
$openCmd='"'+(Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')+'" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$ps+'" "%1"'
Set-ItemProperty -Path 'HKCU:\Software\Classes\MukorobPDF\shell\open\command' -Name '(default)' -Value $openCmd
New-Item -Path 'HKCU:\Software\Classes\.pdf' -Force|Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Classes\.pdf' -Name '(default)' -Value 'MukorobPDF'

# Uninstall entry for this-user installation.
New-Item -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MukorobPDF' -Force|Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MukorobPDF' -Name DisplayName -Value 'Mukorob PDF'
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MukorobPDF' -Name DisplayVersion -Value '0.7.4'
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MukorobPDF' -Name Publisher -Value 'Bradz Trading Enterprises CC'
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MukorobPDF' -Name UninstallString -Value ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $dest 'uninstall.ps1')+'"')

Write-Host 'Mukorob PDF installed to:' $dest
Write-Host 'Desktop shortcut:' $desktop
Write-Host 'PDF association: current Windows user'
if(-not $edge){Write-Host 'Microsoft Edge was not found; the installed shortcut will open the browser fallback.'}
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$serve,'-Port','8787')
Start-Sleep -Milliseconds 700
if($edge){Start-Process $edge -ArgumentList @('--app=http://127.0.0.1:8787/')}
else{Start-Process 'http://127.0.0.1:8787/'}
