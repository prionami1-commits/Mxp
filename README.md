# Dana Global Market MCP — Cloudflare Workers

Remote MCP server untuk Claude AI melalui satu endpoint HTTPS `/mcp`. Proyek ini khusus **data pasar publik dan analisis teknikal**. Tidak membaca akun MT5, saldo, equity, posisi, riwayat transaksi, dan tidak dapat membuka/menutup order.

## Tools yang tersedia

- `server_status` — status server dan instrumen/timeframe.
- `get_market_price` — harga publik indikatif.
- `get_candles` — data OHLCV.
- `analyze_market` — EMA 9/21/50, RSI 14, support/resistance sederhana, bias BUY/SELL/NETRAL.
- `calculate_position_size` — kalkulator ukuran posisi.
- `calculate_risk_reward` — kalkulator rasio risiko/imbalan.

Instrumen: XAUUSD, XAGUSD, major forex, BTCUSD, ETHUSD, USOIL, NAS100, US500, US30. Timeframe: M1, M5, M15, M30, H1, H4, D1. Ketersediaan data intraday bergantung feed publik. H4 memakai candle H1 sebagai sumber dan bukan candle H4 broker.

## Deploy dengan GitHub + Cloudflare

1. Unggah seluruh isi folder ZIP ini ke repository GitHub `Mxp` pada branch `main` (bukan folder ZIP di dalam repository; ekstrak dulu ZIP, lalu unggah isi folder).
2. Di Cloudflare Dashboard buka **Workers & Pages** → pilih Worker yang terhubung ke repo tersebut.
3. Build command: `npm install` (atau `npm ci` bila lockfile tersedia).
4. Deploy command: `npx wrangler deploy`.
5. Pastikan root directory kosong atau `/`, lalu simpan dan jalankan deployment.
6. Setelah berhasil, endpoint menjadi `https://NAMA-WORKER.SUBDOMAIN.workers.dev/mcp`.
7. Tes health di `https://NAMA-WORKER.SUBDOMAIN.workers.dev/health` (harus menampilkan JSON status online).

Alternatif dari komputer dengan Node.js: `npm install`, lalu `npm run deploy`. Wrangler akan meminta login Cloudflare jika belum login.

## Hubungkan ke Claude

Di Claude.ai buka **Settings → Connectors → Add custom connector** (nama menu dapat berubah), pilih remote MCP/server URL dan masukkan URL penuh `https://...workers.dev/mcp`. Simpan dan izinkan koneksi. Jika akun/antarmuka Claude Anda belum menyediakan custom remote MCP connector, deployment tetap bisa dites memakai MCP Inspector atau client MCP Streamable HTTP.

## Catatan penting

- Tidak perlu API key untuk versi publik ini.
- Yahoo Finance adalah sumber data pihak ketiga. Harga dapat tertunda, tidak lengkap, dan berbeda dari harga broker Dana Global Limited / MT5.
- Bias BUY/SELL adalah hasil indikator sederhana, bukan rekomendasi pasti atau jaminan profit.
- Jangan masukkan username, password, investor password, token, atau tautan login MT5 ke repository GitHub. Server ini tidak membutuhkan kredensial broker.
- Karena endpoint ini tanpa autentikasi, siapa pun yang mengetahui URL dapat memanggil tool publiknya. Jangan menambahkan data pribadi atau tool transaksi tanpa lapisan autentikasi dan otorisasi.

## Struktur

```text
src/index.ts       # Worker + MCP tools
package.json       # Dependencies and scripts
wrangler.jsonc     # Cloudflare Worker configuration
tsconfig.json      # TypeScript configuration
README.md          # This guide
```
