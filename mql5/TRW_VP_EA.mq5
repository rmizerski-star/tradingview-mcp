//+------------------------------------------------------------------+
//|                                                  TRW_VP_EA.mq5  |
//|              Trading Room Workshop - Volume Profile Signal Bot   |
//|                                                    v2.0          |
//+------------------------------------------------------------------+
//  Workflow:
//    1. Claude zapisuje analize VP do Common\Files\TRW_VP\signal.json
//    2. EA laduje strefe i czeka az cena wejdzie w zone entry
//    3. Gdy cena w strefie: sprawdza potwierdzenie (swieca + spread + wolumen)
//    4. Po potwierdzeniu: 3x Market Order (TP1/TP2/TP3)
//    5. Po zamknieciu TP1 -> SL na breakeven
//    6. Po zamknieciu TP2 -> trailing stop na TP3
//
//  Stan EA:
//    IDLE     -> brak sygnalu
//    WATCHING -> sygnal zaladowany, cena poza strefa
//    IN_ZONE  -> cena w strefie, czeka na potwierdzenie
//    FILLED   -> pozycje otwarte, zarzadzanie
//    DONE     -> zakonczono (OPENED/SKIPPED/ERROR)
//+------------------------------------------------------------------+
#property copyright "Trading Room Workshop"
#property version   "2.00"
#property description "VP Signal Bot v2: monitoruje strefe, wchodzi rynkowo po potwierdzeniu"

#include <Trade\Trade.mqh>

//--- Inputs
input group         "=== Plik sygnalu ==="
input string        InpSignalFolder    = "TRW_VP";    // Folder w Common\Files terminala
input int           InpPollSeconds     = 3;           // Co ile sekund sprawdzac plik (s)
input int           InpMaxSignalAgeMin = 120;         // Pomij sygnaly starsze niz X minut

input group         "=== Handel ==="
input double        InpLotPerPos       = 0.01;        // Lot NA POZYCJE (lacznie 3x)
input long          InpMagic           = 770003;      // Magic number VP bota
input string        InpSymbolSuffix    = "";          // Sufiks brokera (puste = autowykrywanie)
input int           InpSlippage        = 20;          // Slippage w punktach
input bool          InpDryRun          = false;       // Tryb testowy: loguj bez zlecen

input group         "=== Potwierdzenie wejscia ==="
input bool          InpRequireCandle   = true;        // Wymagaj swiecy potwierdzenia w strefie
input bool          InpRequireVolume   = false;       // Wymagaj wolumenu > InpVolMult x MA(20)
input double        InpVolMult         = 1.2;         // Krotnosc sredniej wolumenu
input int           InpMaxSpreadPts    = 40;          // Max spread w punktach (0 = bez limitu)
input int           InpZoneMaxBars     = 8;           // Maks. barow w strefie bez potwierdzenia

input group         "=== Zarzadzanie pozycja ==="
input bool          InpMoveSLtoBE      = true;        // Przesun SL na BE po TP1
input bool          InpTrailAfterTP2   = true;        // Trailing po TP2
input int           InpTrailStepPts    = 100;         // Krok trailingu w punktach

input group         "=== Telegram ==="
input bool          InpTgEnabled       = true;                    // Wysylaj powiadomienia Telegram
input string        InpTgChatId        = "-1003969670552";        // Chat ID
input int           InpTgThreadId      = 1885;                    // Thread ID (1885=XAU, 7=newsy)
input string        InpTgTokenFile     = "TRW_VP\\tg_token.txt"; // Plik z tokenem w Common\Files

input group         "=== Diagnostyka ==="
input bool          InpShowPanel       = true;
input bool          InpVerboseLog      = true;

//--- Stale
#define VP_EA_VERSION "2.0"
#define COMMENT_TP1   "TRW_VP_TP1"
#define COMMENT_TP2   "TRW_VP_TP2"
#define COMMENT_TP3   "TRW_VP_TP3"

//--- Stany EA
enum EVPState { STATE_IDLE, STATE_WATCHING, STATE_IN_ZONE, STATE_FILLED, STATE_DONE };

//--- Struktura sygnalu
struct SVPSignal
  {
   string   id;
   string   symbol;
   string   direction;
   double   entry_from;
   double   entry_to;
   double   sl;
   double   tp1;
   double   tp2;
   double   tp3;
   double   lot;
   string   comment;
   datetime expires;
   datetime sent_at;
  };

//--- Globals
CTrade      g_trade;
string      g_signalFile;
string      g_doneFile;
string      g_lastSignalId  = "";
EVPState    g_state         = STATE_IDLE;
string      g_tgToken       = "";
SVPSignal   g_sig;
string      g_brokerSym     = "";
bool        g_tp1Hit        = false;
bool        g_tp2Hit        = false;
int         g_openCount     = 0;
string      g_statusMsg     = "Oczekiwanie na sygnal...";
datetime    g_lastBarTime   = 0;
int         g_zoneBars      = 0;
datetime    g_zoneEntryTime = 0;
datetime    g_lastPoll      = 0;

