$ErrorActionPreference='SilentlyContinue'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$app=Split-Path -Parent $root
$lnk=Join-Path ([Environment]::GetFolderPath('Desktop')) 'Mukorob PDF.lnk'; if(Test-Path $lnk){Remove-Item $lnk -Force}
$sm=Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Mukorob PDF.lnk'; if(Test-Path $sm){Remove-Item $sm -Force}
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MukorobPDF' -Name DisplayName -ErrorAction SilentlyContinue
Remove-Item 'HKCU:\Software\Classes\MukorobPDF' -Recurse -Force -ErrorAction SilentlyContinue
Remove-ItemProperty -Path 'HKCU:\Software\Classes\.pdf' -Name '(default)' -ErrorAction SilentlyContinue
Write-Host 'Mukorob PDF shortcuts and file association removed. Your documents and browser data are left intact.'
