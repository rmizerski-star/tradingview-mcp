//+------------------------------------------------------------------+
//|                                                  TRW_VP_EA.mq5  |
//|              Trading Room Workshop - Volume Profile Signal Bot   |
//|                                                    v1.0          |
//+------------------------------------------------------------------+
//  Workflow:
//    1. Claude zapisuje analize VP do Common\Files\TRW_VP\signal.json
//    2. EA czyta sygnal co InpPollSeconds sekund
//    3. Otwiera 3 pozycje (TP1 / TP2 / TP3) z tym samym SL
//    4. Po zamknieciu TP1 -> SL obu pozostalych przesuwa na breakeven
//    5. Po zamknieciu TP2 -> trailing stop na ostatniej pozycji
//
//  Format pliku signal.json (zapisywany przez mt5_send_vp_signal.mjs):
//  {
//    "id":          "VP_SHORT_20261006_1230",
//    "symbol":      "XAUUSD",
//    "direction":   "SHORT",          // "SHORT" lub "LONG"
//    "entry_from":  4176.0,
//    "entry_to":    4179.0,
//    "sl":          4183.0,
//    "tp1":         4164.71,
//    "tp2":         4156.11,
//    "tp3":         4144.44,
//    "lot":         0.01,             // lot NA POZYCJE (lacznie 3x)
//    "comment":     "VP Sc.A SHORT CDH",
//    "expires_utc": "2026-10-06T20:00:00Z",
//    "sent_at":     "2026-10-06T12:30:00Z"
//  }
//+------------------------------------------------------------------+
#property copyright "Trading Room Workshop"
#property version   "1.00"
#property description "VP Signal Bot: czyta TRW_VP/signal.json, otwiera 3 pozycje (TP1/TP2/TP3), zarzadza SL na BE"

#include <Trade\Trade.mqh>

//--- Inputs
input group         "=== Plik sygnalu ==="
input string        InpSignalFolder    = "TRW_VP";    // Folder w Common\Files terminala
input int           InpPollSeconds     = 3;           // Co ile sekund sprawdzac (s)
input int           InpMaxSignalAgeMin = 120;         // Pomij sygnaly starsze niz X minut

input group         "=== Handel ==="
input double        InpLotPerPos       = 0.01;        // Lot NA POZYCJE (lacznie 3x InpLotPerPos)
input long          InpMagic           = 770003;      // Magic number VP bota
input string        InpSymbolSuffix    = "";          // Sufiks brokera np. ".r" (puste = autowykrywanie)
input int           InpSlippage        = 20;          // Slippage w punktach
input int           InpEntryMode       = 1;           // 0=Mid strefy 1=Near (blizej ceny) 2=Far (dalsza)
input bool          InpDryRun          = false;       // Tryb testowy: loguj bez zlecen

input group         "=== Zarzadzanie pozycja ==="
input bool          InpMoveSLtoBE      = true;        // Przesun SL na BE po zamknieciu TP1
input bool          InpTrailAfterTP2   = true;        // Trailing co 10 pkt po zamknieciu TP2
input int           InpTrailStepPts    = 100;         // Krok trailingu w punktach (XAUUSD: 100 = 1.00$)

input group         "=== Diagnostyka ==="
input bool          InpShowPanel       = true;
input bool          InpVerboseLog      = true;

//--- Stale
#define VP_EA_VERSION "1.0"
#define COMMENT_TP1   "TRW_VP_TP1"
#define COMMENT_TP2   "TRW_VP_TP2"
#define COMMENT_TP3   "TRW_VP_TP3"

