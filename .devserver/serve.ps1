param(
    [int]$Port = 5173,
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$mimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".ico"  = "image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root on http://localhost:$Port/"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        try {
            $relPath = [Uri]::UnescapeDataString($request.Url.AbsolutePath)
            if ($relPath -eq "/") { $relPath = "/index.html" }
            $filePath = Join-Path $Root ($relPath.TrimStart("/"))
            $fullRoot = (Resolve-Path $Root).Path
            if ((Test-Path $filePath) -and ((Resolve-Path $filePath).Path.StartsWith($fullRoot))) {
                $ext = [System.IO.Path]::GetExtension($filePath)
                $contentType = $mimeMap[$ext]
                if (-not $contentType) { $contentType = "application/octet-stream" }
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = $contentType
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.OutputStream.Write($notFound, 0, $notFound.Length)
            }
        } finally {
            $response.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
}
