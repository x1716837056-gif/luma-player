$ErrorActionPreference = 'Stop'
$lumaRoot = Split-Path -Parent $PSScriptRoot
$lumaTools = Join-Path $lumaRoot 'tools'
$lumaDownloads = Join-Path $lumaTools 'downloads'
New-Item -ItemType Directory -Force $lumaDownloads | Out-Null
foreach ($lumaKind in @('mpv','ffmpeg','openlist')) {
    $lumaManifest = Get-Content -Raw -LiteralPath (Join-Path $lumaTools "$lumaKind-build.json") | ConvertFrom-Json
    if ([IO.Path]::GetFileName($lumaManifest.name) -ne $lumaManifest.name) { throw 'Invalid archive filename' }
    $lumaArchive = Join-Path $lumaDownloads $lumaManifest.name
    if (-not (Test-Path -LiteralPath $lumaArchive)) { Invoke-WebRequest -Uri $lumaManifest.browser_download_url -OutFile $lumaArchive }
    $lumaHash = (Get-FileHash -LiteralPath $lumaArchive -Algorithm SHA256).Hash.ToLower()
    if ("sha256:$lumaHash" -ne $lumaManifest.digest) { throw "Checksum mismatch for $lumaKind. The upstream asset may have changed; review the build manifest before updating it." }
    $lumaDestination = Join-Path $lumaTools $lumaKind
    New-Item -ItemType Directory -Force $lumaDestination | Out-Null
    & tar -xf $lumaArchive -C $lumaDestination
    if ($LASTEXITCODE -ne 0) { throw "Failed to extract $lumaKind" }
    Write-Output "Verified and extracted $lumaKind"
}
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/mpv-player/mpv/master/LICENSE.GPL' -OutFile (Join-Path $lumaTools 'mpv\LICENSE.GPL')
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/mpv-player/mpv/master/Copyright' -OutFile (Join-Path $lumaTools 'mpv\Copyright')

$lumaOpenListManifest = Get-Content -Raw -LiteralPath (Join-Path $lumaTools 'openlist-build.json') | ConvertFrom-Json
Invoke-WebRequest -Uri ("https://raw.githubusercontent.com/OpenListTeam/OpenList/"+$lumaOpenListManifest.version+"/LICENSE") -OutFile (Join-Path $lumaTools 'openlist\LICENSE')
Set-Content -LiteralPath (Join-Path $lumaTools 'openlist\SOURCE.txt') -Value ("Unmodified OpenList "+$lumaOpenListManifest.version+"; source: "+$lumaOpenListManifest.source+"; license: AGPL-3.0")