//--- Struktura sygnalu
struct SVPSignal
  {
   string   id;
   string   symbol;
   string   direction;    // "LONG" lub "SHORT"
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
string      g_lastSignalId    = "";
bool        g_tp1Hit          = false;
bool        g_tp2Hit          = false;
datetime    g_lastPoll        = 0;
int         g_openCount       = 0;
string      g_statusMsg       = "Oczekiwanie na sygnal...";

//+------------------------------------------------------------------+
//| Init                                                             |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpLotPerPos <= 0)
     {
      Print("BLAD: InpLotPerPos musi byc > 0");
      return(INIT_PARAMETERS_INCORRECT);
     }

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
//| Timer                                                            |
//+------------------------------------------------------------------+
void OnTimer()
  {
   PollSignal();
   ManagePositions();
   ShowPanel();
  }

//+------------------------------------------------------------------+
//| OnTick - szybkie sprawdzenie trailingu                           |
//+------------------------------------------------------------------+
void OnTick()
  {
   if(g_tp2Hit && InpTrailAfterTP2)
      TrailTP3Position();
  }

//+------------------------------------------------------------------+
//| Czyta signal.json i otwiera pozycje jesli nowy sygnal           |
//+------------------------------------------------------------------+
void PollSignal()
  {
   if(!FileIsExist(g_signalFile, FILE_COMMON)) return;

   SVPSignal sig;
   if(!ReadSignal(g_signalFile, sig)) return;

   // Ignoruj jesli juz przetworzone
   if(sig.id == g_lastSignalId) return;

   // Ignoruj wygasle
   if(sig.expires > 0 && TimeCurrent() > sig.expires)
     {
      if(InpVerboseLog) PrintFormat("VP EA: sygnal %s przeterminowany - pomin", sig.id);
      g_lastSignalId = sig.id;
      return;
     }

   // Ignoruj za stare
   if(sig.sent_at > 0)
     {
      int ageMin = (int)((TimeCurrent() - sig.sent_at) / 60);
      if(ageMin > InpMaxSignalAgeMin)
        {
         if(InpVerboseLog) PrintFormat("VP EA: sygnal %s za stary (%d min) - pomin", sig.id, ageMin);
         g_lastSignalId = sig.id;
         return;
        }
     }

   PrintFormat("VP EA: nowy sygnal %s | %s %s | entry %.2f-%.2f | SL %.2f | TP %.2f/%.2f/%.2f",
               sig.id, sig.symbol, sig.direction,
               sig.entry_from, sig.entry_to,
               sig.sl, sig.tp1, sig.tp2, sig.tp3);

   // Wyznacz symbol z sufiksem brokera
   string brokerSym = ResolveBrokerSymbol(sig.symbol);
   if(brokerSym == "")
     {
      PrintFormat("VP EA: symbol %s niedostepny u brokera - sygnal odrzucony", sig.id);
      g_lastSignalId = sig.id;
      return;
     }

   // Lot z sygnalu lub domyslny
   double lot = sig.lot > 0 ? sig.lot : InpLotPerPos;

   // Wylicz cene wejscia
   double entryPrice = CalcEntryPrice(sig, brokerSym);

   if(InpDryRun)
     {
      PrintFormat("TRYB TESTOWY: otwieram 3x %s @ %.2f SL %.2f TP1 %.2f TP2 %.2f TP3 %.2f",
                  sig.direction, entryPrice, sig.sl, sig.tp1, sig.tp2, sig.tp3);
      g_lastSignalId = sig.id;
      g_statusMsg    = "TRYB TESTOWY - sygnal zalogowany";
      return;
     }

   // Skasuj stare oczekujace VP na tym symbolu
   CancelPendingVP(brokerSym);

   // Otwierz 3 pozycje
   bool ok = OpenThreePositions(sig, brokerSym, entryPrice, lot);

   if(ok)
     {
      g_lastSignalId = sig.id;
      g_tp1Hit       = false;
      g_tp2Hit       = false;
      g_statusMsg    = StringFormat("Otwarte: %s %s @ %.2f", sig.direction, brokerSym, entryPrice);
      WriteDone(sig, entryPrice, true);
     }
   else
     {
      g_lastSignalId = sig.id;  // nie prob ponownie tego sygnalu
      g_statusMsg    = "BLAD otwarcia pozycji - sprawdz Dziennik";
      WriteDone(sig, entryPrice, false);
     }
  }

//+------------------------------------------------------------------+
//| Otwiera 3 pozycje z TP1/TP2/TP3                                 |
//+------------------------------------------------------------------+
bool OpenThreePositions(const SVPSignal &sig, string sym, double price, double lot)
  {
   bool isLong      = (sig.direction == "LONG");
   ENUM_ORDER_TYPE orderType;
   double ask       = SymbolInfoDouble(sym, SYMBOL_ASK);
   double bid       = SymbolInfoDouble(sym, SYMBOL_BID);
   double curPrice  = isLong ? ask : bid;

   // Czy to zlecenie oczekujace czy rynkowe?
   bool inZone = isLong ? (ask >= sig.entry_from && ask <= sig.entry_to)
                        : (bid >= sig.entry_from && bid <= sig.entry_to);
   bool beyondZone = isLong ? (ask > sig.entry_to) : (bid < sig.entry_from);

   if(beyondZone)
     {
      PrintFormat("VP EA: cena juz za strefa entry - sygnal %s pomin", sig.id);
      return false;
     }

   if(inZone)
      orderType = isLong ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   else
      orderType = isLong ? ORDER_TYPE_BUY_LIMIT : ORDER_TYPE_SELL_LIMIT;

   double tps[3];
   tps[0] = sig.tp1;
   tps[1] = sig.tp2;
   tps[2] = sig.tp3;

   string comments[3] = {COMMENT_TP1, COMMENT_TP2, COMMENT_TP3};
   int    opened = 0;

   for(int i = 0; i < 3; i++)
     {
      if(tps[i] <= 0) continue;  // pomin jesli TP nie podano

      bool res;
      if(orderType == ORDER_TYPE_BUY || orderType == ORDER_TYPE_SELL)
        {
         res = isLong
               ? g_trade.Buy(lot, sym, 0, sig.sl, tps[i], comments[i])
               : g_trade.Sell(lot, sym, 0, sig.sl, tps[i], comments[i]);
        }
      else
        {
         res = isLong
               ? g_trade.BuyLimit(lot, price, sym, sig.sl, tps[i], ORDER_TIME_SPECIFIED,
                                   sig.expires > 0 ? sig.expires : TimeCurrent() + 4*3600, comments[i])
               : g_trade.SellLimit(lot, price, sym, sig.sl, tps[i], ORDER_TIME_SPECIFIED,
                                    sig.expires > 0 ? sig.expires : TimeCurrent() + 4*3600, comments[i]);
        }

      if(res)
        {
         opened++;
         PrintFormat("VP EA: otwarto pozycja %d (%s) @ %.2f TP %.2f ticket %I64d",
                     i+1, comments[i], price, tps[i], g_trade.ResultOrder());
        }
      else
        {
         PrintFormat("VP EA: BLAD pozycja %d (%s) kod %d: %s",
                     i+1, comments[i], g_trade.ResultRetcode(), g_trade.ResultComment());
        }
     }

   g_openCount = opened;
   return opened > 0;
  }

//+------------------------------------------------------------------+
//| Zarzadza pozycjami: SL na BE po TP1, trailing po TP2            |
//+------------------------------------------------------------------+
void ManagePositions()
  {
   // Policz otwarte pozycje VP
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

   // TP1 zamkniety - przesun SL na BE
   if(!g_tp1Hit && tp1Count == 0 && (tp2Count > 0 || tp3Count > 0))
     {
      g_tp1Hit = true;
      PrintFormat("VP EA: TP1 zamkniety! Przesuwam SL na BE dla pozostalych pozycji.");
      if(InpMoveSLtoBE) MoveSLtoBE();
     }

   // TP2 zamkniety - wlacz trailing
   if(g_tp1Hit && !g_tp2Hit && tp2Count == 0 && tp3Count > 0)
     {
      g_tp2Hit = true;
      PrintFormat("VP EA: TP2 zamkniety! Wlaczam trailing na TP3.");
     }

   // Wszystkie zamkniete - reset
   if(tp1Count == 0 && tp2Count == 0 && tp3Count == 0 && g_lastSignalId != "")
     {
      if(g_tp1Hit || g_tp2Hit)
        {
         g_tp1Hit    = false;
         g_tp2Hit    = false;
         g_statusMsg = "Wszystkie pozycje zamkniete - oczekiwanie na nowy sygnal";
         PrintFormat("VP EA: wszystkie pozycje zamkniete.");
        }
     }
  }

//+------------------------------------------------------------------+
//| Przesun SL na cene wejscia (breakeven) dla TP2 i TP3            |
//+------------------------------------------------------------------+
void MoveSLtoBE()
  {
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;

      string cmt    = PositionGetString(POSITION_COMMENT);
      if(StringFind(cmt, COMMENT_TP1) >= 0) continue;  // TP1 juz zamkniety

      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double curSL     = PositionGetDouble(POSITION_SL);
      double curTP     = PositionGetDouble(POSITION_TP);
      long   type      = PositionGetInteger(POSITION_TYPE);
      string sym       = PositionGetString(POSITION_SYMBOL);
      ulong  ticket    = PositionGetInteger(POSITION_TICKET);

      // Sprawdz czy BE jest polepszeniem SL
      bool isBetter = (type == POSITION_TYPE_BUY)  ? (openPrice > curSL) :
                      (type == POSITION_TYPE_SELL) ? (openPrice < curSL) : false;
      if(!isBetter) continue;

      if(g_trade.PositionModify(ticket, openPrice, curTP))
         PrintFormat("VP EA: SL na BE dla pozycji #%I64d (%.2f)", ticket, openPrice);
      else
         PrintFormat("VP EA: BLAD modyfikacji BE #%I64d: %s", ticket, g_trade.ResultComment());
     }
  }

