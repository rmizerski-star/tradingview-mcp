//+------------------------------------------------------------------+
//|                                                  TRW_VP_EA.mq5  |
//|              Trading Room Workshop - Volume Profile Signal Bot   |
//|                                                    v3.0          |
//+------------------------------------------------------------------+
//  v3.0: 2 sloty SHORT+LONG jednoczesnie, auto-reload nowego ID
//
//  Sloty:
//    slot 0 (magic InpMagic+0) — SHORT (lub pierwszy sygnal)
//    slot 1 (magic InpMagic+1) — LONG  (lub drugi sygnal)
//
//  signal.json moze byc:
//    { "direction":"SHORT", ... }                       — 1 sygnal
//    [ { "direction":"SHORT", ... }, { ... } ]          — 2 sygnaly
//
//  Auto-reload: nowe ID w pliku -> reset slotu (chyba ze FILLED)
//+------------------------------------------------------------------+
#property copyright "Trading Room Workshop"
#property version   "3.00"
#property description "VP Signal Bot v3: 2 sloty SHORT+LONG, auto-reload"

#include <Trade\Trade.mqh>

//--- Inputs
input group         "=== Plik sygnalu ==="
input string        InpSignalFolder    = "TRW_VP";
input int           InpPollSeconds     = 3;
input int           InpMaxSignalAgeMin = 120;

input group         "=== Handel ==="
input double        InpLotPerPos       = 0.01;
input long          InpMagic           = 770003;   // slot0=770003, slot1=770004
input string        InpSymbolSuffix    = "";
input int           InpSlippage        = 20;
input bool          InpDryRun          = false;

input group         "=== Potwierdzenie wejscia ==="
input bool          InpCandleM15       = true;
input bool          InpCandleM5        = false;
input bool          InpCandleM3        = false;
input bool          InpRequireVolume   = false;
input double        InpVolMult         = 1.2;
input int           InpMaxSpreadPts    = 40;
input int           InpZoneMaxBars     = 8;

input group         "=== Zarzadzanie pozycja ==="
input bool          InpMoveSLtoBE      = true;
input bool          InpTrailAfterTP2   = true;
input int           InpTrailStepPts    = 100;

input group         "=== Telegram ==="
input bool          InpTgEnabled       = true;
input string        InpTgChatId        = "-1003969670552";
input int           InpTgThreadId      = 1885;
input string        InpTgTokenFile     = "TRW_VP\\tg_token.txt";

input group         "=== Diagnostyka ==="
input bool          InpShowPanel       = true;
input bool          InpVerboseLog      = true;

//--- Stale
#define VP_EA_VERSION "3.0"
#define COMMENT_TP1   "TRW_VP_TP1"
#define COMMENT_TP2   "TRW_VP_TP2"
#define COMMENT_TP3   "TRW_VP_TP3"
#define MAX_SLOTS     2

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

//--- Slot = sygnal + stan
struct SVPSlot
  {
   SVPSignal sig;
   EVPState  state;
   bool      tp1Hit;
   bool      tp2Hit;
   datetime  lastBarTime;
   int       zoneBars;
   datetime  zoneEntryTime;
   string    brokerSym;
   long      magic;
   string    statusMsg;
   string    statusCode;   // WATCHING/OPENED/SKIPPED/EXPIRED/ERROR/DRYRUN
  };

//--- Globals
CTrade   g_trade;
SVPSlot  g_slots[MAX_SLOTS];
string   g_signalFile;
string   g_doneFile;
string   g_tgToken = "";

//+------------------------------------------------------------------+
void InitSlot(int idx)
  {
   g_slots[idx].state         = STATE_IDLE;
   g_slots[idx].tp1Hit        = false;
   g_slots[idx].tp2Hit        = false;
   g_slots[idx].lastBarTime   = 0;
   g_slots[idx].zoneBars      = 0;
   g_slots[idx].zoneEntryTime = 0;
   g_slots[idx].brokerSym     = "";
   g_slots[idx].magic         = InpMagic + idx;
   g_slots[idx].statusMsg     = "Oczekiwanie...";
   g_slots[idx].statusCode    = "IDLE";
   g_slots[idx].sig.id        = "";
   g_slots[idx].sig.direction = "";
   g_slots[idx].sig.symbol    = "";
  }

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

   g_trade.SetDeviationInPoints(InpSlippage);
   g_trade.SetAsyncMode(false);
   g_trade.LogLevel(LOG_LEVEL_ERRORS);

   for(int i = 0; i < MAX_SLOTS; i++) InitSlot(i);

   EventSetTimer(MathMax(1, InpPollSeconds));

   if(InpTgEnabled) LoadTgToken();

   PrintFormat("TRW VP EA v%s start | konto %I64d | lot %.2f x3 | magic %I64d-%I64d%s",
               VP_EA_VERSION,
               AccountInfoInteger(ACCOUNT_LOGIN),
               InpLotPerPos, InpMagic, InpMagic + MAX_SLOTS - 1,
               InpDryRun ? " | TRYB TESTOWY" : "");

   PollSignals();
   ShowPanel();
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
  }