//+------------------------------------------------------------------+
//| Init                                                             |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpLotPerPos <= 0) { Print("BLAD: InpLotPerPos musi byc > 0"); return(INIT_PARAMETERS_INCORRECT); }

   string folder = InpSignalFolder;
   StringTrimLeft(folder); StringTrimRight(folder);
   if(folder == "") folder = "TRW_VP";

   g_signalFile = folder + "\\signal.json";
   g_doneFile   = folder + "\\done.json";

   FolderCreate(folder, FILE_COMMON);

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpSlippage);
   g_trade.SetAsyncMode(false);
   g_trade.LogLevel(LOG_LEVEL_ERRORS);

   EventSetTimer(MathMax(1, InpPollSeconds));

   if(InpTgEnabled) LoadTgToken();

   PrintFormat("TRW VP EA v%s start | konto %I64d (%s) | lot %.2f x3 | magic %I64d%s",
               VP_EA_VERSION,
               AccountInfoInteger(ACCOUNT_LOGIN),
               AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO ? "DEMO" : "REAL",
               InpLotPerPos, InpMagic,
               InpDryRun ? " | TRYB TESTOWY" : "");

   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))
      Print("UWAGA: handel algorytmiczny wylaczony w terminalu!");

   PollSignal();
   ShowPanel();
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Deinit                                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
  }

//+------------------------------------------------------------------+
//| Timer — polling pliku i zarzadzanie                              |
//+------------------------------------------------------------------+
void OnTimer()
  {
   if(g_state == STATE_IDLE || g_state == STATE_DONE)
      PollSignal();

   ManagePositions();
   ShowPanel();
  }

//+------------------------------------------------------------------+
//| OnTick — monitorowanie strefy i decyzja o wejsciu               |
//+------------------------------------------------------------------+
void OnTick()
  {
   if(g_state == STATE_WATCHING || g_state == STATE_IN_ZONE)
      CheckZoneEntry();

   if(g_tp2Hit && InpTrailAfterTP2)
      TrailTP3Position();
  }

//+------------------------------------------------------------------+
//| Laduje sygnal z pliku jesli nowy                                 |
//+------------------------------------------------------------------+
void PollSignal()
  {
   if(!FileIsExist(g_signalFile, FILE_COMMON)) return;

   SVPSignal sig;
   if(!ReadSignal(g_signalFile, sig)) return;
   if(sig.id == g_lastSignalId) return;

   if(sig.expires > 0 && TimeCurrent() > sig.expires)
     {
      if(InpVerboseLog) PrintFormat("VP EA: sygnal %s przeterminowany - pomin", sig.id);
      g_lastSignalId = sig.id;
      WriteDone(sig, 0, "EXPIRED");
      return;
     }

   if(sig.sent_at > 0)
     {
      int ageMin = (int)((TimeCurrent() - sig.sent_at) / 60);
      if(ageMin > InpMaxSignalAgeMin)
        {
         if(InpVerboseLog) PrintFormat("VP EA: sygnal %s za stary (%d min) - pomin", sig.id, ageMin);
         g_lastSignalId = sig.id;
         WriteDone(sig, 0, "EXPIRED");
         return;
        }
     }

   string brokerSym = ResolveBrokerSymbol(sig.symbol);
   if(brokerSym == "")
     {
      PrintFormat("VP EA: symbol %s niedostepny - odrzucono", sig.symbol);
      g_lastSignalId = sig.id;
      WriteDone(sig, 0, "ERROR");
      return;
     }

   g_sig        = sig;
   g_brokerSym  = brokerSym;
   g_state      = STATE_WATCHING;
   g_zoneBars   = 0;
   g_lastBarTime = 0;
   g_tp1Hit     = false;
   g_tp2Hit     = false;

   PrintFormat("VP EA: sygnal zaladowany %s | %s %s | strefa %.2f-%.2f | SL %.2f | TP %.2f/%.2f/%.2f",
               sig.id, sig.symbol, sig.direction,
               sig.entry_from, sig.entry_to, sig.sl,
               sig.tp1, sig.tp2, sig.tp3);
   PrintFormat("VP EA: czekam az cena wejdzie w strefe %.2f-%.2f...", sig.entry_from, sig.entry_to);

   g_statusMsg = StringFormat("WATCHING: %s %.2f-%.2f", sig.direction, sig.entry_from, sig.entry_to);
   WriteDone(sig, 0, "WATCHING");

   // Powiadomienie #1: zlecenie ustawione, czekamy na stref
   string arrow  = (sig.direction == "SHORT") ? "🔴" : "🟢";
   string tgMsg1 = StringFormat(
     "%s <b>VP EA | %s %s</b>\n"
     "━━━━━━━━━━━━━━━━\n"
     "📍 Strefa: %.2f – %.2f\n"
     "🛑 SL: %.2f\n"
     "🎯 TP1: %.2f | TP2: %.2f | TP3: %.2f\n"
     "━━━━━━━━━━━━━━━━\n"
     "⏳ Czekam na wejscie ceny w strefe...\n"
     "<i>%s</i>",
     arrow, sig.direction, sig.symbol,
     sig.entry_from, sig.entry_to,
     sig.sl, sig.tp1, sig.tp2, sig.tp3,
     sig.comment);
   SendTelegram(tgMsg1);
  }