//+------------------------------------------------------------------+
//| Trailing stop dla ostatniej pozycji (TP3)                        |
//+------------------------------------------------------------------+
void TrailTP3Position()
  {
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;

      string cmt = PositionGetString(POSITION_COMMENT);
      if(StringFind(cmt, COMMENT_TP3) < 0) continue;

      long   type    = PositionGetInteger(POSITION_TYPE);
      string sym     = PositionGetString(POSITION_SYMBOL);
      double curSL   = PositionGetDouble(POSITION_SL);
      double curTP   = PositionGetDouble(POSITION_TP);
      ulong  ticket  = PositionGetInteger(POSITION_TICKET);
      double point   = SymbolInfoDouble(sym, SYMBOL_POINT);
      double step    = InpTrailStepPts * point;

      double bid = SymbolInfoDouble(sym, SYMBOL_BID);
      double ask = SymbolInfoDouble(sym, SYMBOL_ASK);

      double newSL;
      if(type == POSITION_TYPE_BUY)
        {
         newSL = bid - step;
         if(newSL <= curSL) continue;
        }
      else
        {
         newSL = ask + step;
         if(newSL >= curSL) continue;
        }

      if(g_trade.PositionModify(ticket, newSL, curTP))
         PrintFormat("VP EA: Trailing SL -> %.2f dla #%I64d", newSL, ticket);
     }
  }