//+------------------------------------------------------------------+
void OnTimer()
  {
   PollSignals();
   for(int i = 0; i < MAX_SLOTS; i++) ManagePositions(i);
   ShowPanel();
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   for(int i = 0; i < MAX_SLOTS; i++)
     {
      EVPState s = g_slots[i].state;
      if(s == STATE_WATCHING || s == STATE_IN_ZONE)
         CheckZoneEntry(i);
     }
   for(int i = 0; i < MAX_SLOTS; i++)
      if(g_slots[i].tp2Hit && InpTrailAfterTP2)
         TrailTP3Position(i);
  }

//+------------------------------------------------------------------+
//| Czyta signal.json i aktualizuje sloty                            |
//+------------------------------------------------------------------+
void PollSignals()
  {
   if(!FileIsExist(g_signalFile, FILE_COMMON)) return;

   SVPSignal sigs[MAX_SLOTS];
   int count = ReadSignals(g_signalFile, sigs);
   if(count <= 0) return;

   for(int i = 0; i < count && i < MAX_SLOTS; i++)
     {
      // SHORT -> slot 0, LONG -> slot 1
      int idx = (sigs[i].direction == "LONG") ? 1 : 0;
      LoadSignalToSlot(idx, sigs[i]);
     }
  }

//+------------------------------------------------------------------+
//| Laduje sygnal do slotu — auto-reload jesli nowe ID               |
//+------------------------------------------------------------------+
void LoadSignalToSlot(int idx, SVPSignal &sig)
  {
   SVPSlot *sl = GetPointer(g_slots[idx]);

   if(sig.id == sl.sig.id) return;  // ten sam sygnal, ignoruj

   // Pozycje otwarte — nie resetuj
   if(sl.state == STATE_FILLED)
     {
      if(InpVerboseLog)
         PrintFormat("VP EA[%d]: slot FILLED — nowy sygnal %s ignorowany", idx, sig.id);
      return;
     }

   // Walidacja terminu
   if(sig.expires > 0 && TimeCurrent() > sig.expires)
     {
      PrintFormat("VP EA[%d]: sygnal %s przeterminowany", idx, sig.id);
      sl.sig        = sig;
      sl.state      = STATE_DONE;
      sl.statusCode = "EXPIRED";
      sl.statusMsg  = "EXPIRED";
      WriteDone();
      return;
     }

   if(sig.sent_at > 0)
     {
      int ageMin = (int)((TimeCurrent() - sig.sent_at) / 60);
      if(ageMin > InpMaxSignalAgeMin)
        {
         PrintFormat("VP EA[%d]: sygnal %s za stary (%d min)", idx, sig.id, ageMin);
         sl.sig        = sig;
         sl.state      = STATE_DONE;
         sl.statusCode = "EXPIRED";
         sl.statusMsg  = "EXPIRED";
         WriteDone();
         return;
        }
     }

   string brokerSym = ResolveBrokerSymbol(sig.symbol);
   if(brokerSym == "")
     {
      PrintFormat("VP EA[%d]: symbol %s niedostepny", idx, sig.symbol);
      sl.sig        = sig;
      sl.state      = STATE_DONE;
      sl.statusCode = "ERROR";
      sl.statusMsg  = "ERROR: symbol niedostepny";
      WriteDone();
      return;
     }

   if(sl.state == STATE_WATCHING || sl.state == STATE_IN_ZONE)
      PrintFormat("VP EA[%d]: nowy sygnal %s -> zastepuje stary %s", idx, sig.id, sl.sig.id);

   sl.sig           = sig;
   sl.brokerSym     = brokerSym;
   sl.state         = STATE_WATCHING;
   sl.tp1Hit        = false;
   sl.tp2Hit        = false;
   sl.zoneBars      = 0;
   sl.lastBarTime   = 0;
   sl.zoneEntryTime = 0;
   sl.statusCode    = "WATCHING";
   sl.statusMsg     = StringFormat("WATCHING: %s %.2f-%.2f", sig.direction, sig.entry_from, sig.entry_to);

   PrintFormat("VP EA[%d]: sygnal %s | %s %s | strefa %.2f-%.2f | SL %.2f | TP %.2f/%.2f/%.2f",
               idx, sig.id, sig.symbol, sig.direction,
               sig.entry_from, sig.entry_to, sig.sl,
               sig.tp1, sig.tp2, sig.tp3);

   WriteDone();

   // Telegram #1 — sygnal odebrany
   string arrow = (sig.direction == "SHORT") ? "🔴" : "🟢";
   string msg = StringFormat(
     "%s <b>VP EA [%d] | %s %s</b>\n"
     "━━━━━━━━━━━━━━━━\n"
     "📍 Strefa: %.2f – %.2f\n"
     "🛑 SL: %.2f\n"
     "🎯 TP1: %.2f | TP2: %.2f | TP3: %.2f\n"
     "━━━━━━━━━━━━━━━━\n"
     "⏳ Czekam na wejscie ceny w strefe...\n"
     "<i>%s</i>",
     arrow, idx, sig.direction, sig.symbol,
     sig.entry_from, sig.entry_to, sig.sl,
     sig.tp1, sig.tp2, sig.tp3, sig.comment);
   SendTelegram(msg);
  }

