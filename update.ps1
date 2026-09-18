param([switch]$Silent)
$ErrorActionPreference='Stop'
$RepoZip='https://github.com/BTENamibia/Mukorob-Pdf-Project/archive/refs/heads/main.zip'
$Dest=Join-Path $env:LOCALAPPDATA 'Mukorob PDF'
$Temp=Join-Path $env:TEMP ('MukorobPDF-update-'+[Guid]::NewGuid().ToString('N'))
$Zip=Join-Path $Temp 'mukorob-pdf.zip'
$Extract=Join-Path $Temp 'extract'
try {
  New-Item -ItemType Directory -Path $Temp,$Extract -Force | Out-Null
  Invoke-WebRequest -Uri $RepoZip -OutFile $Zip -UseBasicParsing
  Expand-Archive -LiteralPath $Zip -DestinationPath $Extract -Force
  $source=Get-ChildItem -LiteralPath $Extract -Directory | Select-Object -First 1
  if(-not $source){ throw 'The downloaded Mukorob PDF package is empty.' }
  if(-not (Test-Path $Dest)){ New-Item -ItemType Directory -Path $Dest -Force | Out-Null }
  Copy-Item -LiteralPath (Join-Path $source.FullName '*') -Destination $Dest -Recurse -Force
  $version=Get-Content -LiteralPath (Join-Path $Dest 'VERSION.txt') -Raw
  if(-not $Silent){ Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show(("Mukorob PDF has been updated to v{0}. Your browser-stored users and documents are preserved." -f $version.Trim()),'Mukorob PDF update','OK','Information') | Out-Null }
  exit 0
} catch {
  if(-not $Silent){
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(("Mukorob PDF could not be updated. {0}" -f $_.Exception.Message),'Mukorob PDF update','OK','Error') | Out-Null
  }
  exit 1
} finally {
  if(Test-Path $Temp){ Remove-Item $Temp -Recurse -Force -ErrorAction SilentlyContinue }
}