//+------------------------------------------------------------------+
//| Anuluj oczekujace zlecenia VP na symbolu                         |
//+------------------------------------------------------------------+
void CancelPendingVP(string sym)
  {
   for(int i = OrdersTotal()-1; i >= 0; i--)
     {
      if(!OrderSelect(OrderGetTicket(i))) continue;
      if(OrderGetInteger(ORDER_MAGIC) != InpMagic) continue;
      if(OrderGetString(ORDER_SYMBOL) != sym) continue;

      string cmt = OrderGetString(ORDER_COMMENT);
      if(StringFind(cmt, "TRW_VP") < 0) continue;

      g_trade.OrderDelete(OrderGetTicket(i));
     }
  }

//+------------------------------------------------------------------+
//| Wylicza cene wejscia na podstawie strefy i trybu entry          |
//+------------------------------------------------------------------+
double CalcEntryPrice(const SVPSignal &sig, string sym)
  {
   bool isLong = (sig.direction == "LONG");
   double mid  = (sig.entry_from + sig.entry_to) / 2.0;

   if(InpEntryMode == 0) return mid;

   // Near = blizej ceny rynkowej
   double mktPrice = isLong ? SymbolInfoDouble(sym, SYMBOL_ASK)
                             : SymbolInfoDouble(sym, SYMBOL_BID);
   if(InpEntryMode == 1)  // Near
      return isLong ? sig.entry_to : sig.entry_from;   // blizej ceny dla LONG = gorny kraniec strefy
   else                   // Far = dalsza krawedz
      return isLong ? sig.entry_from : sig.entry_to;

   return mid;
  }

//+------------------------------------------------------------------+
//| Wykrywa symbol z sufiksem brokera                                |
//+------------------------------------------------------------------+
string ResolveBrokerSymbol(string base)
  {
   // Jesli podano sufiks wprost
   if(InpSymbolSuffix != "")
     {
      string full = base + InpSymbolSuffix;
      if(SymbolSelect(full, true)) return full;
     }

   // Sprobuj bez sufiksu
   if(SymbolSelect(base, true)) return base;

   // Szukaj w Market Watch
   int total = SymbolsTotal(false);
   for(int i = 0; i < total; i++)
     {
      string s = SymbolName(i, false);
      if(StringFind(s, base) >= 0)
        {
         if(SymbolSelect(s, true))
           {
            PrintFormat("VP EA: symbol %s -> %s", base, s);
            return s;
           }
        }
     }

   return "";
  }

