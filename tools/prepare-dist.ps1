$ErrorActionPreference = "Stop"

$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$dist = [IO.Path]::GetFullPath((Join-Path $root "dist"))

if (!$dist.StartsWith($root + [IO.Path]::DirectorySeparatorChar) -or [IO.Path]::GetFileName($dist) -ne 'dist') { throw "Invalid distribution path" }
if ((Test-Path -LiteralPath $dist) -and ((Get-Item -LiteralPath $dist).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Distribution target cannot be a link" }

if (Test-Path $dist) {
    Remove-Item -LiteralPath $dist -Recurse -Force
}

New-Item -ItemType Directory -Path $dist | Out-Null

Copy-Item -LiteralPath (Join-Path $root "index.html") -Destination $dist
Copy-Item -LiteralPath (Join-Path $root "main.js") -Destination $dist
Copy-Item -LiteralPath (Join-Path $root "style.css") -Destination $dist
Copy-Item -LiteralPath (Join-Path $root "src") -Destination $dist -Recurse

$campaign = Join-Path $root "campaign"
if (Test-Path $campaign) {
    Copy-Item -LiteralPath $campaign -Destination $dist -Recurse
}

Write-Host "Prepared dist at $dist"
