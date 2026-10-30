param(
    [int]$Width = 960,
    [int]$Height = 540,
    [int]$DelayMs = 900
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.Serialization

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PromoDir = Join-Path $Root "promocion"
$GifDir = Join-Path $PromoDir "gifs"

New-Item -ItemType Directory -Force -Path $GifDir | Out-Null

function New-PropertyItem([int]$Id, [int16]$Type, [byte[]]$Value) {
    $property = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject([System.Drawing.Imaging.PropertyItem])
    $property.Id = $Id
    $property.Type = $Type
    $property.Len = $Value.Length
    $property.Value = $Value
    return $property
}

function Convert-ToFrameBitmap([string]$Path, [int]$TargetWidth, [int]$TargetHeight) {
    $source = [System.Drawing.Image]::FromFile($Path)
    try {
        $bitmap = New-Object System.Drawing.Bitmap $TargetWidth, $TargetHeight
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([System.Drawing.Color]::Black)
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

            $scale = [Math]::Min($TargetWidth / $source.Width, $TargetHeight / $source.Height)
            $drawWidth = [int][Math]::Round($source.Width * $scale)
            $drawHeight = [int][Math]::Round($source.Height * $scale)
            $x = [int][Math]::Round(($TargetWidth - $drawWidth) / 2)
            $y = [int][Math]::Round(($TargetHeight - $drawHeight) / 2)

            $graphics.DrawImage($source, $x, $y, $drawWidth, $drawHeight)
        }
        finally {
            $graphics.Dispose()
        }

        return $bitmap
    }
    finally {
        $source.Dispose()
    }
}

function New-AnimatedGif([string]$OutputName, [string[]]$InputNames, [int]$Delay) {
    $existingInputs = @()
    foreach ($name in $InputNames) {
        $path = Join-Path $PromoDir $name
        if (Test-Path -LiteralPath $path) {
            $existingInputs += $path
        }
        else {
            Write-Warning "No existe: $name"
        }
    }

    if ($existingInputs.Count -eq 0) {
        Write-Warning "Sin frames para $OutputName"
        return
    }

    $outputPath = Join-Path $GifDir $OutputName
    $delayHundredths = [Math]::Max(1, [int][Math]::Round($Delay / 10))
    $delayBytes = New-Object byte[] (4 * $existingInputs.Count)
    for ($i = 0; $i -lt $existingInputs.Count; $i++) {
        [Array]::Copy([BitConverter]::GetBytes([uint32]$delayHundredths), 0, $delayBytes, $i * 4, 4)
    }

    $loopBytes = [BitConverter]::GetBytes([uint16]0)
    $first = Convert-ToFrameBitmap $existingInputs[0] $Width $Height
    $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/gif" }
    $saveEncoder = [System.Drawing.Imaging.Encoder]::SaveFlag
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters 1

    try {
        $first.SetPropertyItem((New-PropertyItem 0x5100 4 $delayBytes))
        $first.SetPropertyItem((New-PropertyItem 0x5101 3 $loopBytes))

        $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter $saveEncoder, ([long][System.Drawing.Imaging.EncoderValue]::MultiFrame)
        $first.Save($outputPath, $encoder, $encoderParams)

        for ($i = 1; $i -lt $existingInputs.Count; $i++) {
            $frame = Convert-ToFrameBitmap $existingInputs[$i] $Width $Height
            try {
                $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter $saveEncoder, ([long][System.Drawing.Imaging.EncoderValue]::FrameDimensionTime)
                $first.SaveAdd($frame, $encoderParams)
            }
            finally {
                $frame.Dispose()
            }
        }

        $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter $saveEncoder, ([long][System.Drawing.Imaging.EncoderValue]::Flush)
        $first.SaveAdd($encoderParams)
        Write-Host "[gif] $OutputName"
    }
    finally {
        $first.Dispose()
        $encoderParams.Dispose()
    }
}

New-AnimatedGif "menu_y_sectores.gif" @(
    "1_menu_inicio.png",
    "2_seleccion_sector_1.png",
    "3_sector_1_niveles.png",
    "4_seleccion_sector_3.png"
) $DelayMs

New-AnimatedGif "gameplay_sectores.gif" @(
    "sector_1_nivel_juego.png",
    "sector_2_nivel_juego.png",
    "sector_3_nivel_juego.png",
    "sector_4_nivel_juego.png",
    "sector_5_nivel_juego.png",
    "sector_6_nivel_juego.png"
) $DelayMs

New-AnimatedGif "recorrido_completo.gif" @(
    "1_menu_inicio.png",
    "2_seleccion_sector_1.png",
    "3_sector_1_niveles.png",
    "4_seleccion_sector_3.png",
    "sector_1_nivel_intro.png",
    "sector_1_nivel_juego.png",
    "sector_2_nivel_intro.png",
    "sector_2_nivel_juego.png",
    "sector_3_nivel_intro.png",
    "sector_3_nivel_juego.png",
    "sector_4_nivel_intro.png",
    "sector_4_nivel_juego.png",
    "sector_5_nivel_intro.png",
    "sector_5_nivel_juego.png",
    "sector_6_nivel_intro.png",
    "sector_6_nivel_juego.png"
) $DelayMs

for ($sector = 1; $sector -le 6; $sector++) {
    New-AnimatedGif "sector_$sector.gif" @(
        "sector_${sector}_nivel_intro.png",
        "sector_${sector}_nivel_juego.png"
    ) $DelayMs
}
