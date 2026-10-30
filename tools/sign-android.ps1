$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $root "src-tauri\gen\android\app\build\outputs\apk\universal\release"
$unsignedApk = Join-Path $releaseDir "app-universal-release-unsigned.apk"
$alignedApk = Join-Path $releaseDir "MicroWars_0.1.1_universal_release_aligned.apk"
$signedApk = Join-Path $releaseDir "MicroWars_0.1.1_universal_release_signed.apk"
$keystore = Join-Path $root "microwars-release.keystore"

$buildToolsRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk\build-tools"
$buildTools = Get-ChildItem -LiteralPath $buildToolsRoot -Directory |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1

if (!$buildTools) {
    throw "Android build-tools were not found at $buildToolsRoot"
}

$zipalign = Join-Path $buildTools.FullName "zipalign.exe"
$apksigner = Join-Path $buildTools.FullName "apksigner.bat"

foreach ($path in @($unsignedApk, $keystore, $zipalign, $apksigner)) {
    if (!(Test-Path -LiteralPath $path)) {
        throw "Required file not found: $path"
    }
}

$securePassword = Read-Host "Keystore password" -AsSecureString
$passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $env:MICROWARS_ANDROID_STOREPASS = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)

    & $zipalign -f -p 4 $unsignedApk $alignedApk
    & $apksigner sign `
        --ks $keystore `
        --ks-key-alias microwars `
        --ks-pass env:MICROWARS_ANDROID_STOREPASS `
        --key-pass env:MICROWARS_ANDROID_STOREPASS `
        --out $signedApk `
        $alignedApk
    & $apksigner verify --verbose $signedApk

    Write-Host "Signed Android installer created at $signedApk"
} finally {
    Remove-Item Env:\MICROWARS_ANDROID_STOREPASS -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
}