//+------------------------------------------------------------------+
//| Monitoruje cene i decyduje o wejsciu                             |
//+------------------------------------------------------------------+
void CheckZoneEntry(int idx)
  {
   SVPSlot *sl = GetPointer(g_slots[idx]);
   if(sl.brokerSym == "") return;

   bool   isLong = (sl.sig.direction == "LONG");
   double bid    = SymbolInfoDouble(sl.brokerSym, SYMBOL_BID);
   double ask    = SymbolInfoDouble(sl.brokerSym, SYMBOL_ASK);
   double cur    = isLong ? ask : bid;

   if(sl.sig.expires > 0 && TimeCurrent() > sl.sig.expires)
     {
      PrintFormat("VP EA[%d]: sygnal wygasl w trakcie oczekiwania", idx);
      sl.state      = STATE_DONE;
      sl.statusCode = "EXPIRED";
      sl.statusMsg  = "EXPIRED";
      WriteDone();
      return;
     }

   bool inZone = (cur >= sl.sig.entry_from && cur <= sl.sig.entry_to);
   bool beyond = isLong ? (ask < sl.sig.entry_from) : (bid > sl.sig.entry_to);

   if(beyond)
     {
      PrintFormat("VP EA[%d]: cena %.2f przebila strefe %.2f-%.2f — SKIPPED",
                  idx, cur, sl.sig.entry_from, sl.sig.entry_to);
      sl.state      = STATE_DONE;
      sl.statusCode = "SKIPPED";
      sl.statusMsg  = "SKIPPED — cena przebila strefe";
      WriteDone();
      return;
     }

   if(inZone && sl.state == STATE_WATCHING)
     {
      sl.state         = STATE_IN_ZONE;
      sl.zoneEntryTime = TimeCurrent();
      sl.zoneBars      = 0;
      sl.lastBarTime   = iTime(sl.brokerSym, PERIOD_M15, 0);
      PrintFormat("VP EA[%d]: cena %.2f weszla w strefe — czekam na potwierdzenie", idx, cur);
      sl.statusMsg = StringFormat("IN_ZONE: %.2f | czekam na swiece...", cur);
      return;
     }

   if(!inZone && sl.state == STATE_IN_ZONE)
     {
      sl.state     = STATE_WATCHING;
      sl.zoneBars  = 0;
      sl.statusMsg = StringFormat("WATCHING: %s %.2f-%.2f", sl.sig.direction, sl.sig.entry_from, sl.sig.entry_to);
      if(InpVerboseLog) PrintFormat("VP EA[%d]: cena wyszla ze strefy — wracam do WATCHING", idx);
      return;
     }

   if(sl.state == STATE_IN_ZONE)
     {
      datetime curBarTime = iTime(sl.brokerSym, PERIOD_M15, 0);
      bool     newBar     = (curBarTime != sl.lastBarTime && sl.lastBarTime != 0);

      if(newBar)
        {
         sl.lastBarTime = curBarTime;
         sl.zoneBars++;
         if(InpVerboseLog)
            PrintFormat("VP EA[%d]: bar #%d w strefie | sprawdzam potwierdzenie...", idx, sl.zoneBars);
         if(sl.zoneBars > InpZoneMaxBars)
           {
            PrintFormat("VP EA[%d]: %d barow bez potwierdzenia — wchodze rynkowo", idx, sl.zoneBars);
            TryEnterMarket(idx);
            return;
           }
        }
      else if(sl.lastBarTime == 0)
         sl.lastBarTime = curBarTime;

      if(!CheckSpread(idx)) return;
      if(InpCandleM15 && !CandleConfirmsTF(idx, PERIOD_M15, "M15")) return;
      if(InpCandleM5  && !CandleConfirmsTF(idx, PERIOD_M5,  "M5"))  return;
      if(InpCandleM3  && !CandleConfirmsTF(idx, PERIOD_M3,  "M3"))  return;
      if(InpRequireVolume && !VolumeConfirms(idx)) return;

      TryEnterMarket(idx);
     }
  }

