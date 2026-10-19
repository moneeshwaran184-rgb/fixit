# FixIt Local Development Server
# Serves static files on http://localhost:8000

$port = 8000
$staticDir = Join-Path $PSScriptRoot "static-20261019T140051Z-1-001\static"

if (-not (Test-Path $staticDir)) {
    Write-Error "Static directory not found: $staticDir"
    exit 1
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "==================================================" -ForegroundColor Green
Write-Host " FixIt Campus Portal Server Running!" -ForegroundColor Cyan
Write-Host " Open your browser at: http://localhost:$port" -ForegroundColor Yellow
Write-Host " Press Ctrl+C in this terminal to stop." -ForegroundColor Gray
Write-Host "==================================================" -ForegroundColor Green

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".webp" = "image/webp"
    ".svg"  = "image/svg+xml"
    ".mp4"  = "video/mp4"
    ".webm" = "video/webm"
    ".ico"  = "image/x-icon"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath.TrimStart('/')
        if ($path.StartsWith("static/")) {
            $path = $path.Substring(7)
        }
        if ([string]::IsNullOrWhiteSpace($path) -or $path -eq "index.html") {
            $path = "index.html"
        }

        $localFilePath = Join-Path $staticDir $path.Replace('/', '\')

        if (Test-Path $localFilePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($localFilePath).ToLower()
            $response.ContentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $response.AddHeader("Access-Control-Allow-Origin", "*")

            $bytes = [System.IO.File]::ReadAllBytes($localFilePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.StatusCode = 200
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }

        $response.OutputStream.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
