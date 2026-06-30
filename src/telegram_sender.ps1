# Trading Room Workshop — Telegram Sender (PS 5.1 compatible)
# Uzycie: .\telegram_sender.ps1 -Text "..." [-ImagePath "C:\...\file.png"]

param(
    [Parameter(Mandatory=$true)]
    [string]$Text,
    [string]$ImagePath = "",
    [string]$Token = "TOKEN_USUNIETY__czytaj_z__~/.claude/telegram_token.txt",
    [string]$ChatId = "-1003969670552",
    [int]$ThreadId = 7
)

$baseUrl = "https://api.telegram.org/bot$Token"

# --- Wyslij tekst ---
$body = @{ chat_id = $ChatId; message_thread_id = $ThreadId; text = $Text; parse_mode = "HTML" } | ConvertTo-Json -Depth 5
$r1 = Invoke-RestMethod -Uri "$baseUrl/sendMessage" -Method POST -Body $body -ContentType "application/json; charset=utf-8"
Write-Host "Tekst wysłany: $($r1.ok)"

# --- Wyslij zdjęcie jeśli podano ścieżkę ---
if ($ImagePath -ne "" -and (Test-Path $ImagePath)) {
    $boundary = [System.Guid]::NewGuid().ToString()
    $imgName   = [IO.Path]::GetFileName($ImagePath)
    $imgBytes  = [IO.File]::ReadAllBytes($ImagePath)
    $caption   = ($Text -split "`n")[0] -replace "<[^>]+>", ""  # pierwsza linia bez HTML tagów

    $nl = "`r`n"
    $enc = [System.Text.Encoding]::UTF8

    $head = "--$boundary$nl" +
        "Content-Disposition: form-data; name=`"chat_id`"$nl$nl$ChatId$nl" +
        "--$boundary$nl" +
        "Content-Disposition: form-data; name=`"message_thread_id`"$nl$nl$ThreadId$nl" +
        "--$boundary$nl" +
        "Content-Disposition: form-data; name=`"caption`"$nl$nl$caption$nl"

    $photoHdr = "--$boundary$nl" +
        "Content-Disposition: form-data; name=`"photo`"; filename=`"$imgName`"$nl" +
        "Content-Type: image/png$nl$nl"

    $footer = "$nl--$boundary--$nl"

    $hb = $enc.GetBytes($head)
    $pb = $enc.GetBytes($photoHdr)
    $fb = $enc.GetBytes($footer)

    $full = New-Object byte[] ($hb.Length + $pb.Length + $imgBytes.Length + $fb.Length)
    [Buffer]::BlockCopy($hb, 0, $full, 0, $hb.Length)
    [Buffer]::BlockCopy($pb, 0, $full, $hb.Length, $pb.Length)
    [Buffer]::BlockCopy($imgBytes, 0, $full, $hb.Length + $pb.Length, $imgBytes.Length)
    [Buffer]::BlockCopy($fb, 0, $full, $hb.Length + $pb.Length + $imgBytes.Length, $fb.Length)

    $r2 = Invoke-RestMethod -Uri "$baseUrl/sendPhoto" -Method POST -Body $full -ContentType "multipart/form-data; boundary=$boundary"
    Write-Host "Foto wysłane: $($r2.ok)"
} elseif ($ImagePath -ne "") {
    Write-Host "WARN: plik nie istnieje — $ImagePath"
}