//+------------------------------------------------------------------+
bool CheckSpread(int idx)
  {
   if(InpMaxSpreadPts <= 0) return true;
   long spread = SymbolInfoInteger(g_slots[idx].brokerSym, SYMBOL_SPREAD);
   if(spread > InpMaxSpreadPts)
     {
      if(InpVerboseLog) PrintFormat("VP EA[%d]: spread %d > %d — czekam", idx, spread, InpMaxSpreadPts);
      return false;
     }
   return true;
  }

//+------------------------------------------------------------------+
bool CandleConfirmsTF(int idx, ENUM_TIMEFRAMES tf, string tfName)
  {
   SVPSlot *sl    = GetPointer(g_slots[idx]);
   bool     isLong = (sl.sig.direction == "LONG");

   double prevOpen  = iOpen(sl.brokerSym,  tf, 1);
   double prevClose = iClose(sl.brokerSym, tf, 1);

   if(prevOpen == 0 || prevClose == 0)
     {
      if(InpVerboseLog) PrintFormat("VP EA[%d]: brak danych swieca %s — przepuszczam", idx, tfName);
      return true;
     }

   bool ok = isLong ? (prevClose > prevOpen) : (prevClose < prevOpen);

   if(!ok)
     {
      if(InpVerboseLog)
         PrintFormat("VP EA[%d]: swieca %s O=%.2f C=%.2f nie potwierdza %s — czekam",
                     idx, tfName, prevOpen, prevClose, sl.sig.direction);
      return false;
     }

   if(InpVerboseLog)
      PrintFormat("VP EA[%d]: swieca %s OK | O=%.2f C=%.2f %s",
                  idx, tfName, prevOpen, prevClose, isLong ? "BULLISH" : "BEARISH");
   return true;
  }

//+------------------------------------------------------------------+
bool VolumeConfirms(int idx)
  {
   string sym = g_slots[idx].brokerSym;
   long vol = iVolume(sym, PERIOD_M15, 1);
   if(vol <= 0) return true;

   long sumVol = 0;
   int  count  = 0;
   for(int i = 2; i <= 21; i++)
     {
      long v = iVolume(sym, PERIOD_M15, i);
      if(v > 0) { sumVol += v; count++; }
     }
   if(count == 0) return true;

   double avgVol = (double)sumVol / count;
   if((double)vol < avgVol * InpVolMult)
     {
      if(InpVerboseLog) PrintFormat("VP EA[%d]: wolumen za niski", idx);
      return false;
     }
   return true;
  }

