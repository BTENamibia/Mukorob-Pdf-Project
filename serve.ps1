param([int]$Port=8787)
$ErrorActionPreference='SilentlyContinue'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$prefix="http://127.0.0.1:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output "Mukorob PDF local server: $prefix"

function Send-Bytes($ctx,[byte[]]$bytes,$contentType){
  $ctx.Response.ContentType=$contentType
  $ctx.Response.Headers.Add('Cache-Control','no-cache')
  $ctx.Response.ContentLength64=$bytes.Length
  $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
  $ctx.Response.Close()
}
function IsLocalOrigin($ctx){
  $origin=$ctx.Request.Headers['Origin']
  return [string]::IsNullOrWhiteSpace($origin) -or $origin -eq $prefix
}

while ($listener.IsListening) {
  try {
    $ctx=$listener.GetContext()
    if(-not (IsLocalOrigin $ctx)){ $ctx.Response.StatusCode=403; $ctx.Response.Close(); continue }
    $path=[Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))

    if ($path -eq 'api/open') {
      $requested=$ctx.Request.QueryString['path']
      if([string]::IsNullOrWhiteSpace($requested)){ $ctx.Response.StatusCode=400; $ctx.Response.Close(); continue }
      try {
        $full=[IO.Path]::GetFullPath($requested)
        if(-not (Test-Path -LiteralPath $full -PathType Leaf)){throw 'not found'}
        if([IO.Path]::GetExtension($full).ToLowerInvariant() -ne '.pdf'){throw 'not a pdf'}
        $bytes=[IO.File]::ReadAllBytes($full)
        Send-Bytes $ctx $bytes 'application/pdf'
        continue
      } catch { $ctx.Response.StatusCode=404; $ctx.Response.Close(); continue }
    }

    if ([string]::IsNullOrWhiteSpace($path)) { $path='index.html' }
    $full=[IO.Path]::GetFullPath((Join-Path $root $path))
    $rootWithSep=$root.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
    if(-not $full.StartsWith($rootWithSep,[StringComparison]::OrdinalIgnoreCase) -and $full -ne $root){ $ctx.Response.StatusCode=403; $ctx.Response.Close(); continue }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { $ctx.Response.StatusCode=404; $ctx.Response.Close(); continue }

    $bytes=[IO.File]::ReadAllBytes($full)
    $ext=[IO.Path]::GetExtension($full).ToLowerInvariant()
    $types=@{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json';'.webmanifest'='application/manifest+json';'.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.svg'='image/svg+xml';'.ico'='image/x-icon'}
    $type=if($types.ContainsKey($ext)){$types[$ext]}else{'application/octet-stream'}
    Send-Bytes $ctx $bytes $type
  } catch {
    try { if($ctx){$ctx.Response.StatusCode=500;$ctx.Response.Close()} } catch {}
  }
}
