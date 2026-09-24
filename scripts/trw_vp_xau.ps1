# trw_vp_xau.ps1 — Rutyna Volume Profile XAU/USD
# Uruchamia analizę VP (Liquidity Map), generuje kartę HTML, wysyła Telegram thread 1885.
#
# Uruchomienie ręczne:
#   powershell -File "C:\Users\mietek\tradingview-mcp\scripts\trw_vp_xau.ps1"
#   powershell -File ... -Symbol FX:XAUUSD -Session Londyn
#
# Scheduled Task: trw-vp-xau-londyn (06:30 UTC) + trw-vp-xau-ny (13:00 UTC)

param(
    [string]$Symbol  = "FX:XAUUSD",
    [string]$Session = ""          # puste = auto-detect z godziny UTC
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$RepoRoot  = "C:\Users\mietek\tradingview-mcp"
$CardsDir  = "$RepoRoot\cards"
$Chrome    = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$Node      = "node"

$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd_HHmm")
$DateLabel = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
$ConfigPath = "$CardsDir\vp_config_$Timestamp.json"
$HtmlPath   = "$CardsDir\vp_xau_$Timestamp.html"
$PngPath    = "$CardsDir\vp_xau_$Timestamp.png"
$CropPath   = "$CardsDir\vp_xau_${Timestamp}_crop.png"

Write-Host "[VP] Start rutyny $(Get-Date -Format 'HH:mm:ss') UTC"

# ─── Krok 1: odczyt poziomów VP z TradingView ────────────────────────────────
Write-Host "[VP] Odczyt poziomow Liquidity Map..."
$nodeArgs = @("scripts/vp_read_levels.mjs", $Symbol)
if ($Session -ne "") { $nodeArgs += $Session }

$jsonOut = & $Node @nodeArgs 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    Write-Host "[VP] BLAD vp_read_levels.mjs:`n$jsonOut"
    exit 1
}

# wyizoluj JSON z ewentualnych logów na stderr (node może wypisać ostrzeżenia)
$jsonLine = ($jsonOut -split "`n" | Where-Object { $_.Trim().StartsWith("{") }) -join "`n"
if (-not $jsonLine) {
    Write-Host "[VP] Brak JSON w wyjsciu:`n$jsonOut"
    exit 1
}

[System.IO.File]::WriteAllText($ConfigPath, $jsonLine, [System.Text.Encoding]::UTF8)
Write-Host "[VP] Config zapisany: $ConfigPath"

# ─── Krok 2: generowanie karty HTML ──────────────────────────────────────────
Write-Host "[VP] Generowanie karty HTML..."
& $Node "scripts/gen_vp_analysis_card.mjs" $ConfigPath $HtmlPath 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $HtmlPath)) {
    Write-Host "[VP] BLAD gen_vp_analysis_card.mjs"
    exit 1
}
Write-Host "[VP] HTML: $HtmlPath"

# ─── Krok 3: render PNG (Chrome headless) ────────────────────────────────────
Write-Host "[VP] Render PNG..."
& $Chrome --headless=new --disable-gpu "--screenshot=$PngPath" --window-size=580,1800 --hide-scrollbars "file:///$HtmlPath"
Start-Sleep -Seconds 6
if (-not (Test-Path $PngPath)) { Write-Host "[VP] BLAD: PNG nie zostal wygenerowany"; exit 1 }

# ─── Krok 4: auto-crop ───────────────────────────────────────────────────────
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile($PngPath)
$lastRow = 0
for ($y = $bmp.Height - 1; $y -ge 0; $y--) {
    $found = $false
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $px = $bmp.GetPixel($x, $y)
        if ($px.R -gt 25 -or $px.G -gt 25 -or $px.B -gt 25) { $found = $true; break }
    }
    if ($found) { $lastRow = $y; break }
}
$cropH = [Math]::Min($lastRow + 20, $bmp.Height)
$rect  = [System.Drawing.Rectangle]::new(0, 0, $bmp.Width, $cropH)
$crop  = $bmp.Clone($rect, $bmp.PixelFormat)
$crop.Save($CropPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose(); $crop.Dispose()
Write-Host "[VP] Crop: ${cropH}px -> $CropPath"

# ─── Krok 5: wyciągnij dane z config do captionu ─────────────────────────────
$cfgObj = $jsonLine | ConvertFrom-Json
$sym     = $cfgObj.symbol
$sess    = $cfgObj.session
$pr      = $cfgObj.price
$biasShort = $cfgObj.bias.short
$rangeStr  = if ($cfgObj.range) { "$($cfgObj.range) pkt" } else { "brak" }

$scTags = ($cfgObj.scenarios | ForEach-Object { "$($_.tag):$($_.direction.Substring(0,1)) R:R $($_.rr)" }) -join " | "
$caption = "$sym Vol Profile $sess | $DateLabel | Cena: $pr | Bias: $biasShort | Zakres: $rangeStr | $scTags"

# ─── Krok 6: wysylka Telegram thread 1885 ────────────────────────────────────
Write-Host "[VP] Wysylka Telegram..."
$token   = (Get-Content "C:\Users\mietek\.claude\telegram_token.txt" -Raw).Trim()
$chatId  = "-1003969670552"
$threadId = 1885
$baseUrl = "https://api.telegram.org/bot$token"

$boundary = [System.Guid]::NewGuid().ToString()
$imgBytes = [System.IO.File]::ReadAllBytes($CropPath)
$enc      = [System.Text.Encoding]::UTF8
$nl       = "`r`n"

$head = "--$boundary$nl" +
    "Content-Disposition: form-data; name=`"chat_id`"$nl$nl$chatId$nl" +
    "--$boundary$nl" +
    "Content-Disposition: form-data; name=`"message_thread_id`"$nl$nl$threadId$nl" +
    "--$boundary$nl" +
    "Content-Disposition: form-data; name=`"caption`"$nl$nl$caption$nl"
$photoHdr = "--$boundary$nl" +
    "Content-Disposition: form-data; name=`"photo`"; filename=`"vp_xau.png`"$nl" +
    "Content-Type: image/png$nl$nl"
$footer = "$nl--$boundary--$nl"

$hb = $enc.GetBytes($head); $pb = $enc.GetBytes($photoHdr); $fb = $enc.GetBytes($footer)
$full = New-Object byte[] ($hb.Length + $pb.Length + $imgBytes.Length + $fb.Length)
[Buffer]::BlockCopy($hb, 0, $full, 0, $hb.Length)
[Buffer]::BlockCopy($pb, 0, $full, $hb.Length, $pb.Length)
[Buffer]::BlockCopy($imgBytes, 0, $full, $hb.Length + $pb.Length, $imgBytes.Length)
[Buffer]::BlockCopy($fb, 0, $full, $hb.Length + $pb.Length + $imgBytes.Length, $fb.Length)

$resp = Invoke-RestMethod -Uri "$baseUrl/sendPhoto" -Method POST -Body $full `
    -ContentType "multipart/form-data; boundary=$boundary"

if ($resp.ok) {
    Write-Host "[VP] Wyslano! msg_id=$($resp.result.message_id) thread=$threadId"
} else {
    Write-Host "[VP] BLAD Telegram: $($resp | ConvertTo-Json -Compress)"
    exit 1
}

# ─── Krok 7: cleanup tymczasowego config ──────────────────────────────────────
Remove-Item $ConfigPath -Force -ErrorAction SilentlyContinue
Write-Host "[VP] Rutyna zakonczona."