//+------------------------------------------------------------------+
//| Otwiera 3 pozycje rynkowe                                        |
//+------------------------------------------------------------------+
void TryEnterMarket(int idx)
  {
   SVPSlot *sl = GetPointer(g_slots[idx]);
   bool isLong = (sl.sig.direction == "LONG");
   double lot  = sl.sig.lot > 0 ? sl.sig.lot : InpLotPerPos;

   g_trade.SetExpertMagicNumber(sl.magic);

   if(InpDryRun)
     {
      double cur = isLong
         ? SymbolInfoDouble(sl.brokerSym, SYMBOL_ASK)
         : SymbolInfoDouble(sl.brokerSym, SYMBOL_BID);
      PrintFormat("TRYB TESTOWY[%d]: wejscie %s @ %.2f SL %.2f TP1 %.2f",
                  idx, sl.sig.direction, cur, sl.sig.sl, sl.sig.tp1);
      sl.state      = STATE_DONE;
      sl.statusCode = "DRYRUN";
      sl.statusMsg  = "DRYRUN";
      WriteDone();
      return;
     }

   double tps[3]  = {sl.sig.tp1, sl.sig.tp2, sl.sig.tp3};
   string cmts[3] = {COMMENT_TP1, COMMENT_TP2, COMMENT_TP3};
   int    opened  = 0;
   double entryPrice = 0;

   for(int i = 0; i < 3; i++)
     {
      if(tps[i] <= 0) continue;

      bool res = isLong
         ? g_trade.Buy(lot, sl.brokerSym, 0, sl.sig.sl, tps[i], cmts[i])
         : g_trade.Sell(lot, sl.brokerSym, 0, sl.sig.sl, tps[i], cmts[i]);

      if(res)
        {
         opened++;
         if(entryPrice == 0) entryPrice = g_trade.ResultPrice();
         PrintFormat("VP EA[%d]: otwarto poz %d (%s) @ %.2f TP %.2f ticket %I64d",
                     idx, i + 1, cmts[i], g_trade.ResultPrice(), tps[i], g_trade.ResultOrder());
        }
      else
         PrintFormat("VP EA[%d]: BLAD poz %d kod %d: %s",
                     idx, i + 1, g_trade.ResultRetcode(), g_trade.ResultComment());
     }

   if(opened > 0)
     {
      sl.state      = STATE_FILLED;
      sl.statusCode = "OPENED";
      sl.statusMsg  = StringFormat("FILLED: %s @ %.2f | %d/3", sl.sig.direction, entryPrice, opened);
      WriteDone();

      // Telegram #2 — transakcja otwarta
      double slPts  = MathAbs(entryPrice - sl.sig.sl);
      double tpPts  = (sl.sig.tp3 > 0) ? MathAbs(sl.sig.tp3 - entryPrice) : MathAbs(sl.sig.tp1 - entryPrice);
      double rr     = (slPts > 0) ? tpPts / slPts : 0;
      string arrow  = (sl.sig.direction == "SHORT") ? "🔴" : "🟢";
      string msg = StringFormat(
        "✅ <b>VP EA [%d] | OTWARTO %s %s</b>\n"
        "━━━━━━━━━━━━━━━━\n"
        "💰 Entry: %.2f (rynek)\n"
        "📦 Lot: %dx%.2f | R:R 1:%.1f\n"
        "🛑 SL: %.2f\n"
        "🎯 TP1: %.2f | TP2: %.2f | TP3: %.2f\n"
        "━━━━━━━━━━━━━━━━\n"
        "<i>Magic: %I64d</i>",
        idx, arrow, sl.sig.symbol,
        entryPrice, opened, lot, rr,
        sl.sig.sl,
        sl.sig.tp1, sl.sig.tp2, sl.sig.tp3,
        sl.magic);
      SendTelegram(msg);
     }
   else
     {
      sl.state      = STATE_DONE;
      sl.statusCode = "ERROR";
      sl.statusMsg  = "BLAD otwarcia pozycji";
      WriteDone();
     }
  }

//+------------------------------------------------------------------+
//| Zarzadza pozycjami danego slotu                                  |
//+------------------------------------------------------------------+
void ManagePositions(int idx)
  {
   SVPSlot *sl = GetPointer(g_slots[idx]);
   if(sl.state != STATE_FILLED) return;

   int tp1c = 0, tp2c = 0, tp3c = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetInteger(POSITION_MAGIC) != sl.magic) continue;
      string cmt = PositionGetString(POSITION_COMMENT);
      if(StringFind(cmt, COMMENT_TP1) >= 0) tp1c++;
      if(StringFind(cmt, COMMENT_TP2) >= 0) tp2c++;
      if(StringFind(cmt, COMMENT_TP3) >= 0) tp3c++;
     }

   if(!sl.tp1Hit && tp1c == 0 && (tp2c > 0 || tp3c > 0))
     {
      sl.tp1Hit = true;
      PrintFormat("VP EA[%d]: TP1 zamkniety — przesuwam SL na BE", idx);
      if(InpMoveSLtoBE) MoveSLtoBE(idx);
     }

   if(sl.tp1Hit && !sl.tp2Hit && tp2c == 0 && tp3c > 0)
     {
      sl.tp2Hit = true;
      PrintFormat("VP EA[%d]: TP2 zamkniety — trailing aktywny", idx);
     }

   if(tp1c == 0 && tp2c == 0 && tp3c == 0)
     {
      sl.tp1Hit     = false;
      sl.tp2Hit     = false;
      sl.state      = STATE_DONE;
      sl.statusCode = "DONE";
      sl.statusMsg  = "Pozycje zamkniete";
      PrintFormat("VP EA[%d]: wszystkie pozycje zamkniete", idx);
      WriteDone();
      SendTelegramSummary(idx);
     }
  }