//+------------------------------------------------------------------+
//| Monitoruje cene i decyduje o wejsciu gdy cena w strefie          |
//+------------------------------------------------------------------+
void CheckZoneEntry()
  {
   if(g_brokerSym == "") return;

   bool   isLong = (g_sig.direction == "LONG");
   double bid    = SymbolInfoDouble(g_brokerSym, SYMBOL_BID);
   double ask    = SymbolInfoDouble(g_brokerSym, SYMBOL_ASK);
   double cur    = isLong ? ask : bid;

   // Wygasniecie
   if(g_sig.expires > 0 && TimeCurrent() > g_sig.expires)
     {
      PrintFormat("VP EA: sygnal %s wygasl w trakcie oczekiwania", g_sig.id);
      g_lastSignalId = g_sig.id;
      g_state        = STATE_DONE;
      g_statusMsg    = "EXPIRED";
      WriteDone(g_sig, cur, "EXPIRED");
      return;
     }

   bool inZone    = (cur >= g_sig.entry_from && cur <= g_sig.entry_to);
   // beyondZone: cena przeszla PRZEZ strefe bez potwierdzenia (zly kierunek)
   bool beyond    = isLong ? (ask < g_sig.entry_from) : (bid > g_sig.entry_to);

   if(beyond)
     {
      PrintFormat("VP EA: cena %.2f przebila strefe %.2f-%.2f - SKIPPED", cur, g_sig.entry_from, g_sig.entry_to);
      g_lastSignalId = g_sig.id;
      g_state        = STATE_DONE;
      g_statusMsg    = "SKIPPED - cena przebila strefe";
      WriteDone(g_sig, cur, "SKIPPED");
      return;
     }

   // Cena weszla w strefe
   if(inZone && g_state == STATE_WATCHING)
     {
      g_state        = STATE_IN_ZONE;
      g_zoneEntryTime = TimeCurrent();
      g_zoneBars     = 0;
      g_lastBarTime  = iTime(g_brokerSym, PERIOD_M15, 0);
      PrintFormat("VP EA: cena %.2f weszla w strefe %.2f-%.2f | czekam na potwierdzenie...",
                  cur, g_sig.entry_from, g_sig.entry_to);
      g_statusMsg = StringFormat("IN_ZONE: %.2f | czekam na swiece...", cur);
      return;
     }

   // Cena opuscila strefe bez potwierdzenia — wracamy do WATCHING
   if(!inZone && g_state == STATE_IN_ZONE)
     {
      g_state   = STATE_WATCHING;
      g_zoneBars = 0;
      if(InpVerboseLog)
         PrintFormat("VP EA: cena %.2f wyszla ze strefy - wracam do WATCHING", cur);
      g_statusMsg = StringFormat("WATCHING: %s %.2f-%.2f", g_sig.direction, g_sig.entry_from, g_sig.entry_to);
      return;
     }

   // Sprawdzamy potwierdzenie gdy IN_ZONE
   if(g_state == STATE_IN_ZONE)
     {
      // Wykryj nowy bar
      datetime curBarTime = iTime(g_brokerSym, PERIOD_M15, 0);
      bool     newBar     = (curBarTime != g_lastBarTime && g_lastBarTime != 0);

      if(newBar)
        {
         g_lastBarTime = curBarTime;
         g_zoneBars++;

         if(InpVerboseLog)
            PrintFormat("VP EA: nowy bar w strefie #%d | sprawdzam potwierdzenie...", g_zoneBars);

         // Przekroczono limit barow bez potwierdzenia — wejdz mimo braku swiecy
         if(g_zoneBars > InpZoneMaxBars)
           {
            PrintFormat("VP EA: %d barow w strefie bez potwierdzenia - wchodze rynkowo", g_zoneBars);
            TryEnterMarket();
            return;
           }
        }
      else if(g_lastBarTime == 0)
        {
         g_lastBarTime = curBarTime;
        }

      // Sprawdz spread
      if(!CheckSpread()) return;

      // Sprawdz potwierdzenie swiecy (ostatnia zamknieta M15)
      if(InpRequireCandle)
        {
         if(!CandleConfirms()) return;
        }

      // Sprawdz wolumen
      if(InpRequireVolume)
        {
         if(!VolumeConfirms()) return;
        }

      // Wszystkie warunki spelnione
      TryEnterMarket();
     }
  }

