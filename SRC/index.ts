import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

type Bar = { time: string; open: number; high: number; low: number; close: number; volume: number };
const SYMBOLS: Record<string, string> = {
  XAUUSD: "GC=F", GOLD: "GC=F", XAGUSD: "SI=F", SILVER: "SI=F",
  EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDJPY: "JPY=X", AUDUSD: "AUDUSD=X",
  USDCAD: "CAD=X", USDCHF: "CHF=X", NZDUSD: "NZDUSD=X",
  BTCUSD: "BTC-USD", BTCUSDT: "BTC-USD", ETHUSD: "ETH-USD", ETHUSDT: "ETH-USD",
  USOIL: "CL=F", WTI: "CL=F", NAS100: "NQ=F", US100: "NQ=F",
  US500: "ES=F", SPX500: "ES=F", US30: "YM=F", DOW: "YM=F"
};
const INTERVALS: Record<string, { interval: string; range: string }> = {
  M1: { interval: "1m", range: "1d" }, M5: { interval: "5m", range: "5d" },
  M15: { interval: "15m", range: "5d" }, M30: { interval: "30m", range: "1mo" },
  H1: { interval: "1h", range: "1mo" }, H4: { interval: "1h", range: "3mo" },
  D1: { interval: "1d", range: "1y" }
};