//+------------------------------------------------------------------+
void MoveSLtoBE(int idx)
  {
   SVPSlot *sl = GetPointer(g_slots[idx]);
   g_trade.SetExpertMagicNumber(sl.magic);

   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetInteger(POSITION_MAGIC) != sl.magic) continue;
      string cmt = PositionGetString(POSITION_COMMENT);
      if(StringFind(cmt, COMMENT_TP1) >= 0) continue;

      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double curSL     = PositionGetDouble(POSITION_SL);
      double curTP     = PositionGetDouble(POSITION_TP);
      long   type      = PositionGetInteger(POSITION_TYPE);
      ulong  ticket    = PositionGetInteger(POSITION_TICKET);

      bool better = (type == POSITION_TYPE_BUY) ? (openPrice > curSL) : (openPrice < curSL);
      if(!better) continue;

      if(g_trade.PositionModify(ticket, openPrice, curTP))
         PrintFormat("VP EA[%d]: SL na BE dla #%I64d (%.2f)", idx, ticket, openPrice);
      else
         PrintFormat("VP EA[%d]: BLAD BE #%I64d: %s", idx, ticket, g_trade.ResultComment());
     }
  }

//+------------------------------------------------------------------+
void TrailTP3Position(int idx)
  {
   SVPSlot *sl = GetPointer(g_slots[idx]);

   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetInteger(POSITION_MAGIC) != sl.magic) continue;
      string cmt = PositionGetString(POSITION_COMMENT);
      if(StringFind(cmt, COMMENT_TP3) < 0) continue;

      long   type   = PositionGetInteger(POSITION_TYPE);
      double curSL  = PositionGetDouble(POSITION_SL);
      double curTP  = PositionGetDouble(POSITION_TP);
      ulong  ticket = PositionGetInteger(POSITION_TICKET);
      string sym    = PositionGetString(POSITION_SYMBOL);
      double point  = SymbolInfoDouble(sym, SYMBOL_POINT);
      double step   = InpTrailStepPts * point;
      double bid    = SymbolInfoDouble(sym, SYMBOL_BID);
      double ask    = SymbolInfoDouble(sym, SYMBOL_ASK);

      double newSL;
      if(type == POSITION_TYPE_BUY)
        { newSL = bid - step; if(newSL <= curSL) continue; }
      else
        { newSL = ask + step; if(newSL >= curSL) continue; }

      g_trade.PositionModify(ticket, newSL, curTP);
     }
  }

//+------------------------------------------------------------------+
//| done.json — tablica stanow obu slotow                            |
//+------------------------------------------------------------------+
void WriteDone()
  {
   int handle = FileOpen(g_doneFile, FILE_WRITE | FILE_TXT | FILE_COMMON | FILE_ANSI);
   if(handle == INVALID_HANDLE) return;

   string body = "[";
   bool   first = true;

   for(int i = 0; i < MAX_SLOTS; i++)
     {
      SVPSlot *sl = GetPointer(g_slots[i]);
      if(sl.sig.id == "") continue;

      if(!first) body += ",";
      first = false;

      body += StringFormat(
        "{\"id\":\"%s\",\"slot\":%d,\"direction\":\"%s\","
        "\"status\":\"%s\",\"entry_executed\":%.2f,"
        "\"account\":%I64d,\"time\":\"%s\"}",
        sl.sig.id, i, sl.sig.direction,
        sl.statusCode,
        0.0,
        AccountInfoInteger(ACCOUNT_LOGIN),
        TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS));
     }

   body += "]";
   FileWriteString(handle, body);
   FileClose(handle);
  }