//+------------------------------------------------------------------+
//| Sprawdza spread                                                  |
//+------------------------------------------------------------------+
bool CheckSpread()
  {
   if(InpMaxSpreadPts <= 0) return true;
   long spread = SymbolInfoInteger(g_brokerSym, SYMBOL_SPREAD);
   if(spread > InpMaxSpreadPts)
     {
      if(InpVerboseLog) PrintFormat("VP EA: spread %d > max %d - czekam", spread, InpMaxSpreadPts);
      return false;
     }
   return true;
  }

//+------------------------------------------------------------------+
//| Sprawdza potwierdzenie swiecowe (ostatnia zamknieta M15)         |
//+------------------------------------------------------------------+
bool CandleConfirms()
  {
   bool isLong = (g_sig.direction == "LONG");
   // Ostatnia zamknieta swieca (index 1)
   double prevOpen  = iOpen(g_brokerSym,  PERIOD_M15, 1);
   double prevClose = iClose(g_brokerSym, PERIOD_M15, 1);
   double prevHigh  = iHigh(g_brokerSym,  PERIOD_M15, 1);
   double prevLow   = iLow(g_brokerSym,   PERIOD_M15, 1);

   if(prevOpen == 0 || prevClose == 0) return false;

   bool bearish = (prevClose < prevOpen);
   bool bullish = (prevClose > prevOpen);

   // Swieca musi byc kierunkowa
   bool ok = isLong ? bullish : bearish;

   // Przynajmniej czen gorny (SHORT) lub dolny (LONG) musi byc w strefie
   bool touchZone = isLong
      ? (prevLow >= g_sig.entry_from && prevLow <= g_sig.entry_to)
      : (prevHigh >= g_sig.entry_from && prevHigh <= g_sig.entry_to);

   if(!ok)
     {
      if(InpVerboseLog)
         PrintFormat("VP EA: swieca %.2f->%.2f nie potwierdza %s - czekam", prevOpen, prevClose, g_sig.direction);
      return false;
     }

   if(InpVerboseLog)
      PrintFormat("VP EA: potwierdzenie swiecowe OK | O=%.2f C=%.2f %s",
                  prevOpen, prevClose, isLong ? "BULLISH" : "BEARISH");
   return true;
  }

//+------------------------------------------------------------------+
//| Sprawdza wolumen                                                 |
//+------------------------------------------------------------------+
bool VolumeConfirms()
  {
   long vol = iVolume(g_brokerSym, PERIOD_M15, 1);
   if(vol <= 0) return true;  // brak danych = przepusc

   // Srednia wolumenu z ostatnich 20 barow (od bar 2 do 21)
   long sumVol = 0;
   int  count  = 0;
   for(int i = 2; i <= 21; i++)
     {
      long v = iVolume(g_brokerSym, PERIOD_M15, i);
      if(v > 0) { sumVol += v; count++; }
     }
   if(count == 0) return true;

   double avgVol = (double)sumVol / count;
   double minVol = avgVol * InpVolMult;

   if((double)vol < minVol)
     {
      if(InpVerboseLog)
         PrintFormat("VP EA: wolumen %I64d < min %.0f (%.1fx avg) - czekam", vol, minVol, InpVolMult);
      return false;
     }

   if(InpVerboseLog)
      PrintFormat("VP EA: wolumen OK: %I64d >= %.0f (%.1fx)", vol, minVol, InpVolMult);
   return true;
  }

