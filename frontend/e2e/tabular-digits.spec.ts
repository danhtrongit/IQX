import { expect, test } from "./fixtures"

const WEIGHTS = [400, 500, 600, 700]

test("tabular-nums makes every digit the same width, default digits stay proportional", async ({ page }) => {
  const fontRequests: string[] = []
  page.on("request", request => {
    if (/\.woff2?(\?|$)/.test(request.url())) fontRequests.push(request.url())
  })
  await page.goto("/about")
  const widths = await page.evaluate(async weights => {
    const measure = (digit: string, weight: number, tabular: boolean) => {
      const span = document.createElement("span")
      span.textContent = digit.repeat(10)
      span.className = tabular ? "tabular-nums" : ""
      span.style.cssText = `position:absolute;font-family:"Be Vietnam Pro";font-weight:${weight};font-size:40px;`
      document.body.append(span)
      const width = span.getBoundingClientRect().width
      span.remove()
      return width
    }
    await Promise.all(weights.map(weight => document.fonts.load(`${weight} 40px "Be Vietnam Pro"`, "0123456789")))
    return weights.map(weight => {
      const digits = [..."0123456789"]
      return {
        weight,
        tabular: digits.map(digit => measure(digit, weight, true)),
        proportional: digits.map(digit => measure(digit, weight, false)),
      }
    })
  }, WEIGHTS)

  for (const { tabular, proportional } of widths) {
    expect(Math.max(...tabular) - Math.min(...tabular)).toBeLessThan(0.01)
    expect(Math.max(...proportional) - Math.min(...proportional)).toBeGreaterThan(50)
  }
  const patched = /assets\/fonts\/be-vietnam-pro\/be-vietnam-pro-latin-\d00-normal\.woff2/
  expect(fontRequests.some(url => patched.test(url))).toBe(true)
  expect(fontRequests.filter(url => /@fontsource\/be-vietnam-pro\/files\/be-vietnam-pro-latin-\d00/.test(url))).toEqual([])
})

test("price board decimal points line up in a column", async ({ page }) => {
  const symbols = ["AAA", "BBB", "CCC"]
  const prices = [111_100, 44_440, 80_850]
  await page.route("**/api/v2/market-data/reference/groups/*/symbols", route => route.fulfill({ json: { data: symbols } }))
  await page.route("**/api/v2/market-data/trading/price-board", route => route.fulfill({
    json: {
      data: symbols.map((symbol, index) => ({
        symbol,
        exchange: "HOSE",
        reference_price: prices[index],
        ceiling_price: prices[index],
        floor_price: prices[index],
        close_price: prices[index],
      })),
      meta: {},
    },
  }))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/demo-trading?content=board&view=trading")
  await expect(page.getByRole("link", { name: "CCC" })).toBeVisible()

  const positions = await page.getByRole("row").filter({ has: page.getByRole("link", { name: /^(AAA|BBB|CCC)$/ }) }).evaluateAll(async rows => {
    await document.fonts.ready
    return rows.map(row => {
      const text = row.querySelectorAll("td")[1].firstChild as Text
      const range = document.createRange()
      const dot = text.data.indexOf(".")
      range.setStart(text, dot)
      range.setEnd(text, dot + 1)
      return range.getBoundingClientRect().left
    })
  })
  expect(positions).toHaveLength(3)
  expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(0.1)
})