//+------------------------------------------------------------------+
void SendTelegramSummary(int idx)
  {
   if(!InpTgEnabled || g_tgToken == "") return;
   SVPSlot *sl = GetPointer(g_slots[idx]);

   double totalProfit = 0, totalSwap = 0;
   bool   tp1ok = false, tp2ok = false, tp3ok = false;
   int    dealCount = 0;

   datetime from = (sl.zoneEntryTime > 0) ? sl.zoneEntryTime - 3600 : TimeCurrent() - 86400;
   HistorySelect(from, TimeCurrent() + 60);

   for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(ticket, DEAL_MAGIC) != sl.magic) continue;
      if(HistoryDealGetInteger(ticket, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;

      totalProfit += HistoryDealGetDouble(ticket, DEAL_PROFIT);
      totalSwap   += HistoryDealGetDouble(ticket, DEAL_SWAP);
      dealCount++;

      string cmt = HistoryDealGetString(ticket, DEAL_COMMENT);
      if(StringFind(cmt, COMMENT_TP1) >= 0) tp1ok = true;
      if(StringFind(cmt, COMMENT_TP2) >= 0) tp2ok = true;
      if(StringFind(cmt, COMMENT_TP3) >= 0) tp3ok = true;
     }

   string icon = (totalProfit + totalSwap >= 0) ? "✅" : "❌";
   string msg = StringFormat(
     "%s <b>VP EA [%d] | PODSUMOWANIE %s %s</b>\n"
     "━━━━━━━━━━━━━━━━\n"
     "💵 Wynik: %+.2f USD\n"
     "🎯 TP1: %s | TP2: %s | TP3: %s\n"
     "📦 %d pozycji zamknietych\n"
     "━━━━━━━━━━━━━━━━\n"
     "<i>Magic: %I64d | Konto: %I64d</i>",
     icon, idx, sl.sig.direction, sl.sig.symbol,
     totalProfit + totalSwap,
     tp1ok ? "✅" : "❌", tp2ok ? "✅" : "❌", tp3ok ? "✅" : "❌",
     dealCount,
     sl.magic, AccountInfoInteger(ACCOUNT_LOGIN));

   SendTelegram(msg);
  }

//+------------------------------------------------------------------+
//| Parsuje signal.json — single lub array, zwraca liczbe sygnalow   |
//+------------------------------------------------------------------+
int ReadSignals(string filename, SVPSignal &out[])
  {
   int handle = FileOpen(filename, FILE_READ | FILE_TXT | FILE_COMMON | FILE_ANSI, '\0', CP_UTF8);
   if(handle == INVALID_HANDLE) return 0;

   string json = "";
   while(!FileIsEnding(handle)) json += FileReadString(handle);
   FileClose(handle);

   StringTrimLeft(json);
   StringTrimRight(json);
   if(StringLen(json) < 10) return 0;

   int count = 0;

   if(StringGetCharacter(json, 0) == '[')
     {
      // Tryb tablicy: wytnij kolejne obiekty {...}
      int pos = 0;
      while(pos < StringLen(json) && count < MAX_SLOTS)
        {
         int start = StringFind(json, "{", pos);
         if(start < 0) break;

         int depth = 0, end = start;
         for(int i = start; i < StringLen(json); i++)
           {
            ushort c = StringGetCharacter(json, i);
            if(c == '{') depth++;
            else if(c == '}') { depth--; if(depth == 0) { end = i; break; } }
           }

         string obj = StringSubstr(json, start, end - start + 1);
         SVPSignal sig;
         if(ParseSignalObj(obj, sig)) { out[count] = sig; count++; }
         pos = end + 1;
        }
     }
   else
     {
      // Tryb pojedynczego obiektu
      SVPSignal sig;
      if(ParseSignalObj(json, sig)) { out[0] = sig; count = 1; }
     }

   return count;
  }

//+------------------------------------------------------------------+
bool ParseSignalObj(string json, SVPSignal &sig)
  {
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
   sig.expires = (expiresStr != "") ? ParseISO8601(expiresStr) : 0;
   sig.sent_at = (sentStr    != "") ? ParseISO8601(sentStr)    : 0;

   return (sig.id != "" && sig.symbol != "" && sig.direction != "");
  }

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
         PrintFormat("VP EA: %s -> %s", base, s);
         if(SymbolSelect(s, true)) return s;
        }
     }
   return "";
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
   return StringSubstr(json, pos, end - pos);
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
   return (num != "") ? StringToDouble(num) : 0;
  }