//+------------------------------------------------------------------+
//| Otwiera 3 pozycje rynkowe (Market Order)                        |
//+------------------------------------------------------------------+
void TryEnterMarket()
  {
   bool isLong = (g_sig.direction == "LONG");
   double lot  = g_sig.lot > 0 ? g_sig.lot : InpLotPerPos;

   if(InpDryRun)
     {
      double cur = isLong ? SymbolInfoDouble(g_brokerSym, SYMBOL_ASK) : SymbolInfoDouble(g_brokerSym, SYMBOL_BID);
      PrintFormat("TRYB TESTOWY: wejscie %s @ %.2f SL %.2f TP1 %.2f TP2 %.2f TP3 %.2f",
                  g_sig.direction, cur, g_sig.sl, g_sig.tp1, g_sig.tp2, g_sig.tp3);
      g_lastSignalId = g_sig.id;
      g_state        = STATE_DONE;
      g_statusMsg    = "TRYB TESTOWY - wejscie zalogowane";
      WriteDone(g_sig, cur, "DRYRUN");
      return;
     }

   double tps[3]     = {g_sig.tp1, g_sig.tp2, g_sig.tp3};
   string cmts[3]    = {COMMENT_TP1, COMMENT_TP2, COMMENT_TP3};
   int    opened     = 0;
   double entryPrice = 0;

   for(int i = 0; i < 3; i++)
     {
      if(tps[i] <= 0) continue;

      bool res = isLong
         ? g_trade.Buy(lot, g_brokerSym, 0, g_sig.sl, tps[i], cmts[i])
         : g_trade.Sell(lot, g_brokerSym, 0, g_sig.sl, tps[i], cmts[i]);

      if(res)
        {
         opened++;
         if(entryPrice == 0) entryPrice = g_trade.ResultPrice();
         PrintFormat("VP EA: otwarto pozycja %d (%s) @ %.2f TP %.2f ticket %I64d",
                     i+1, cmts[i], g_trade.ResultPrice(), tps[i], g_trade.ResultOrder());
        }
      else
        {
         PrintFormat("VP EA: BLAD pozycja %d (%s) kod %d: %s",
                     i+1, cmts[i], g_trade.ResultRetcode(), g_trade.ResultComment());
        }
     }

   g_lastSignalId = g_sig.id;

   if(opened > 0)
     {
      g_openCount = opened;
      g_state     = STATE_FILLED;
      g_statusMsg = StringFormat("FILLED: %s @ %.2f | %d/3 otwartych", g_sig.direction, entryPrice, opened);
      PrintFormat("VP EA: wejscie potwierdzone | %d/3 pozycji @ %.2f", opened, entryPrice);
      WriteDone(g_sig, entryPrice, "OPENED");

      // Powiadomienie #2: transakcja otwarta
      double slPts = MathAbs(entryPrice - g_sig.sl);
      double tp3Pts = (g_sig.tp3 > 0) ? MathAbs(g_sig.tp3 - entryPrice) : MathAbs(g_sig.tp1 - entryPrice);
      double rr    = (slPts > 0) ? tp3Pts / slPts : 0;
      string arrow2 = (g_sig.direction == "SHORT") ? "🔴" : "🟢";
      string tgMsg2 = StringFormat(
        "✅ <b>VP EA | OTWARTO %s %s</b>\n"
        "━━━━━━━━━━━━━━━━\n"
        "💰 Entry: %.2f (rynek)\n"
        "📦 Lot: %dx%.2f\n"
        "🛑 SL: %.2f\n"
        "🎯 TP1: %.2f | TP2: %.2f | TP3: %.2f\n"
        "📊 R:R 1:%.1f\n"
        "━━━━━━━━━━━━━━━━\n"
        "<i>Potwierdzenie: swieca M15 + spread OK</i>",
        arrow2, g_sig.symbol,
        entryPrice,
        opened, g_sig.lot,
        g_sig.sl,
        g_sig.tp1, g_sig.tp2, g_sig.tp3,
        rr);
      SendTelegram(tgMsg2);
     }
   else
     {
      g_state     = STATE_DONE;
      g_statusMsg = "BLAD otwarcia pozycji";
      WriteDone(g_sig, 0, "ERROR");
     }
  }

//+------------------------------------------------------------------+
//| Zarzadza pozycjami: SL na BE po TP1, trailing po TP2            |
//+------------------------------------------------------------------+
void ManagePositions()
  {
   int tp1Count = 0, tp2Count = 0, tp3Count = 0;

   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      string cmt = PositionGetString(POSITION_COMMENT);
      if(StringFind(cmt, COMMENT_TP1) >= 0) tp1Count++;
      if(StringFind(cmt, COMMENT_TP2) >= 0) tp2Count++;
      if(StringFind(cmt, COMMENT_TP3) >= 0) tp3Count++;
     }

   if(!g_tp1Hit && tp1Count == 0 && (tp2Count > 0 || tp3Count > 0))
     {
      g_tp1Hit = true;
      PrintFormat("VP EA: TP1 zamkniety! Przesuwam SL na BE.");
      if(InpMoveSLtoBE) MoveSLtoBE();
     }

   if(g_tp1Hit && !g_tp2Hit && tp2Count == 0 && tp3Count > 0)
     {
      g_tp2Hit = true;
      PrintFormat("VP EA: TP2 zamkniety! Wlaczam trailing na TP3.");
     }

   if(tp1Count == 0 && tp2Count == 0 && tp3Count == 0 && g_state == STATE_FILLED)
     {
      g_tp1Hit    = false;
      g_tp2Hit    = false;
      g_state     = STATE_DONE;
      g_statusMsg = "Wszystkie pozycje zamkniete";
      PrintFormat("VP EA: wszystkie pozycje zamkniete.");
      SendTelegramSummary();
     }
  }

