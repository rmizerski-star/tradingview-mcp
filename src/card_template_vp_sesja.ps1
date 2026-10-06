# card_template_vp_sesja.ps1
# VP Sesja XAU/USD — render + send (format v3: 1800px, 4 kolumny, sendDocument)
# Uzywaj: .\card_template_vp_sesja.ps1 -HtmlTemplate "sciezka\do\karty.html" -OutName "vp_session_date" -Threads @("8008","1885") -Caption "..."
# Domyslne watki: 8008 (VP XAU) + 1885 (XAU/USD) — obowiazkowo oba!
#
# FORMAT V3 (od 06.10.2026):
#   Szerokosc: 1800px
#   Uklad: 4 kolumny w Row1 (VP Histogram | Fibonacci+Poziomy | Chronologia | Strefy Zlecen)
#          4 kolumny w Row2 (Sc.A | Sc.B | Sc.C | Wnioski)
#   Font: min 10.5px body, 13-15px wartosci, 17px header
#   Wyslij: sendDocument (bez kompresji Telegrama — pełna rozdzielczosc PNG)
#   Szablon HTML: src/vp_sesja_card_v3.html (z LOGO_SRC jako jedyny placeholder)
#
# HISTORIA:
#   v1 (do 09.2026): 1200px, 2-row, 3 kolumny, sendPhoto
#   v2 (09-10.2026): 1400px, 2-row, 4 kolumny, sendPhoto
#   v3 (od 06.10.2026): 1800px, 4+4 kolumny, sendDocument — AKTUALNY FORMAT

param(
    [string]$HtmlTemplate = "",   # sciezka do HTML karty (jesli puste: src/vp_sesja_card_v3.html)
    [string]$OutName      = "vp_sesja",
    [string[]]$Threads    = @("8008","1885"),
    [string]$Caption      = ""
)

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

$SrcDir   = $PSScriptRoot
$LogoPath = Join-Path $SrcDir "logo.jpg"
$TmpDir   = $env:TEMP

if (-not $HtmlTemplate) { $HtmlTemplate = Join-Path $SrcDir "vp_sesja_card_v3.html" }
if (-not (Test-Path $HtmlTemplate)) { throw "HTML template not found: $HtmlTemplate" }

$HtmlOut  = Join-Path $TmpDir "$OutName.html"
$RawPng   = Join-Path $TmpDir "${OutName}_raw.png"
$CropPng  = Join-Path $TmpDir "$OutName.png"

# 1) Inject logo base64
$LogoB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($LogoPath))
$html    = [System.IO.File]::ReadAllText($HtmlTemplate, [System.Text.Encoding]::UTF8)
$html    = $html.Replace('LOGO_SRC', "data:image/jpeg;base64,$LogoB64")
[System.IO.File]::WriteAllText($HtmlOut, $html, [System.Text.Encoding]::UTF8)
Write-Host "HTML OK: $HtmlOut"

# 2) Chrome headless render — 1800px szerokosc
$Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $Chrome)) { $Chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
if (-not (Test-Path $Chrome)) { throw "Chrome.exe not found" }
$HtmlUri = "file:///" + $HtmlOut.Replace('\','/')

& $Chrome --headless=new --disable-gpu `
    "--screenshot=$RawPng" `
    --window-size=1800,3800 `
    --hide-scrollbars `
    "$HtmlUri" 2>$null
Start-Sleep -Seconds 5

if (-not (Test-Path $RawPng)) { throw "Chrome render failed: $RawPng not found" }
Write-Host "PNG raw OK: $((Get-Item $RawPng).Length) bytes"

# 3) Auto-crop — skanuj od dolu, R/G/B > 25, +24px margines
Add-Type -AssemblyName System.Drawing
$bmp  = [System.Drawing.Bitmap]::new($RawPng)
$W    = $bmp.Width
$H    = $bmp.Height
$cropY = $H
for ($y = $H - 1; $y -ge 0; $y--) {
    $hit = $false
    for ($x = 0; $x -lt $W; $x++) {
        $p = $bmp.GetPixel($x, $y)
        if ($p.R -gt 25 -or $p.G -gt 25 -or $p.B -gt 25) { $hit = $true; break }
    }
    if ($hit) { $cropY = $y; break }
}
$cropH = [Math]::Min($cropY + 24, $H)
$rect  = [System.Drawing.Rectangle]::new(0, 0, $W, $cropH)
$out   = $bmp.Clone($rect, $bmp.PixelFormat)
$out.Save($CropPng, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose(); $out.Dispose()
Write-Host ("PNG crop OK: " + $W + "x" + $cropH + " / " + [Math]::Round((Get-Item $CropPng).Length/1024) + " KB")

# 4) Wyslij sendDocument na kazdy watek (bez kompresji!)
$token    = (Get-Content "$env:USERPROFILE\.claude\telegram_token.txt" -Raw).Trim()
$chatId   = "-1003969670552"
$fileBytes = [System.IO.File]::ReadAllBytes($CropPng)
$enc      = [System.Text.Encoding]::UTF8
$fileName = [System.IO.Path]::GetFileName($CropPng)

foreach ($tid in $Threads) {
    $boundary = "boundary" + [guid]::NewGuid().ToString("N")
    $body     = [System.IO.MemoryStream]::new()
    $parts    = @(
        "--$boundary`r`nContent-Disposition: form-data; name=`"chat_id`"`r`n`r`n$chatId`r`n",
        "--$boundary`r`nContent-Disposition: form-data; name=`"message_thread_id`"`r`n`r`n$tid`r`n",
        "--$boundary`r`nContent-Disposition: form-data; name=`"caption`"`r`n`r`n$Caption`r`n",
        "--$boundary`r`nContent-Disposition: form-data; name=`"document`"; filename=`"$fileName`"`r`nContent-Type: image/png`r`n`r`n"
    )
    foreach ($p in $parts) { $b = $enc.GetBytes($p); $body.Write($b, 0, $b.Length) }
    $body.Write($fileBytes, 0, $fileBytes.Length)
    $tail = $enc.GetBytes("`r`n--$boundary--`r`n")
    $body.Write($tail, 0, $tail.Length)

    try {
        $resp = Invoke-RestMethod `
            -Uri "https://api.telegram.org/bot$token/sendDocument" `
            -Method POST `
            -ContentType "multipart/form-data; boundary=$boundary" `
            -Body $body.ToArray()
        Write-Host ("Telegram OK sendDocument thread=" + $tid + " msg=" + $resp.result.message_id)
    } catch {
        Write-Host ("Telegram ERROR thread=" + $tid + ": " + $_)
    }
    $body.Dispose()
    Start-Sleep -Seconds 1
}

Write-Host "DONE: $CropPng"
