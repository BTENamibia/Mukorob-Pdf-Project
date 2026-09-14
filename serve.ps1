param([int]$Port=8787)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Output "Mukorob PDF local server: http://127.0.0.1:$Port/"
while ($listener.IsListening) {
  try {
    $ctx=$listener.GetContext(); $path=[Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($path -eq 'api/open') {
      $requested=$ctx.Request.QueryString['path'];
      if([string]::IsNullOrWhiteSpace($requested)){ $ctx.Response.StatusCode=400; $ctx.Response.Close(); continue }
      try { $full=[IO.Path]::GetFullPath($requested); if(-not (Test-Path -LiteralPath $full -PathType Leaf)){throw 'not found'}; $bytes=[IO.File]::ReadAllBytes($full); $ctx.Response.ContentType='application/pdf'; $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length); $ctx.Response.Close(); continue } catch { $ctx.Response.StatusCode=404; $ctx.Response.Close(); continue }
    }
    if ([string]::IsNullOrWhiteSpace($path)) { $path='index.html' }
    $full=Join-Path $root $path
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { $ctx.Response.StatusCode=404; $ctx.Response.Close(); continue }
    $bytes=[IO.File]::ReadAllBytes($full)
    $ext=[IO.Path]::GetExtension($full).ToLowerInvariant()
    $types=@{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json';'.webmanifest'='application/manifest+json';'.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.svg'='image/svg+xml';'.ico'='image/x-icon'}
    $ctx.Response.ContentType= if($types.ContainsKey($ext)){$types[$ext]}else{'application/octet-stream'}
    $ctx.Response.Headers.Add('Cache-Control','no-cache')
    $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length);$ctx.Response.Close()
  } catch { }
}