//+------------------------------------------------------------------+
//| Przesun SL na breakeven dla TP2 i TP3                           |
//+------------------------------------------------------------------+
void MoveSLtoBE()
  {
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      string cmt = PositionGetString(POSITION_COMMENT);
      if(StringFind(cmt, COMMENT_TP1) >= 0) continue;

      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double curSL     = PositionGetDouble(POSITION_SL);
      double curTP     = PositionGetDouble(POSITION_TP);
      long   type      = PositionGetInteger(POSITION_TYPE);
      ulong  ticket    = PositionGetInteger(POSITION_TICKET);

      bool isBetter = (type == POSITION_TYPE_BUY)  ? (openPrice > curSL) :
                      (type == POSITION_TYPE_SELL) ? (openPrice < curSL) : false;
      if(!isBetter) continue;

      if(g_trade.PositionModify(ticket, openPrice, curTP))
         PrintFormat("VP EA: SL na BE dla #%I64d (%.2f)", ticket, openPrice);
      else
         PrintFormat("VP EA: BLAD modyfikacji BE #%I64d: %s", ticket, g_trade.ResultComment());
     }
  }

//+------------------------------------------------------------------+
//| Trailing stop dla pozycji TP3                                    |
//+------------------------------------------------------------------+
void TrailTP3Position()
  {
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      string cmt = PositionGetString(POSITION_COMMENT);
      if(StringFind(cmt, COMMENT_TP3) < 0) continue;

      long   type   = PositionGetInteger(POSITION_TYPE);
      string sym    = PositionGetString(POSITION_SYMBOL);
      double curSL  = PositionGetDouble(POSITION_SL);
      double curTP  = PositionGetDouble(POSITION_TP);
      ulong  ticket = PositionGetInteger(POSITION_TICKET);
      double point  = SymbolInfoDouble(sym, SYMBOL_POINT);
      double step   = InpTrailStepPts * point;
      double bid    = SymbolInfoDouble(sym, SYMBOL_BID);
      double ask    = SymbolInfoDouble(sym, SYMBOL_ASK);

      double newSL;
      if(type == POSITION_TYPE_BUY)
        { newSL = bid - step; if(newSL <= curSL) continue; }
      else
        { newSL = ask + step; if(newSL >= curSL) continue; }

      if(g_trade.PositionModify(ticket, newSL, curTP))
         PrintFormat("VP EA: Trailing SL -> %.2f dla #%I64d", newSL, ticket);
     }
  }

//+------------------------------------------------------------------+
//| Wykrywa symbol z sufiksem brokera                                |
//+------------------------------------------------------------------+
string ResolveBrokerSymbol(string base)
  {
   if(InpSymbolSuffix != "")
     {
      string full = base + InpSymbolSuffix;
      if(SymbolSelect(full, true)) return full;
     }
   if(SymbolSelect(base, true)) return base;

   int total = SymbolsTotal(false);
   for(int i = 0; i < total; i++)
     {
      string s = SymbolName(i, false);
      if(StringFind(s, base) >= 0)
        {
         PrintFormat("VP EA: symbol %s -> %s", base, s);
         if(SymbolSelect(s, true)) return s;
        }
     }
   return "";
  }

//+------------------------------------------------------------------+
//| Parsuje signal.json                                              |
//+------------------------------------------------------------------+
bool ReadSignal(string filename, SVPSignal &sig)
  {
   int handle = FileOpen(filename, FILE_READ|FILE_TXT|FILE_COMMON|FILE_ANSI, '\0', CP_UTF8);
   if(handle == INVALID_HANDLE) return false;

   string json = "";
   while(!FileIsEnding(handle)) json += FileReadString(handle);
   FileClose(handle);
   if(StringLen(json) < 10) return false;

   sig.id         = JsonGetStr(json, "id");
   sig.symbol     = JsonGetStr(json, "symbol");
   sig.direction  = JsonGetStr(json, "direction");
   sig.entry_from = JsonGetDbl(json, "entry_from");
   sig.entry_to   = JsonGetDbl(json, "entry_to");
   sig.sl         = JsonGetDbl(json, "sl");
   sig.tp1        = JsonGetDbl(json, "tp1");
   sig.tp2        = JsonGetDbl(json, "tp2");
   sig.tp3        = JsonGetDbl(json, "tp3");
   sig.lot        = JsonGetDbl(json, "lot");
   sig.comment    = JsonGetStr(json, "comment");

   string expiresStr = JsonGetStr(json, "expires_utc");
   string sentStr    = JsonGetStr(json, "sent_at");
   sig.expires  = expiresStr != "" ? ParseISO8601(expiresStr) : 0;
   sig.sent_at  = sentStr    != "" ? ParseISO8601(sentStr)    : 0;

   if(sig.id == "" || sig.symbol == "" || sig.direction == "") return false;
   return true;
  }

