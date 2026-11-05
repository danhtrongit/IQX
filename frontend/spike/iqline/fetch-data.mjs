// Tải nến thật từ API công khai vào data/ (không commit). Chạy: node spike/iqline/fetch-data.mjs
import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const api = process.env.IQLINE_API ?? "https://iqx.vn/api/v2"
const dir = fileURLToPath(new URL("./data/", import.meta.url))
mkdirSync(dir, { recursive: true })
for (const symbol of ["VNINDEX", "VCB", "FPT", "HPG"]) {
  for (const interval of ["1D", "5m", "1m"]) {
    const response = await fetch(`${api}/market-data/quotes/${symbol}/ohlcv?interval=${interval}&start=2000-01-01`)
    if (!response.ok) throw new Error(`${symbol} ${interval}: ${response.status}`)
    const { data } = await response.json()
    writeFileSync(`${dir}${symbol}-${interval}.json`, JSON.stringify(data))
    console.log(symbol, interval, data.length)
  }
}
