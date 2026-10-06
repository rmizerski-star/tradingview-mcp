# gen_vp_londyn_v2_30092026.ps1 -- VP Londyn XAU/USD 30.09.2026 (1200px, 2-row)
Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

$Scratch  = $PSScriptRoot
$HtmlPath = Join-Path $Scratch "vp_londyn_v2_30092026.html"
$PngPath  = Join-Path $Scratch "vp_londyn_v2_30092026.png"
$CropPath = Join-Path $Scratch "vp_londyn_v2_30092026_crop.png"

$LogoPath = "C:\Users\mietek\tradingview-mcp\src\logo.jpg"
$LogoB64  = [Convert]::ToBase64String([IO.File]::ReadAllBytes($LogoPath))

$html = @'
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>VP Londyn XAU 30.09.2026</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#0a0c10;font-family:'Segoe UI','Calibri',Arial,sans-serif;color:#1a2535;font-size:12px;-webkit-font-smoothing:antialiased}
.card-wrap{width:1200px;background:#f0f3f8;overflow:hidden}

/* HEADER */
.hdr{background:#162840;padding:11px 16px;display:flex;align-items:center;gap:14px}
.hdr img{width:40px;height:40px;border-radius:7px;flex-shrink:0}
.hdr-m{flex:1}
.hdr-t{font-size:14px;font-weight:700;color:#fff;letter-spacing:.3px}
.hdr-s{font-size:9px;color:#90b0d0;margin-top:3px;line-height:1.6}
.hdr-r{text-align:right}
.hdr-p{font-size:28px;font-weight:700;color:#fff;letter-spacing:-.5px;line-height:1}
.hdr-d{font-size:9px;margin-top:3px;color:#a8d0f0}

/* STAT BAR */
.sbar{display:grid;grid-template-columns:repeat(6,1fr);background:#fff;border-bottom:2px solid #c8d8ec}
.sb{padding:6px 8px;border-right:1px solid #dde6f0;text-align:center}
.sb:last-child{border-right:0}
.sb-l{font-size:7px;color:#6888a8;text-transform:uppercase;letter-spacing:.5px;font-weight:700}
.sb-v{font-size:13px;font-weight:700;margin-top:2px}
.sb-d{font-size:7.5px;margin-top:1px;font-weight:600}

/* TAG ROW */
.tp-row{display:flex;flex-wrap:wrap;gap:4px;padding:6px 11px;background:#eef2f8;border-bottom:1px solid #c8d8ec}
.tag{font-size:8px;font-weight:700;padding:3px 8px;border-radius:3px;white-space:nowrap}
.t-ok{background:#e0f5e8;color:#187838;border:1px solid #70c888}
.t-info{background:#e0eefb;color:#1458a8;border:1px solid #80b8e8}
.t-warn{background:#fff2e0;color:#b84808;border:1px solid #f0a860}
.t-gold{background:#fdf6d8;color:#906808;border:1px solid #e0c030}
.t-new{background:#f5e8ff;color:#7008b8;border:1px solid #c080e8}
.t-hit{background:#fde8e8;color:#a81828;border:1px solid #e88898}
.t-bos{background:#fff0f8;color:#a808a8;border:1px solid #d870d8}

/* SECTION HEADER */
.sh{background:#dde8f5;padding:4px 9px;font-size:8px;font-weight:700;color:#2058a0;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #c0d0e8}

/* ===== ROW 1: 3 columns ===== */
.row1{display:flex;border-top:1px solid #c8d8ec}
.r1c1{width:380px;flex-shrink:0;border-right:1px solid #c8d8ec;background:#fff}
.r1c2{width:340px;flex-shrink:0;border-right:1px solid #c8d8ec;background:#f8fafd}
.r1c3{flex:1;background:#f2f5fa}

/* VP HISTOGRAM */
.vp{padding:4px 6px 3px}
.vp-r{display:flex;align-items:center;gap:3px;margin-bottom:2px}
.vp-lbl{font-size:8px;font-family:'Courier New',monospace;min-width:46px;text-align:right;flex-shrink:0;font-weight:600;color:#4878a8}
.vp-bw{flex:1;height:10px;display:flex;align-items:center}
.vp-b{height:7px;border-radius:1px;min-width:2px}
.vp-vol{font-size:7px;color:#6888a8;margin-left:3px;white-space:nowrap}
.vp-tag{font-size:6.5px;font-weight:700;padding:1px 4px;border-radius:1px;margin-left:3px;white-space:nowrap}
.thi{background:#fff0d8;color:#b86008;font-weight:900}
.tlo{background:#d8eeff;color:#1058b0;font-weight:900}
.tsell{background:#fde0e0;color:#c01828;font-weight:700}
.tbuy{background:#e0fbec;color:#107838;font-weight:700}
.tbos{background:#f0e8ff;color:#7020b0;font-weight:700}
.tinst{background:#ffe8f5;color:#a010a0;font-weight:900}
.tnow{background:#fffad8;color:#786808;font-weight:700}
.vp-r.hi .vp-lbl{color:#a86008;font-weight:900}
.vp-r.lo .vp-lbl{color:#1060a8;font-weight:900}
.vp-r.now .vp-lbl{color:#686808;font-weight:900}
.vp-sep{border-top:1px dashed #c8d4e0;margin:3px 0}
.vp-zone{padding:3px 6px;margin:2px 0;border-radius:3px;font-size:8px;font-weight:700}
.z-sell{background:#fde8e8;border-left:3px solid #d02030;color:#901020}
.z-buy{background:#e0f8ec;border-left:3px solid #1090a0;color:#107040}
.z-brk{background:#f0e8ff;border-left:3px solid #7020b0;color:#5010a0}
.z-eq{background:#eeeeff;border-left:3px solid #5830c8;color:#4020a0}

/* POZIOMY */
.lv{display:flex;align-items:center;padding:3px 8px;border-bottom:1px solid #e8eef6;gap:4px}
.lv.hi{background:#fff5e8;border-left:3px solid #d06000}
.lv.lo{background:#e8f3ff;border-left:3px solid #0870c0}
.lv.bos{background:#f0edff;border-left:3px solid #5020c0}
.lv.fvg{background:#fdf0ff;border-left:3px solid #9020c0}
.lv.key{background:#f8f9e8;border-left:3px solid #b0a010}
.lv.sell{background:#fef0f0;border-left:3px solid #c02030}
.lv.buy{background:#eef8f0;border-left:3px solid #108040}
.lv.inst{background:#f0f8ff;border-left:3px solid #2070b8}
.lv.now{background:#fffde0;border-left:3px solid #a09010}
.lv-n{font-size:8.5px;flex:1;color:#304868;line-height:1.3}
.lv-p{font-size:11px;font-weight:700;font-family:'Courier New',monospace;flex-shrink:0;min-width:52px;text-align:right}
.lv-d{font-size:8px;font-family:'Courier New',monospace;min-width:26px;text-align:right;flex-shrink:0;font-weight:700}
.cp{color:#107838}.cn{color:#b01020}.cz{color:#7090a8}

/* FIBONACCI */
.fb{display:flex;align-items:center;gap:4px;padding:3px 8px;border-bottom:1px solid #e8eef6}
.fb-l{font-size:8px;color:#6888a8;font-weight:700;min-width:48px;flex-shrink:0}
.fb-p{font-size:11px;font-weight:700;font-family:'Courier New',monospace;flex:1}
.fb-n{font-size:8px;color:#9090a8}
.fb.now .fb-p{color:#786808;font-weight:900}
.fb.ote .fb-l{color:#107838;font-weight:900}
.fb.ote .fb-p{color:#107038}
.fb.hi0{background:#fff5e8}
.fb.lo0{background:#e8f3ff}
.fb.bosf{background:#f0edff}

/* CHRONOLOGIA */
.tl{display:flex;align-items:center;gap:4px;padding:3px 8px;border-bottom:1px solid #e8eef6}
.tl-t{font-size:8px;font-family:'Courier New',monospace;color:#6880a8;min-width:34px;flex-shrink:0;font-weight:700}
.tl-l{font-size:8.5px;flex:1;color:#304870;line-height:1.3}
.tl-p{font-size:9px;font-family:'Courier New',monospace;font-weight:700;min-width:46px;text-align:right;flex-shrink:0}
.tl-v{font-size:7px;color:#7090a8;min-width:28px;text-align:right;flex-shrink:0}
.tl.hi{background:#fff5ef}.tl.hi .tl-l{color:#a84808;font-weight:700}
.tl.lo{background:#eff8ff}.tl.lo .tl-l{color:#1060a8;font-weight:700}
.tl.bk{background:#ffeef8}.tl.bk .tl-l{color:#9010a0;font-weight:700}
.tl.up{background:#eef8f2}.tl.up .tl-l{color:#107840;font-weight:700}
.tl.nw{background:#fffde0}.tl.nw .tl-l{color:#686808;font-weight:700}

/* ===== ROW 2: SCENARIUSZE (full width, 3 obok siebie) ===== */
.row2{border-top:2px solid #b0c8e0;background:#eaf0fa}
.row2-hdr{background:#1a3858;padding:5px 14px;font-size:9px;font-weight:700;color:#d0e8ff;text-transform:uppercase;letter-spacing:.7px}
.sc-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border-bottom:1px solid #b8cce0}
.sc{padding:10px 14px;border-right:1px solid #c0d4e8}
.sc:last-child{border-right:0}
.sc-a{background:#edf7ff;border-top:3px solid #1068b8}
.sc-b{background:#fff3ef;border-top:3px solid #c84820}
.sc-c{background:#f3eeff;border-top:3px solid #6838b8}
.sc-ttl{font-size:11px;font-weight:700;display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}
.sc-a .sc-ttl{color:#0a4888}.sc-b .sc-ttl{color:#8a2810}.sc-c .sc-ttl{color:#4020a0}
.sc-badge{font-size:9px;padding:2px 8px;border-radius:3px;font-weight:700}
.g-a{background:#d8eeff;color:#0a4888;border:1px solid #70aadd}
.g-b{background:#fde0d0;color:#8a2810;border:1px solid #d8906a}
.g-c{background:#ecdeff;color:#4020a0;border:1px solid #a870d8}
.rr{font-size:9px;font-weight:700;padding:2px 8px;border-radius:3px;background:#fff8d0;color:#806010;border:1px solid #d0b030;margin-left:auto}
.sc-row{display:flex;justify-content:space-between;align-items:baseline;padding:2px 0;border-bottom:1px solid rgba(0,0,0,.06)}
.sc-row:last-of-type{border-bottom:0}
.sc-lbl{font-size:8.5px;color:#445870}
.sc-val{font-size:11px;font-weight:700;font-family:'Courier New',monospace;color:#0a0a0a}
.sc-trigger{font-size:8.5px;padding:5px 7px;border-radius:4px;margin-bottom:7px;line-height:1.6}
.sc-a .sc-trigger{background:#d8ecff;color:#1050a8}
.sc-b .sc-trigger{background:#fde8d8;color:#882810}
.sc-c .sc-trigger{background:#ecdcff;color:#5020a8}
.sc-note{font-size:8px;margin-top:7px;line-height:1.7;padding:5px 7px;border-radius:4px}
.sc-a .sc-note{background:#e0f0ff;color:#1a4880}
.sc-b .sc-note{background:#fdeee0;color:#803820}
.sc-c .sc-note{background:#ede0ff;color:#4a1898}
.sc-sep{border-top:1px dashed rgba(0,0,0,.12);margin:5px 0}

/* ===== ROW 3: WNIOSKI (full width) ===== */
.wn{background:#fff;padding:8px 14px;border-top:1px solid #c8d4e0}
.wn-t{font-size:9px;font-weight:700;color:#1a3050;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px}
.wn-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 24px}
.wn-l{list-style:none;font-size:9px;line-height:2;color:#304868}
.wn-l li::before{content:'\203A';color:#5878a8;margin-right:5px;font-size:12px;font-weight:700}
.wn-l li.g::before{color:#107838}.wn-l li.g b{color:#107838}
.wn-l li.r::before{color:#b01020}.wn-l li.r b{color:#b01020}
.wn-l li.p::before{color:#7010b0}.wn-l li.p b{color:#5010a0}

.foot{background:#162840;padding:6px 14px;font-size:7.5px;color:#7098c0;text-align:center;line-height:1.7}

/* ===== STATUS STREF POPRZEDNIEJ SESJI — standard VP ===== */
.prev-sect{background:#fff;border-top:2px solid #c8d8ec;border-bottom:2px solid #c8d8ec}
.prev-hdr-bar{background:#0d1020;padding:4px 14px;font-size:8.5px;font-weight:700;color:#c0d8ff;text-transform:uppercase;letter-spacing:.6px;display:flex;align-items:center;gap:8px}
.prev-leg{display:flex;gap:10px;margin-left:auto;flex-wrap:wrap}
.prev-leg-i{display:flex;align-items:center;gap:3px;font-size:7.5px;font-weight:700}
.pl-a{color:#107038}.pl-p{color:#806010}.pl-e{color:#a01020}.pl-s{color:#1060a0}
.prev-row{display:flex;align-items:center;padding:3px 10px;border-bottom:1px solid #ece0d8;gap:6px}
.prev-row:last-child{border-bottom:0}
.prev-row.act{background:#f4fff8}.prev-row.part{background:#fffbf0}.prev-row.exh{background:#fff5f5}.prev-row.sup{background:#f0f6ff}
.pr-lvl{font-family:'Courier New',monospace;font-size:10px;font-weight:700;min-width:56px;flex-shrink:0}
.prev-row.act .pr-lvl{color:#107038}.prev-row.part .pr-lvl{color:#806010}.prev-row.exh .pr-lvl{color:#a01020}.prev-row.sup .pr-lvl{color:#1060a0}
.pr-name{font-size:8.5px;font-weight:700;min-width:170px;flex-shrink:0;color:#304868}
.pr-test{font-size:8px;flex:1;color:#506888;line-height:1.4}
.pr-vol{font-size:8px;min-width:52px;text-align:right;color:#7090a8;font-family:'Courier New',monospace;flex-shrink:0;font-weight:700}
.pr-vol.big{color:#c02020;font-weight:900}
.pr-status{font-size:7.5px;font-weight:700;padding:2px 8px;border-radius:3px;min-width:110px;text-align:center;white-space:nowrap;flex-shrink:0}
.s-act{background:#d8fce8;color:#0a6028;border:1px solid #60c880}
.s-part{background:#fff8d0;color:#806010;border:1px solid #d0b030}
.s-exh{background:#ffe0d8;color:#a01020;border:1px solid #d08080}
.s-sup{background:#d0e8ff;color:#0840a0;border:2px solid #6090e0}
</style></head>
<body><div class="card-wrap">

<!-- HEADER -->
<div class="hdr">
  <img id="logo" src="" alt="TRW">
  <div class="hdr-m">
    <div class="hdr-t">XAU/USD &mdash; PROFIL WOLUMENU SESJA LONDYN &middot; 30.09.2026</div>
    <div class="hdr-s">
      FX:XAUUSD &middot; M15 &middot; ~16 bar&#243;w Londyn (07:15&ndash;11:30 UTC) &nbsp;&bull;&nbsp;
      BOS 4191,39 przebity z vol 12K &bull; London HIGH 4202,24 (nowy CDH) &bull; Pull-back do Fib 0.618 = OTE BUY dla NY
    </div>
  </div>
  <div class="hdr-r">
    <div class="hdr-p">4 185,68</div>
    <div class="hdr-d">Ldn HIGH 4 202,24 &nbsp;&bull;&nbsp; Ldn LOW 4 173,97 &nbsp;&bull;&nbsp; Range 28,27 pkt</div>
  </div>
</div>

<!-- STAT BAR -->
<div class="sbar">
  <div class="sb"><div class="sb-l">&#127462;&#127468; Ldn HIGH</div><div class="sb-v" style="color:#b84808">4 202,24</div><div class="sb-d" style="color:#b84808">Nowy CDH</div></div>
  <div class="sb"><div class="sb-l">Ldn LOW (sweep)</div><div class="sb-v" style="color:#0e58b8">4 173,97</div><div class="sb-d" style="color:#0e58b8">Az LOW +8 pkt</div></div>
  <div class="sb"><div class="sb-l">Zakres Londyn</div><div class="sb-v">28,27 pkt</div><div class="sb-d" style="color:#107838">bycze</div></div>
  <div class="sb"><div class="sb-l">Max vol bar</div><div class="sb-v" style="color:#107838">12 201</div><div class="sb-d" style="color:#107838">@ H 4197,92</div></div>
  <div class="sb"><div class="sb-l">BOS przebity</div><div class="sb-v" style="color:#7010b0">4 191,39</div><div class="sb-d" style="color:#7010b0">teraz wsparcie</div></div>
  <div class="sb"><div class="sb-l">Cena / Fib</div><div class="sb-v" style="color:#686808">4 185,68</div><div class="sb-d" style="color:#686808">0.618 = OTE</div></div>
</div>

<!-- TAGS -->
<div class="tp-row">
  <span class="tag t-bos">BOS 4191,39 przebity z vol 10 624 &#9650;</span>
  <span class="tag t-warn">London HIGH 4202,24 &mdash; nowy CDH &#9733;</span>
  <span class="tag t-ok">Inst. BUY zone 4190&ndash;4198 (~43K vol)</span>
  <span class="tag t-info">Pull-back do Fib 0.618 = 4184,77</span>
  <span class="tag t-gold">Fib 0.382 = 4191,44 = BOS (confluence!)</span>
  <span class="tag t-hit">Ldn LOW sweep Az LOW +8 pkt (4173,97)</span>
  <span class="tag t-new">Cena 4185 = OTE BUY &mdash; preferowany setup NY</span>
</div>

<!-- ===== STATUS STREF POPRZEDNIEJ SESJI (WYPELNIC DANYMI) ===== -->
<!--
  INSTRUKCJA: uzupelnij ponizsze wiersze na podstawie tego co zrobila cena
  w biezacej sesji wzgledem poziomow z poprzedniej karty VP.
  Klasy rzedow: act=aktywna, part=czesciowo, exh=wyczerpana, sup=wsparcie silne
  Klasy statusu: s-act, s-part, s-exh, s-sup
-->
<div class="prev-sect">
<div class="prev-hdr-bar">
  &#128202; Status stref [POPRZEDNIA_SESJA] &rarr; po sesji [BIEZACA_SESJA] &mdash; wyczerpanie wolumenowe
  <div class="prev-leg">
    <span class="prev-leg-i pl-a">&#11044; AKTYWNA &mdash; nie testowana</span>
    <span class="prev-leg-i pl-p">&#11044; CZ&#280;CIOWO &mdash; testowana, trzyma</span>
    <span class="prev-leg-i pl-e">&#11044; WYCZERPANA &mdash; przebita vol</span>
    <span class="prev-leg-i pl-s">&#11044; WSPARCIE &mdash; 2x+ odbi&#322;a</span>
  </div>
</div>
<!-- WZORZEC WIERSZA: skopiuj i dostosuj dla kazdego poziomu -->
<!-- <div class="prev-row act">
  <div class="pr-lvl">4 XXX,XX</div>
  <div class="pr-name">Nazwa strefy (OPOR/WSPARCIE #N)</div>
  <div class="pr-test">Opis: nie testowana LUB testowana vol X przy Y UTC LUB przebita z vol Xk</div>
  <div class="pr-vol">vol lub &mdash;</div>
  <div class="pr-status s-act">&#11044; AKTYWNA &mdash; krotki opis</div>
</div> -->
<!-- <div class="prev-row part">
  <div class="pr-lvl">4 XXX,XX</div>
  <div class="pr-name">Nazwa strefy</div>
  <div class="pr-test">Opis testu: testowana z vol X, trzymala/odbila</div>
  <div class="pr-vol big">X k</div>
  <div class="pr-status s-part">&#11044; CZ&#280;CIOWO &mdash; aktywny opor/wspar.</div>
</div> -->
<!-- <div class="prev-row exh">
  <div class="pr-lvl">4 XXX,XX</div>
  <div class="pr-name">Nazwa strefy (wyczerpana)</div>
  <div class="pr-test">Przebita W DOL/GORE z vol Xk (HH:MM UTC); zlecenia wypelnione</div>
  <div class="pr-vol big">X k!</div>
  <div class="pr-status s-exh">&#11044; WYCZERPANA &#8595; &mdash; nie dziala jako wspar.</div>
</div> -->
<!-- <div class="prev-row sup">
  <div class="pr-lvl">4 XXX,XX</div>
  <div class="pr-name">Nazwa strefy (wsparcie potwierdzone)</div>
  <div class="pr-test">Nx testowana, kazdy raz odbila z vol X; zlecenia kupna wchlanaja</div>
  <div class="pr-vol big">Xk+Xk</div>
  <div class="pr-status s-sup">&#11044; WSPARCIE SILNE &mdash; Nx odbi&#322;o</div>
</div> -->
</div>

<!-- ===== ROW 1 ===== -->
<div class="row1">

<!-- COL 1: VP HISTOGRAM -->
<div class="r1c1">
<div class="sh">VP Histogram Londyn (bar-po-bar M15)</div>
<div class="vp">

  <div class="vp-zone z-sell">&#9650; SELL / Dystrybucja &mdash; 4198&ndash;4202,24</div>
  <div class="vp-r hi"><div class="vp-lbl">4 202,24</div><div class="vp-bw"><div class="vp-b" style="background:#d83040;width:65px"></div></div><div class="vp-vol">8 129</div><span class="vp-tag thi">LDN HIGH</span></div>
  <div class="vp-r"><div class="vp-lbl">4 201,61</div><div class="vp-bw"><div class="vp-b" style="background:#d03848;width:69px"></div></div><div class="vp-vol">8 649</div><span class="vp-tag tsell">dist.</span></div>
  <div class="vp-r"><div class="vp-lbl">4 201,17</div><div class="vp-bw"><div class="vp-b" style="background:#c84050;width:80px"></div></div><div class="vp-vol">10 121</div><span class="vp-tag tsell">dist.</span></div>
  <div class="vp-r"><div class="vp-lbl">4 199,48</div><div class="vp-bw"><div class="vp-b" style="background:#c04858;width:64px"></div></div><div class="vp-vol">8 023</div></div>
  <div class="vp-sep"></div>

  <div class="vp-zone z-brk">&#9650; INST. BUY / Breakout &mdash; 4190&ndash;4198</div>
  <div class="vp-r"><div class="vp-lbl">4 197,92</div><div class="vp-bw"><div class="vp-b" style="background:#1080c8;width:96px"></div></div><div class="vp-vol">12 201</div><span class="vp-tag tinst">MAX VOL</span></div>
  <div class="vp-r"><div class="vp-lbl">4 198,85</div><div class="vp-bw"><div class="vp-b" style="background:#2078c8;width:66px"></div></div><div class="vp-vol">8 414</div></div>
  <div class="vp-r"><div class="vp-lbl">4 197,17</div><div class="vp-bw"><div class="vp-b" style="background:#1880c0;width:51px"></div></div><div class="vp-vol">6 403</div></div>
  <div class="vp-r"><div class="vp-lbl">4 196,70</div><div class="vp-bw"><div class="vp-b" style="background:#1888c0;width:78px"></div></div><div class="vp-vol">9 906</div></div>
  <div class="vp-r"><div class="vp-lbl">4 194,99</div><div class="vp-bw"><div class="vp-b" style="background:#2070c0;width:69px"></div></div><div class="vp-vol">8 735</div></div>
  <div class="vp-r"><div class="vp-lbl">4 194,85</div><div class="vp-bw"><div class="vp-b" style="background:#1878d0;width:84px"></div></div><div class="vp-vol">10 624</div><span class="vp-tag tbos">BOS!</span></div>
  <div class="vp-sep"></div>

  <div class="vp-zone z-eq">&#9654; PIVOT / Fib 0.500 &mdash; 4186&ndash;4192</div>
  <div class="vp-r"><div class="vp-lbl">4 190,83</div><div class="vp-bw"><div class="vp-b" style="background:#5068b0;width:84px"></div></div><div class="vp-vol">10 624</div></div>
  <div class="vp-r"><div class="vp-lbl">4 190,34</div><div class="vp-bw"><div class="vp-b" style="background:#4870a8;width:57px"></div></div><div class="vp-vol">7 217</div></div>
  <div class="vp-r"><div class="vp-lbl">4 187,87</div><div class="vp-bw"><div class="vp-b" style="background:#4078b0;width:69px"></div></div><div class="vp-vol">8 735</div></div>
  <div class="vp-r now"><div class="vp-lbl">4 185,68&#9733;</div><div class="vp-bw"><div class="vp-b" style="background:#787810;width:46px"></div></div><div class="vp-vol">cena</div><span class="vp-tag tnow">OTE</span></div>
  <div class="vp-sep"></div>

  <div class="vp-zone z-buy">&#9650; BUY ZONE / Wsparcie &mdash; 4179&ndash;4185</div>
  <div class="vp-r"><div class="vp-lbl">4 184,77</div><div class="vp-bw"><div class="vp-b" style="background:#10a060;width:69px"></div></div><div class="vp-vol">8 817</div><span class="vp-tag tbuy">Fib .618</span></div>
  <div class="vp-r"><div class="vp-lbl">4 184,21</div><div class="vp-bw"><div class="vp-b" style="background:#10a858;width:91px"></div></div><div class="vp-vol">11 578</div><span class="vp-tag tbuy">Ldn open!</span></div>
  <div class="vp-r"><div class="vp-lbl">4 183,11</div><div class="vp-bw"><div class="vp-b" style="background:#18a050;width:73px"></div></div><div class="vp-vol">9 204</div></div>
  <div class="vp-r"><div class="vp-lbl">4 181,06</div><div class="vp-bw"><div class="vp-b" style="background:#20a048;width:66px"></div></div><div class="vp-vol">8 367</div></div>
  <div class="vp-r lo"><div class="vp-lbl">4 173,97</div><div class="vp-bw"><div class="vp-b" style="background:#1070b8;width:51px"></div></div><div class="vp-vol">8 367</div><span class="vp-tag tlo">LDN LOW</span></div>
</div>
</div>

<!-- COL 2: FIBONACCI + CHRONOLOGIA -->
<div class="r1c2">
<div class="sh">Fibonacci: Ldn LOW &#8594; Ldn HIGH</div>
<div style="background:#f8f5e8;padding:4px 8px;font-size:8px;color:#806808;border-bottom:1px solid #d0c870;line-height:1.5">
  Pomiar: 4 173,97 (LOW) &rarr; 4 202,24 (HIGH) = 28,27 pkt
</div>
<div class="fb hi0"><div class="fb-l">0.000</div><div class="fb-p" style="color:#a85000;font-weight:900">4 202,24</div><div class="fb-n">Ldn HIGH / SELL</div></div>
<div class="fb"><div class="fb-l">0.236</div><div class="fb-p" style="color:#9050a0">4 195,57</div><div class="fb-n">Inst. BUY zone</div></div>
<div class="fb bosf"><div class="fb-l" style="color:#5020c0;font-weight:900">0.382 &#9654;</div><div class="fb-p" style="color:#5020c0;font-weight:900">4 191,44</div><div class="fb-n" style="color:#5020c0;font-weight:700">= BOS 4191,39!</div></div>
<div class="fb"><div class="fb-l">0.500</div><div class="fb-p" style="color:#4060a0">4 188,10</div><div class="fb-n">EQ pivot</div></div>
<div class="fb now"><div class="fb-l" style="color:#686808;font-weight:900">0.618 &#9654;</div><div class="fb-p">4 184,77</div><div class="fb-n" style="color:#686808;font-weight:700">&#9733; CENA 4185!</div></div>
<div class="fb ote"><div class="fb-l">0.786</div><div class="fb-p" style="color:#107038;font-weight:900">4 180,02</div><div class="fb-n" style="color:#107038">OTE BUY end</div></div>
<div class="fb lo0"><div class="fb-l">1.000</div><div class="fb-p" style="color:#1050b8;font-weight:900">4 173,97</div><div class="fb-n">Ldn LOW / hard support</div></div>

<div style="background:#e8f5f0;padding:5px 8px;font-size:8.5px;color:#187838;line-height:1.8;border-bottom:1px solid #c0d8c0;border-top:1px solid #c0d8c0;margin-top:1px">
  <b>OTE BUY strefa NY:</b> 4 180&ndash;4 185 (Fib 0.618&ndash;0.786)<br>
  + FVG 4 184,90 (z 29.09) + BOS 4 191,39 = 3&#215; confluence
</div>

<div class="sh" style="margin-top:3px">Chronologia sesji Londyn</div>
<div class="tl lo"><div class="tl-t">07:15</div><div class="tl-l">Ldn open &mdash; sweep Az LOW</div><div class="tl-p" style="color:#1060a8">L 4 173,97</div><div class="tl-v">8 367</div></div>
<div class="tl up"><div class="tl-t">07:30</div><div class="tl-l">Breakout Az HIGH 4181!</div><div class="tl-p" style="color:#107840">H 4 184,21</div><div class="tl-v">11 578!</div></div>
<div class="tl"><div class="tl-t">07:45</div><div class="tl-l">Konsolidacja 4178&ndash;4184</div><div class="tl-p">4 178&ndash;4 183</div><div class="tl-v">9 204</div></div>
<div class="tl bk"><div class="tl-t">08:15</div><div class="tl-l">BOS 4191,39 przebity!</div><div class="tl-p" style="color:#7010b0">H 4 194,85</div><div class="tl-v">10 624!</div></div>
<div class="tl bk"><div class="tl-t">08:30</div><div class="tl-l">Kontynuacja &mdash; MAX VOL</div><div class="tl-p" style="color:#7010b0">H 4 197,92</div><div class="tl-v">12 201!</div></div>
<div class="tl hi"><div class="tl-t">08:45</div><div class="tl-l">Pierwsze odrzucenie</div><div class="tl-p" style="color:#b84808">H 4 201,17</div><div class="tl-v">10 121</div></div>
<div class="tl"><div class="tl-t">09:00</div><div class="tl-l">Konsolidacja 4191&ndash;4197</div><div class="tl-p">4 191&ndash;4 197</div><div class="tl-v">6&ndash;10K</div></div>
<div class="tl hi"><div class="tl-t">09:30</div><div class="tl-l">Nowy HIGH 4201,61</div><div class="tl-p" style="color:#b84808">H 4 201,61</div><div class="tl-v">8 649</div></div>
<div class="tl hi"><div class="tl-t">09:45</div><div class="tl-l">&#9733; LDN HIGH / nowy CDH</div><div class="tl-p" style="color:#a84008">H 4 202,24</div><div class="tl-v">8 129</div></div>
<div class="tl"><div class="tl-t">10:00</div><div class="tl-l">Reversal &rarr; 4191,33</div><div class="tl-p" style="color:#b02030">L 4 191,33</div><div class="tl-v">8 023</div></div>
<div class="tl"><div class="tl-t">10:30</div><div class="tl-l">Pull-back 4187,87</div><div class="tl-p" style="color:#b02030">L 4 187,87</div><div class="tl-v">8 735</div></div>
<div class="tl"><div class="tl-t">11:00</div><div class="tl-l">G&#322;&#281;bszy pull-back</div><div class="tl-p" style="color:#b82030">L 4 183,06</div><div class="tl-v">7 217</div></div>
<div class="tl"><div class="tl-t">11:15</div><div class="tl-l">Odbicie H 4190,58</div><div class="tl-p" style="color:#107840">H 4 190,58</div><div class="tl-v">5 897</div></div>
<div class="tl nw"><div class="tl-t">11:30</div><div class="tl-l">&#9733; TERAZ &mdash; Fib 0.618 OTE</div><div class="tl-p" style="color:#686808">4 185,68</div><div class="tl-v">1 018</div></div>
</div>

<!-- COL 3: POZIOMY Z WSKAZNIKOW -->
<div class="r1c3">
<div class="sh">Kluczowe poziomy (VP + wska&#378;niki)</div>
<div class="lv hi"><div class="lv-n" style="color:#b84808;font-weight:700">LDN HIGH / Nowy CDH</div><div class="lv-p" style="color:#b84808">4 202,24</div><div class="lv-d cp">+17</div></div>
<div class="lv sell"><div class="lv-n" style="color:#c02030">SELL OB / Dystrybucja</div><div class="lv-p" style="color:#c02030">4 199&ndash;4 202</div><div class="lv-d cp">+14</div></div>
<div class="lv inst"><div class="lv-n" style="color:#1060a8;font-weight:700">Inst. BUY &mdash; max vol bar</div><div class="lv-p" style="color:#1060a8">4 197,92</div><div class="lv-d cp">+12</div></div>
<div class="lv inst"><div class="lv-n" style="color:#2070b8">Inst. BUY zone</div><div class="lv-p" style="color:#2070b8">4 190&ndash;4 198</div><div class="lv-d cp">+5&ndash;13</div></div>
<div class="lv bos"><div class="lv-n" style="color:#5020c0;font-weight:700">BOS (teraz wsparcie)</div><div class="lv-p" style="color:#5020c0">4 191,39</div><div class="lv-d cp">+6</div></div>
<div class="lv key"><div class="lv-n" style="color:#5828b0;font-weight:700">Fib 0.382 = BOS (confluence!)</div><div class="lv-p" style="color:#5020c0">4 191,44</div><div class="lv-d cp">+6</div></div>
<div class="lv key"><div class="lv-n">Fib 0.500 EQ pivot</div><div class="lv-p" style="color:#4060a0">4 188,10</div><div class="lv-d cp">+2</div></div>
<div class="lv now"><div class="lv-n" style="font-weight:700">&#9733; CENA / Fib 0.618 OTE</div><div class="lv-p" style="color:#686808">4 185,68</div><div class="lv-d cz">&mdash;</div></div>
<div class="lv buy"><div class="lv-n" style="color:#107040;font-weight:700">Fib 0.618 (OTE entry)</div><div class="lv-p" style="color:#107040">4 184,77</div><div class="lv-d cn">&minus;1</div></div>
<div class="lv fvg"><div class="lv-n" style="color:#8020c0;font-weight:700">FVG (29.09) &mdash; magnes</div><div class="lv-p" style="color:#8020c0">4 184,90</div><div class="lv-d cn">&minus;1</div></div>
<div class="lv buy"><div class="lv-n" style="color:#107040">Ldn open BUY vol (11K)</div><div class="lv-p" style="color:#107040">4 184,21</div><div class="lv-d cn">&minus;1</div></div>
<div class="lv buy"><div class="lv-n" style="color:#187040">Fib 0.786 (OTE koniec)</div><div class="lv-p" style="color:#187040">4 180,02</div><div class="lv-d cn">&minus;6</div></div>
<div class="lv lo"><div class="lv-n" style="color:#1060a8;font-weight:700">LDN LOW / hard support</div><div class="lv-p" style="color:#1060a8">4 173,97</div><div class="lv-d cn">&minus;12</div></div>
<div class="lv lo"><div class="lv-n" style="color:#1050a8">Az LOW sweep</div><div class="lv-p" style="color:#1050a8">4 165,63</div><div class="lv-d cn">&minus;20</div></div>

<div class="sh" style="margin-top:4px">Strefy VP zlece&#324; (podsumowanie)</div>
<div style="padding:6px 8px;font-size:8.5px;line-height:2;color:#304868">
  <div style="display:flex;gap:6px;align-items:baseline;padding:2px 0;border-bottom:1px solid #e0e8f0">
    <span style="background:#fde8e8;color:#901020;font-weight:700;padding:1px 6px;border-radius:2px;font-size:7.5px;min-width:60px;text-align:center">SELL ZONE</span>
    <span style="font-weight:700;font-family:Courier New,monospace">4 198&ndash;4 202,24</span>
    <span style="color:#7090a8;font-size:7.5px">~35K vol | dystrybucja</span>
  </div>
  <div style="display:flex;gap:6px;align-items:baseline;padding:2px 0;border-bottom:1px solid #e0e8f0">
    <span style="background:#ffe0ff;color:#8010a0;font-weight:700;padding:1px 6px;border-radius:2px;font-size:7.5px;min-width:60px;text-align:center">INST. BUY</span>
    <span style="font-weight:700;font-family:Courier New,monospace">4 190&ndash;4 198</span>
    <span style="color:#7090a8;font-size:7.5px">~43K vol | breakout OB</span>
  </div>
  <div style="display:flex;gap:6px;align-items:baseline;padding:2px 0;border-bottom:1px solid #e0e8f0">
    <span style="background:#eeeeff;color:#4020a0;font-weight:700;padding:1px 6px;border-radius:2px;font-size:7.5px;min-width:60px;text-align:center">PIVOT</span>
    <span style="font-weight:700;font-family:Courier New,monospace">4 186&ndash;4 192</span>
    <span style="color:#7090a8;font-size:7.5px">~27K vol | Fib 0.382&ndash;0.5</span>
  </div>
  <div style="display:flex;gap:6px;align-items:baseline;padding:2px 0;border-bottom:1px solid #e0e8f0">
    <span style="background:#e0f8ec;color:#107040;font-weight:700;padding:1px 6px;border-radius:2px;font-size:7.5px;min-width:60px;text-align:center">BUY OTE</span>
    <span style="font-weight:700;font-family:Courier New,monospace">4 180&ndash;4 185</span>
    <span style="color:#7090a8;font-size:7.5px">~37K vol | Fib 0.618&ndash;0.786</span>
  </div>
  <div style="display:flex;gap:6px;align-items:baseline;padding:2px 0">
    <span style="background:#e0eeff;color:#1060a8;font-weight:700;padding:1px 6px;border-radius:2px;font-size:7.5px;min-width:60px;text-align:center">SUPPORT</span>
    <span style="font-weight:700;font-family:Courier New,monospace">4 174&ndash;4 180</span>
    <span style="color:#7090a8;font-size:7.5px">~20K vol | Ldn LOW strefa</span>
  </div>
</div>
</div>

</div><!-- row1 -->

<!-- ===== ROW 2: SCENARIUSZE NY ===== -->
<div class="row2">
<div class="row2-hdr">&#127926; Scenariusze NY (13:00&ndash;21:00 UTC) &mdash; XAU/USD 30.09.2026</div>
<div class="sc-grid">

  <!-- SCENARIUSZ A -->
  <div class="sc sc-a">
    <div class="sc-ttl">
      <span class="sc-badge g-a">A &mdash; LONG</span>
      OTE pull-back &rarr; BUY z Fib 0.618
      <span class="rr">R:R &nbsp;1:3,5</span>
    </div>
    <div class="sc-trigger">
      &#9654; <b>Trigger M15:</b> BOS od strefy 4183&ndash;4185 z vol &gt;8K lub zamkni&#281;cie M15 nad 4188 (Fib 0.500)
    </div>
    <div class="sc-row"><span class="sc-lbl">Entry (Fib 0.618 / FVG)</span><span class="sc-val">4 184,77</span></div>
    <div class="sc-row"><span class="sc-lbl">Stop Loss (pod Fib 0.786)</span><span class="sc-val" style="color:#c01828">4 178,00</span></div>
    <div class="sc-sep"></div>
    <div class="sc-row"><span class="sc-lbl">TP 1 &mdash; BOS wsparcie</span><span class="sc-val" style="color:#107838">4 191,39</span></div>
    <div class="sc-row"><span class="sc-lbl">TP 2 &mdash; Inst. BUY max vol</span><span class="sc-val" style="color:#107838">4 197,92</span></div>
    <div class="sc-row"><span class="sc-lbl">TP 3 &mdash; Ldn HIGH retest</span><span class="sc-val" style="color:#107838">4 202,24</span></div>
    <div class="sc-note">
      Triple confluence: Fib 0.618 (4184,77) + FVG 29.09 (4184,90) + BOS 4191 jako S&rarr;R. Najsilniejsza strefa wej&#347;cia dnia.
      Vol recovery &gt;8K = sygna&#322; wej&#347;cia. Cena ju&#380; na OTE &mdash; przygotuj zlecenie.
    </div>
  </div>

  <!-- SCENARIUSZ B -->
  <div class="sc sc-b">
    <div class="sc-ttl">
      <span class="sc-badge g-b">B &mdash; SHORT</span>
      Ldn HIGH retest &rarr; SELL
      <span class="rr">R:R &nbsp;1:2,5</span>
    </div>
    <div class="sc-trigger">
      &#9654; <b>Trigger M15:</b> NY Judas pump ponad 4198 + CHoCH z vol dystrybucji &gt;8K
    </div>
    <div class="sc-row"><span class="sc-lbl">Entry (SELL OB retest)</span><span class="sc-val">4 200,00</span></div>
    <div class="sc-row"><span class="sc-lbl">Stop Loss (nad Ldn HIGH)</span><span class="sc-val" style="color:#c01828">4 204,00</span></div>
    <div class="sc-sep"></div>
    <div class="sc-row"><span class="sc-lbl">TP 1 &mdash; BOS wsparcie</span><span class="sc-val" style="color:#107838">4 191,44</span></div>
    <div class="sc-row"><span class="sc-lbl">TP 2 &mdash; Fib 0.500 EQ</span><span class="sc-val" style="color:#107838">4 188,10</span></div>
    <div class="sc-row"><span class="sc-lbl">TP 3 &mdash; OTE BUY zone</span><span class="sc-val" style="color:#107838">4 183,00</span></div>
    <div class="sc-note">
      NY Judas ponad CDH (4202) + vol dystrybucji = SHORT. BOS 4191 jako TP1. Wymaga prze&#322;amania struktury byczej.
      Ni&#380;sze prawdopodobie&#324;stwo w trendzie byczym D1.
    </div>
  </div>

  <!-- SCENARIUSZ C -->
  <div class="sc sc-c">
    <div class="sc-ttl">
      <span class="sc-badge g-c">C &mdash; KONTYNUACJA</span>
      Wybicie Ldn HIGH &rarr; 4210+
      <span class="rr">R:R &nbsp;1:2</span>
    </div>
    <div class="sc-trigger">
      &#9654; <b>Trigger M15:</b> Zamkni&#281;cie M15 nad 4202,24 z vol &gt;10K = wybicie CDH
    </div>
    <div class="sc-row"><span class="sc-lbl">Entry (po BOS Ldn HIGH)</span><span class="sc-val">4 203&ndash;4 205</span></div>
    <div class="sc-row"><span class="sc-lbl">Stop Loss (pod Ldn HIGH)</span><span class="sc-val" style="color:#c01828">4 197,00</span></div>
    <div class="sc-sep"></div>
    <div class="sc-row"><span class="sc-lbl">TP 1 &mdash; 4210 okr&#261;g&#322;y</span><span class="sc-val" style="color:#107838">4 210,00</span></div>
    <div class="sc-row"><span class="sc-lbl">TP 2 &mdash; Fib ext. 1.272</span><span class="sc-val" style="color:#107838">4 218,94</span></div>
    <div class="sc-row"><span class="sc-lbl">TP 3 &mdash; Fib ext. 1.618</span><span class="sc-val" style="color:#107838">4 229,73</span></div>
    <div class="sc-note">
      Struktura D1 bycza. Je&#347;li NY utrzyma Ldn HIGH = impuls do 4210&ndash;4220.
      Wymaga silnego vol na wybiciu. Brak nowego TP bez vol &gt;10K.
    </div>
  </div>

</div><!-- sc-grid -->
</div><!-- row2 -->

<!-- ===== ROW 3: WNIOSKI VP ===== -->
<div class="wn">
  <div class="wn-t">Wnioski VP &mdash; strefy zlece&#324; i rekomendacja</div>
  <div class="wn-grid">
    <ul class="wn-l">
      <li class="p"><b>BOS 4191,39 PRZEBITY</b> (vol 10 624 + 12 201) &mdash; historyczny poziom sta&#322; si&#281; wsparciem. Retesty ponad nim = bycze</li>
      <li class="g"><b>OTE LONG 4183&ndash;4185</b> (Fib 0.618 + FVG 4184,90): Najsilniejsza strefa. Entry dla NY. Cena JU&#379; na OTE</li>
    </ul>
    <ul class="wn-l">
      <li class="r"><b>SELL OB 4198&ndash;4202,24:</b> Ldn HIGH dystrybucja ~35K vol. NY Judas ponad CDH = SHORT trigger</li>
      <li><b>Fib 0.382 = 4191,44 = BOS 4191,39:</b> Idealne confluence &mdash; najwa&#380;niejszy pivot dnia. TP1 dla long&acirc;w</li>
    </ul>
    <ul class="wn-l">
      <li class="p"><b>Inst. BUY 4190&ndash;4198 (~43K vol):</b> Strefa breakoutu = wsparcie. Potwierdzenie byczego impulsu</li>
      <li class="g"><b>Preferencja: Scenariusz A (LONG OTE)</b> &mdash; pull-back 4183&ndash;4185 + BOS M15 od FVG = wej&#347;cie NY</li>
    </ul>
  </div>
</div>

<div class="foot">
  ICT / SMC &middot; London Session Volume Profile &middot; Trading Room Workshop &nbsp;|&nbsp;
  Ldn HIGH 4 202,24 &middot; Ldn LOW 4 173,97 &middot; Range 28,27 pkt &middot;
  SELL 4198&ndash;4202 (~35K) &middot; Inst. BUY 4190&ndash;4198 (~43K) &middot; OTE LONG 4183&ndash;4185 &middot;
  BOS 4191,39 (wsparcie) &middot; FVG 4184,90 &middot; Fib 0.618=4184,77
  &nbsp;|&nbsp; Wy&#322;&#261;cznie edukacja &mdash; nie doradztwo inwestycyjne
</div>

</div><!-- card-wrap -->
<script>document.getElementById('logo').src='LOGO_SRC';</script>
</body></html>
'@

$html = $html.Replace('LOGO_SRC', "data:image/jpeg;base64,$LogoB64")
[System.IO.File]::WriteAllText($HtmlPath, $html, [System.Text.Encoding]::UTF8)
Write-Host "HTML OK"

$Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $Chrome)) { $Chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }
$HtmlUri = "file:///" + $HtmlPath.Replace('\','/')
& $Chrome --headless=new --disable-gpu "--screenshot=$PngPath" --window-size=1200,3000 --hide-scrollbars "$HtmlUri" 2>$null
Start-Sleep -Seconds 5
if (-not (Test-Path $PngPath)) { throw "Chrome render failed" }
Write-Host "PNG OK"

Add-Type -AssemblyName System.Drawing
$bmp=[System.Drawing.Bitmap]::FromFile($PngPath)
$W=$bmp.Width;$H=$bmp.Height;$bottom=0
for($y=$H-1;$y -ge 0;$y--){
  $f=$false
  for($x=0;$x -lt $W -and -not $f;$x++){
    $px=$bmp.GetPixel($x,$y)
    if($px.R -gt 25 -or $px.G -gt 25 -or $px.B -gt 25){$bottom=$y;$f=$true}
  }
  if($f){break}
}
$cropH=[Math]::Min($bottom+24,$H)
$rect=[System.Drawing.Rectangle]::new(0,0,$W,$cropH)
$crop=$bmp.Clone($rect,$bmp.PixelFormat)
$bmp.Dispose();$crop.Save($CropPath,[System.Drawing.Imaging.ImageFormat]::Png);$crop.Dispose()
Write-Host "Crop: ${W}x${cropH}"
Write-Host "Gotowe: $CropPath"