//+------------------------------------------------------------------+
string JsonGetStr(string json, string key)
  {
   string search = "\"" + key + "\"";
   int pos = StringFind(json, search);
   if(pos < 0) return "";
   pos = StringFind(json, ":", pos) + 1;
   while(pos < StringLen(json) && StringGetCharacter(json, pos) == ' ') pos++;
   if(StringGetCharacter(json, pos) != '"') return "";
   pos++;
   int end = StringFind(json, "\"", pos);
   if(end < 0) return "";
   return StringSubstr(json, pos, end-pos);
  }

//+------------------------------------------------------------------+
double JsonGetDbl(string json, string key)
  {
   string search = "\"" + key + "\"";
   int pos = StringFind(json, search);
   if(pos < 0) return 0;
   pos = StringFind(json, ":", pos) + 1;
   while(pos < StringLen(json) && StringGetCharacter(json, pos) == ' ') pos++;
   string num = "";
   while(pos < StringLen(json))
     {
      ushort c = StringGetCharacter(json, pos);
      if((c >= '0' && c <= '9') || c == '.' || c == '-') { num += ShortToString(c); pos++; }
      else break;
     }
   return num != "" ? StringToDouble(num) : 0;
  }

//+------------------------------------------------------------------+
datetime ParseISO8601(string s)
  {
   if(StringLen(s) < 19) return 0;
   int year  = (int)StringToInteger(StringSubstr(s, 0, 4));
   int month = (int)StringToInteger(StringSubstr(s, 5, 2));
   int day   = (int)StringToInteger(StringSubstr(s, 8, 2));
   int hour  = (int)StringToInteger(StringSubstr(s, 11, 2));
   int min   = (int)StringToInteger(StringSubstr(s, 14, 2));
   int sec   = (int)StringToInteger(StringSubstr(s, 17, 2));
   MqlDateTime mdt = {};
   mdt.year = year; mdt.mon = month; mdt.day = day;
   mdt.hour = hour; mdt.min = min; mdt.sec = sec;
   return StructToTime(mdt);
  }

//+------------------------------------------------------------------+
void WriteDone(const SVPSignal &sig, double entryPrice, string status)
  {
   int handle = FileOpen(g_doneFile, FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(handle == INVALID_HANDLE) return;
   string body = StringFormat(
     "{\"id\":\"%s\",\"status\":\"%s\",\"entry_executed\":%.2f,\"account\":%I64d,\"time\":\"%s\"}",
     sig.id, status, entryPrice,
     AccountInfoInteger(ACCOUNT_LOGIN),
     TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS));
   FileWriteString(handle, body);
   FileClose(handle);
  }