//+------------------------------------------------------------------+
//| Parsuje signal.json (prosty string parser)                       |
//+------------------------------------------------------------------+
bool ReadSignal(string filename, SVPSignal &sig)
  {
   int handle = FileOpen(filename, FILE_READ|FILE_TXT|FILE_COMMON|FILE_ANSI, '\0', CP_UTF8);
   if(handle == INVALID_HANDLE)
     {
      if(InpVerboseLog) PrintFormat("VP EA: nie moge otworzyc %s (kod %d)", filename, GetLastError());
      return false;
     }

   string json = "";
   while(!FileIsEnding(handle))
      json += FileReadString(handle);
   FileClose(handle);

   if(StringLen(json) < 10) return false;

   // Proste parsowanie kluczy JSON
   sig.id          = JsonGetStr(json, "id");
   sig.symbol      = JsonGetStr(json, "symbol");
   sig.direction   = JsonGetStr(json, "direction");
   sig.entry_from  = JsonGetDbl(json, "entry_from");
   sig.entry_to    = JsonGetDbl(json, "entry_to");
   sig.sl          = JsonGetDbl(json, "sl");
   sig.tp1         = JsonGetDbl(json, "tp1");
   sig.tp2         = JsonGetDbl(json, "tp2");
   sig.tp3         = JsonGetDbl(json, "tp3");
   sig.lot         = JsonGetDbl(json, "lot");
   sig.comment     = JsonGetStr(json, "comment");

   string expiresStr = JsonGetStr(json, "expires_utc");
   string sentStr    = JsonGetStr(json, "sent_at");
   sig.expires  = expiresStr != "" ? ParseISO8601(expiresStr) : 0;
   sig.sent_at  = sentStr    != "" ? ParseISO8601(sentStr)    : 0;

   if(sig.id == "" || sig.symbol == "" || sig.direction == "") return false;

   return true;
  }

//+------------------------------------------------------------------+
//| Pomocnik: odczytaj string z JSON po kluczu "key":"value"        |
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
//| Pomocnik: odczytaj double z JSON po kluczu "key": 1234.56       |
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
//| Parsuje ISO 8601 datetime "2026-10-06T12:30:00Z" -> datetime    |
//+------------------------------------------------------------------+
datetime ParseISO8601(string s)
  {
   if(StringLen(s) < 19) return 0;
   // "2026-10-06T12:30:00Z"
   //  0123456789012345678
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
//| Zapisuje plik potwierdzenia done.json                            |
//+------------------------------------------------------------------+
void WriteDone(const SVPSignal &sig, double entryPrice, bool ok)
  {
   int handle = FileOpen(g_doneFile, FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(handle == INVALID_HANDLE) return;
   string body = StringFormat(
     "{\"id\":\"%s\",\"status\":\"%s\",\"entry_executed\":%.2f,\"account\":%I64d,\"time\":\"%s\"}",
     sig.id, ok ? "OPENED" : "ERROR", entryPrice,
     AccountInfoInteger(ACCOUNT_LOGIN),
     TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS));
   FileWriteString(handle, body);
   FileClose(handle);
  }

//+------------------------------------------------------------------+
//| Panel na wykresie                                                |
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

   string panel = StringFormat(
     "TRW VP EA v%s | Magic %I64d%s\n"
     "Syg: %s\n"
     "Poz: TP1=%d TP2=%d TP3=%d\n"
     "Status: %s\n"
     "TP1 hit: %s | TP2 hit: %s",
     VP_EA_VERSION, InpMagic, InpDryRun ? " [TRYB TESTOWY]" : "",
     g_lastSignalId != "" ? g_lastSignalId : "brak",
     tp1c, tp2c, tp3c,
     g_statusMsg,
     g_tp1Hit ? "TAK" : "nie",
     g_tp2Hit ? "TAK" : "nie");

   Comment(panel);
  }
//+------------------------------------------------------------------+