//+------------------------------------------------------------------+
datetime ParseISO8601(string s)
  {
   if(StringLen(s) < 19) return 0;
   MqlDateTime mdt = {};
   mdt.year = (int)StringToInteger(StringSubstr(s, 0, 4));
   mdt.mon  = (int)StringToInteger(StringSubstr(s, 5, 2));
   mdt.day  = (int)StringToInteger(StringSubstr(s, 8, 2));
   mdt.hour = (int)StringToInteger(StringSubstr(s, 11, 2));
   mdt.min  = (int)StringToInteger(StringSubstr(s, 14, 2));
   mdt.sec  = (int)StringToInteger(StringSubstr(s, 17, 2));
   return StructToTime(mdt);
  }

//+------------------------------------------------------------------+
void LoadTgToken()
  {
   g_tgToken = "";
   if(!FileIsExist(InpTgTokenFile, FILE_COMMON))
     {
      Print("VP EA Telegram: brak pliku tokenu — powiadomienia wylaczone");
      return;
     }
   int h = FileOpen(InpTgTokenFile, FILE_READ | FILE_TXT | FILE_COMMON | FILE_ANSI);
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
void SendTelegram(string text)
  {
   if(!InpTgEnabled || g_tgToken == "") return;
   StringReplace(text, "\"", "'");

   string url  = "https://api.telegram.org/bot" + g_tgToken + "/sendMessage";
   string body = StringFormat(
     "{\"chat_id\":\"%s\",\"message_thread_id\":%d,\"text\":\"%s\",\"parse_mode\":\"HTML\"}",
     InpTgChatId, InpTgThreadId, text);

   char   post[], result[];
   string respHeaders;
   StringToCharArray(body, post, 0, StringLen(body));

   int res = WebRequest("POST", url, "Content-Type: application/json\r\n",
                        5000, post, result, respHeaders);
   if(res == -1)
      PrintFormat("VP EA Telegram: blad WebRequest %d (dodaj URL w opcjach MT5)", GetLastError());
   else if(InpVerboseLog)
      PrintFormat("VP EA Telegram: wyslano OK (%d B)", ArraySize(result));
  }

//+------------------------------------------------------------------+
void ShowPanel()
  {
   if(!InpShowPanel) return;

   string panel = StringFormat("TRW VP EA v%s%s\n━━━━━━━━━━━━━━━━\n",
                               VP_EA_VERSION, InpDryRun ? " [TRYB TESTOWY]" : "");

   for(int i = 0; i < MAX_SLOTS; i++)
     {
      SVPSlot *sl = GetPointer(g_slots[i]);

      string stateStr;
      switch(sl.state)
        {
         case STATE_IDLE:     stateStr = "IDLE";     break;
         case STATE_WATCHING: stateStr = "WATCHING"; break;
         case STATE_IN_ZONE:  stateStr = StringFormat("IN_ZONE(%d bar)", sl.zoneBars); break;
         case STATE_FILLED:   stateStr = "FILLED";   break;
         case STATE_DONE:     stateStr = "DONE";     break;
         default:             stateStr = "?";
        }

      int tp1c = 0, tp2c = 0, tp3c = 0;
      for(int j = PositionsTotal() - 1; j >= 0; j--)
        {
         if(!PositionSelectByTicket(PositionGetTicket(j))) continue;
         if(PositionGetInteger(POSITION_MAGIC) != sl.magic) continue;
         string cmt = PositionGetString(POSITION_COMMENT);
         if(StringFind(cmt, COMMENT_TP1) >= 0) tp1c++;
         if(StringFind(cmt, COMMENT_TP2) >= 0) tp2c++;
         if(StringFind(cmt, COMMENT_TP3) >= 0) tp3c++;
        }

      panel += StringFormat(
        "[%d] %s | magic %I64d\n"
        "    ID: %s\n"
        "    Dir: %s | Poz: TP1=%d TP2=%d TP3=%d\n"
        "    %s\n",
        i, stateStr, sl.magic,
        sl.sig.id != "" ? sl.sig.id : "brak",
        sl.sig.direction != "" ? sl.sig.direction : "—",
        tp1c, tp2c, tp3c,
        sl.statusMsg);
     }

   Comment(panel);
  }
//+------------------------------------------------------------------+