//+------------------------------------------------------------------+
//+------------------------------------------------------------------+
//| Wczytuje token Telegram z pliku Common\Files\TRW_VP\tg_token.txt|
//+------------------------------------------------------------------+
void LoadTgToken()
  {
   g_tgToken = "";
   if(!FileIsExist(InpTgTokenFile, FILE_COMMON))
     {
      Print("VP EA Telegram: brak pliku tokenu ", InpTgTokenFile, " - powiadomienia wylaczone");
      return;
     }
   int h = FileOpen(InpTgTokenFile, FILE_READ|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(h == INVALID_HANDLE) return;
   string tok = "";
   while(!FileIsEnding(h)) tok += FileReadString(h);
   FileClose(h);
   StringTrimLeft(tok); StringTrimRight(tok);
   if(StringLen(tok) > 10)
     {
      g_tgToken = tok;
      Print("VP EA Telegram: token zaladowany OK");
     }
  }

//+------------------------------------------------------------------+
//| Wysyla wiadomosc na Telegram (HTML)                              |
//| WYMAGA: Tools -> Options -> Expert Advisors -> Allow WebRequest  |
//| URL: https://api.telegram.org                                    |
//+------------------------------------------------------------------+
void SendTelegram(string text)
  {
   if(!InpTgEnabled || g_tgToken == "") return;

   // Escapuj cudzyslowy w tekscie
   StringReplace(text, "\"", "'");

   string url  = "https://api.telegram.org/bot" + g_tgToken + "/sendMessage";
   string body = StringFormat(
     "{\"chat_id\":\"%s\",\"message_thread_id\":%d,\"text\":\"%s\",\"parse_mode\":\"HTML\"}",
     InpTgChatId, InpTgThreadId, text);

   char   post[], result[];
   string respHeaders;
   StringToCharArray(body, post, 0, StringLen(body));

   ResetLastError();
   int res = WebRequest("POST", url, "Content-Type: application/json\r\n",
                        5000, post, result, respHeaders);
   if(res == -1)
      PrintFormat("VP EA Telegram: blad WebRequest kod %d (dodaj URL w opcjach MT5)", GetLastError());
   else if(InpVerboseLog)
      PrintFormat("VP EA Telegram: wyslano OK (%d bajtow)", ArraySize(result));
  }

//+------------------------------------------------------------------+
//| Wysyla podsumowanie po zamknieciu wszystkich pozycji             |
//+------------------------------------------------------------------+
void SendTelegramSummary()
  {
   if(!InpTgEnabled || g_tgToken == "") return;

   double totalProfit = 0;
   double totalSwap   = 0;
   bool   tp1ok = false, tp2ok = false, tp3ok = false;
   int    dealCount = 0;

   // Szukamy transakcji zamknietych przez tego EA
   datetime from = (g_zoneEntryTime > 0) ? g_zoneEntryTime - 3600 : TimeCurrent() - 86400;
   HistorySelect(from, TimeCurrent() + 60);

   for(int i = HistoryDealsTotal()-1; i >= 0; i--)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(ticket, DEAL_MAGIC) != InpMagic) continue;
      if(HistoryDealGetInteger(ticket, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;

      totalProfit += HistoryDealGetDouble(ticket, DEAL_PROFIT);
      totalSwap   += HistoryDealGetDouble(ticket, DEAL_SWAP);
      dealCount++;

      string cmt = HistoryDealGetString(ticket, DEAL_COMMENT);
      if(StringFind(cmt, COMMENT_TP1) >= 0) tp1ok = true;
      if(StringFind(cmt, COMMENT_TP2) >= 0) tp2ok = true;
      if(StringFind(cmt, COMMENT_TP3) >= 0) tp3ok = true;
     }

   string resultIcon = (totalProfit + totalSwap >= 0) ? "✅" : "❌";
   string tp1str = tp1ok ? "✅" : "❌";
   string tp2str = tp2ok ? "✅" : "❌";
   string tp3str = tp3ok ? "✅" : "❌";

   string tgMsg3 = StringFormat(
     "%s <b>VP EA | PODSUMOWANIE %s %s</b>\n"
     "━━━━━━━━━━━━━━━━\n"
     "💵 Wynik: %+.2f USD\n"
     "🎯 TP1: %s | TP2: %s | TP3: %s\n"
     "📦 Pozycje: %d zamknietych\n"
     "━━━━━━━━━━━━━━━━\n"
     "<i>Magic: %I64d | Konto: %I64d</i>",
     resultIcon, g_sig.direction, g_sig.symbol,
     totalProfit + totalSwap,
     tp1str, tp2str, tp3str,
     dealCount,
     InpMagic, AccountInfoInteger(ACCOUNT_LOGIN));

   SendTelegram(tgMsg3);
  }

//+------------------------------------------------------------------+
void ShowPanel()
  {
   if(!InpShowPanel) return;

   int tp1c=0, tp2c=0, tp3c=0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      string cmt = PositionGetString(POSITION_COMMENT);
      if(StringFind(cmt, COMMENT_TP1) >= 0) tp1c++;
      if(StringFind(cmt, COMMENT_TP2) >= 0) tp2c++;
      if(StringFind(cmt, COMMENT_TP3) >= 0) tp3c++;
     }

   string stateStr;
   switch(g_state)
     {
      case STATE_IDLE:     stateStr = "IDLE";     break;
      case STATE_WATCHING: stateStr = "WATCHING"; break;
      case STATE_IN_ZONE:  stateStr = StringFormat("IN_ZONE (%d bar)", g_zoneBars); break;
      case STATE_FILLED:   stateStr = "FILLED";   break;
      case STATE_DONE:     stateStr = "DONE";     break;
      default:             stateStr = "?";
     }

   string panel = StringFormat(
     "TRW VP EA v%s | Magic %I64d%s\n"
     "Sygnal: %s\n"
     "Stan: %s\n"
     "Pozycje: TP1=%d TP2=%d TP3=%d\n"
     "Status: %s\n"
     "TP1 hit: %s | TP2 hit: %s",
     VP_EA_VERSION, InpMagic, InpDryRun ? " [TRYB TESTOWY]" : "",
     g_lastSignalId != "" ? g_lastSignalId : "brak",
     stateStr,
     tp1c, tp2c, tp3c,
     g_statusMsg,
     g_tp1Hit ? "TAK" : "nie",
     g_tp2Hit ? "TAK" : "nie");

   Comment(panel);
  }
//+------------------------------------------------------------------+