function resolveSymbol(input: string): string {
  const key = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const symbol = SYMBOLS[key];
  if (!symbol) throw new Error(`Simbol ${input} belum didukung. Contoh: XAUUSD, EURUSD, BTCUSD, USOIL, NAS100.`);
  return symbol;
}
async function candles(symbolInput: string, timeframe = "H1", limit = 100): Promise<Bar[]> {
  const symbol = resolveSymbol(symbolInput);
  const tf = timeframe.toUpperCase();
  const cfg = INTERVALS[tf];
  if (!cfg) throw new Error("Timeframe harus M1, M5, M15, M30, H1, H4, atau D1.");
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${cfg.range}&interval=${cfg.interval}&events=history`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
  if (!response.ok) throw new Error(`Penyedia data pasar mengembalikan HTTP ${response.status}. Coba lagi nanti.`);
  const json: any = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description || "Data candle tidak tersedia untuk simbol/timeframe ini.");
  const q = result.indicators?.quote?.[0];
  const ts: number[] = result.timestamp || [];
  const rows: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q?.open?.[i], h = q?.high?.[i], l = q?.low?.[i], c = q?.close?.[i];
    if ([o,h,l,c].every((v) => typeof v === "number" && Number.isFinite(v))) {
      rows.push({ time: new Date(ts[i] * 1000).toISOString(), open: o, high: h, low: l, close: c, volume: q?.volume?.[i] ?? 0 });
    }
  }
  return rows.slice(-Math.max(1, Math.min(limit, 500)));
}
function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1); const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}
function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) { const d = values[i] - values[i - 1]; if (d > 0) gains += d; else losses -= d; }
  let avgG = gains / period, avgL = losses / period;
  for (let i = period + 1; i < values.length; i++) { const d = values[i] - values[i - 1]; avgG = (avgG * (period - 1) + Math.max(d, 0)) / period; avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period; }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}
function analysis(bars: Bar[]) {
  if (bars.length < 30) throw new Error("Data candle terlalu sedikit untuk analisis yang layak.");
  const closes = bars.map(b => b.close), last = closes.at(-1)!;
  const e9 = ema(closes, 9).at(-1)!, e21 = ema(closes, 21).at(-1)!, e50 = ema(closes, 50).at(-1)!;
  const rv = rsi(closes);
  const recent = bars.slice(-20);
  const support = Math.min(...recent.map(b => b.low));
  const resistance = Math.max(...recent.map(b => b.high));
  const bullish = last > e21 && e9 > e21 && e21 > e50;
  const bearish = last < e21 && e9 < e21 && e21 < e50;
  const bias = bullish ? "BUY BIAS" : bearish ? "SELL BIAS" : "NETRAL / WAIT";
  const notes = [
    `Harga ${last.toFixed(5)}; EMA9 ${e9.toFixed(5)}, EMA21 ${e21.toFixed(5)}, EMA50 ${e50.toFixed(5)}.`,
    `RSI14 ${rv === null ? "belum cukup data" : rv.toFixed(1)}.`,
    `Support perkiraan ${support.toFixed(5)} dan resistance perkiraan ${resistance.toFixed(5)} (20 candle terakhir).`,
    rv !== null && rv >= 70 ? "RSI berada di area overbought; waspadai koreksi." : rv !== null && rv <= 30 ? "RSI berada di area oversold; waspadai pantulan." : "RSI belum berada di area ekstrem."
  ];
  return { bias, last, ema9: e9, ema21: e21, ema50: e50, rsi14: rv, support, resistance, notes };
}

function createServer() {
  const server = new McpServer({ name: "Dana Global Market MCP", version: "1.0.0" });
  server.registerTool("server_status", { description: "Memeriksa status MCP dan daftar kelas aset yang didukung.", inputSchema: {} }, async () => ({ content: [{ type: "text", text: JSON.stringify({ status: "online", server: "Dana Global Market MCP", data: "Yahoo Finance public market feed", symbols: Object.keys(SYMBOLS), timeframes: Object.keys(INTERVALS), account_access: false, trade_execution: false }, null, 2) }] }));
  server.registerTool("get_market_price", { description: "Mengambil harga publik terbaru (indikatif) untuk forex, logam, indeks, minyak, dan kripto.", inputSchema: { symbol: z.string().describe("Contoh XAUUSD, EURUSD, BTCUSD, USOIL, NAS100") } }, async ({ symbol }) => {
    const bars = await candles(symbol, "M1", 2); const last = bars.at(-1)!;
    return { content: [{ type: "text", text: JSON.stringify({ requested_symbol: symbol.toUpperCase(), yahoo_symbol: resolveSymbol(symbol), price: last.close, candle_time: last.time, note: "Harga publik indikatif, bukan kuotasi broker Dana Global; dapat tertunda/berbeda." }, null, 2) }] };
  });
  server.registerTool("get_candles", { description: "Mengambil OHLCV candle historis berdasarkan simbol dan timeframe.", inputSchema: { symbol: z.string(), timeframe: z.enum(["M1","M5","M15","M30","H1","H4","D1"]).default("H1"), limit: z.number().int().min(10).max(500).default(100) } }, async ({ symbol, timeframe, limit }) => {
    const rows = await candles(symbol, timeframe, limit);
    return { content: [{ type: "text", text: JSON.stringify({ symbol: symbol.toUpperCase(), timeframe, count: rows.length, candles: rows, note: "H4 dibentuk dari interval 1 jam; feed publik indikatif." }) }] };
  });
  server.registerTool("analyze_market", { description: "Analisis teknikal EMA9/21/50, RSI14, support/resistance dan bias BUY/SELL/NETRAL. Bukan jaminan profit.", inputSchema: { symbol: z.string(), timeframe: z.enum(["M5","M15","M30","H1","H4","D1"]).default("H1") } }, async ({ symbol, timeframe }) => {
    const bars = await candles(symbol, timeframe, 150); const result = analysis(bars);
    return { content: [{ type: "text", text: JSON.stringify({ symbol: symbol.toUpperCase(), timeframe, ...result, explanation: result.notes, risk_warning: "Bias bukan sinyal pasti. Tunggu konfirmasi price action, periksa spread/news, tentukan stop-loss, dan batasi risiko per transaksi." }, null, 2) }] };
  });
  server.registerTool("calculate_position_size", { description: "Menghitung ukuran posisi berdasarkan modal, risiko persen, jarak stop loss dan nilai per point yang diberikan pengguna.", inputSchema: { balance: z.number().positive(), risk_percent: z.number().positive().max(100), stop_loss_points: z.number().positive(), value_per_point_per_lot: z.number().positive() } }, async ({ balance, risk_percent, stop_loss_points, value_per_point_per_lot }) => {
    const riskAmount = balance * risk_percent / 100;
    const lots = riskAmount / (stop_loss_points * value_per_point_per_lot);
    return { content: [{ type: "text", text: JSON.stringify({ balance, risk_percent, risk_amount: riskAmount, stop_loss_points, value_per_point_per_lot, position_size_lots: lots, note: "Pastikan nilai per point sesuai spesifikasi kontrak broker dan ukuran lot instrumen." }, null, 2) }] };
  });
  server.registerTool("calculate_risk_reward", { description: "Menghitung risiko, potensi reward dan rasio risk/reward dari entry, stop loss, dan take profit.", inputSchema: { entry: z.number().positive(), stop_loss: z.number().positive(), take_profit: z.number().positive() } }, async ({ entry, stop_loss, take_profit }) => {
    const risk = Math.abs(entry - stop_loss), reward = Math.abs(take_profit - entry);
    return { content: [{ type: "text", text: JSON.stringify({ entry, stop_loss, take_profit, risk_distance: risk, reward_distance: reward, risk_reward_ratio: risk === 0 ? null : reward / risk, direction_check: (stop_loss < entry && take_profit > entry) || (stop_loss > entry && take_profit < entry) ? "levels appear consistent" : "check whether SL/TP match the intended trade direction" }, null, 2) }] };
  });
  return server;
}

export default {
  fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") return new Response(JSON.stringify({ name: "Dana Global Market MCP", status: "online", endpoint: "/mcp" }), { headers: { "content-type": "application/json" } });
    if (url.pathname !== "/mcp") return new Response("Not found. MCP endpoint: /mcp", { status: 404 });
    return createMcpHandler(createServer())(request, env, ctx);
  }
};
