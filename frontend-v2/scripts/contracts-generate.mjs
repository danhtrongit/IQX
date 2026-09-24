import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repo = path.resolve(root, "..")
const schemaFile = path.join(repo, "backend-v2/contracts/openapi-v2.json")
const backendTypes = path.join(repo, "backend-v2/contracts/client/types.gen.ts")
const generated = path.join(root, "src/lib/generated")
const contracts = path.join(root, "contracts")
const check = process.argv.includes("--check")

const upstreamAvailable = !process.argv.includes("--pinned") && fs.existsSync(schemaFile) && fs.existsSync(backendTypes)
if (!upstreamAvailable && !check) throw new Error("Generation requires the sibling backend-v2 canonical contracts. CI can validate the pinned snapshot with --check.")
const schema = JSON.parse(fs.readFileSync(upstreamAvailable ? schemaFile : path.join(contracts, "openapi-v2.json"), "utf8"))
const sourceTypes = fs.readFileSync(upstreamAvailable ? backendTypes : path.join(generated, "backend-v2.ts"), "utf8")
const exported = new Set([...sourceTypes.matchAll(/^export type ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]))
const operationType = (operation, suffix) => {
  const pascal = operation.operationId.replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => c?.toUpperCase() || "").replace(/^./, c => c.toUpperCase())
  const name = [...exported].find(value => value.toLowerCase() === `${pascal}${suffix}`.toLowerCase())
  if (!name) throw new Error(`Generated operation type missing for ${operation.operationId}:${suffix}`)
  return name
}
const keyFor = (method, route) => `${method.toUpperCase()} ${route}`
const operations = {}
for (const [route, item] of Object.entries(schema.paths ?? {})) {
  if (!route.startsWith("/api/v2/")) continue
  for (const [method, operation] of Object.entries(item)) {
    if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) continue
    operations[keyFor(method, route)] = {
      operationId: operation.operationId ?? null,
      requestType: operationType(operation, "Data"),
      responseType: operationType(operation, "Responses"),
    }
  }
}

function write(file, content) {
  if (check) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
    if (current !== content) throw new Error(`contract drift: ${path.relative(repo, file)}`)
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
}

write(path.join(generated, "types.gen.ts"), "// Compatibility type re-export; backend-v2.ts is the single generated source.\nexport type * from \"./backend-v2\"\n")
write(path.join(generated, "backend-v2.ts"), `${sourceTypes.trimEnd()}\n`)
const schemaText = `${JSON.stringify(schema, null, 2)}\n`
write(path.join(contracts, "openapi-v2.json"), schemaText)
write(path.join(contracts, "source-lock.json"), `${JSON.stringify({
  source: "backend-v2/contracts/openapi-v2.json",
  schemaSha256: createHash("sha256").update(schemaText).digest("hex"),
  typesSha256: createHash("sha256").update(`${sourceTypes.trimEnd()}\n`).digest("hex"),
}, null, 2)}\n`)
write(path.join(generated, "index.ts"), "export * from \"./backend-v2\"\nexport * from \"./operation-map\"\n")

const sorted = Object.fromEntries(Object.entries(operations).sort(([a], [b]) => a.localeCompare(b)))
const mapJson = {
  schema: "backend-v2/contracts/openapi-v2.json",
  generatedTypes: "backend-v2/contracts/client/types.gen.ts",
  operations: sorted,
}
write(path.join(contracts, "api-manifest.json"), `${JSON.stringify(mapJson, null, 2)}\n`)

write(path.join(generated, "operation-map.ts"), `import type * as T from \"./backend-v2\"\n\n/** Generated from backend-v2/contracts/openapi-v2.json. */\nexport interface OperationMap {\n${Object.entries(sorted).map(([key, value]) => `  ${JSON.stringify(key)}: { request: T.${value.requestType}; response: T.${value.responseType}[keyof T.${value.responseType}] }`).join("\n")}\n}\n\nexport const operationMap: Record<keyof OperationMap, { request: string; response: string }> = {\n${Object.entries(sorted).map(([key, value]) => `  ${JSON.stringify(key)}: { request: ${JSON.stringify(value.requestType)}, response: ${JSON.stringify(value.responseType)} },`).join("\n")}\n}\n`)

const sourceFiles = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "dist") walk(file)
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(file)
  }
}
walk(path.join(root, "src"))
const calls = []
const relativePath = (value) => {
  if (!value || !value.startsWith("/")) return null
  const noQuery = value.split("?", 1)[0]
  if (noQuery.startsWith("/api/v2/")) return noQuery
  return `${"/api/v2"}${noQuery}`
}
const templatePath = (node) => {
  if (!node) return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span) => {
    if (ts.isConditionalExpression(span.expression) && /^['"`]\?/.test(span.expression.whenTrue.getText())) return `?query${span.literal.text}`
    return `{${span.expression.getText().replace(/[{}]/g, "")}}${span.literal.text}`
  }).join("")
  return null
}
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, "utf8")
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["api", "sharedApi", "apiResponse", "apiUpload", "fetch", "postPlan", "nullable", "get", "getOrNull", "requestOperation", "requestOperationResponse"].includes(node.expression.text)) {
      const raw = templatePath(node.arguments[0])
      if (raw) {
        const methodArg = node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1]) ? node.arguments[1].properties.find((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "method") : null
        let method = methodArg && ts.isPropertyAssignment(methodArg) && ts.isStringLiteral(methodArg.initializer) ? methodArg.initializer.text.toUpperCase() : "GET"
        if (["apiUpload", "postPlan"].includes(node.expression.text)) method = "POST"
        if (["requestOperation", "requestOperationResponse"].includes(node.expression.text) && sorted[raw]) {
          calls.push({ file: path.relative(root, file), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, callee: node.expression.text, raw, method: raw.slice(0, raw.indexOf(" ")), route: raw.slice(raw.indexOf(" ") + 1) })
          return
        }
        const options = node.arguments[1]
        if (options && ts.isCallExpression(options) && ts.isIdentifier(options.expression)) {
          const helper = sf.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === options.expression.text)
          const returned = helper?.body?.statements.find(statement => ts.isReturnStatement(statement))?.expression
          const property = returned && ts.isObjectLiteralExpression(returned) ? returned.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText() === 'method') : undefined
          if (property && ts.isStringLiteral(property.initializer)) method = property.initializer.text.toUpperCase()
        }
        const resolvedRaw = raw.replaceAll("{API_BASE}", "/api/v2").replaceAll("{ADMIN_BASE}", "/virtual-trading/admin").replaceAll("{ACCOUNT_BASE}", "/admin/vt/accounts")
        calls.push({ file: path.relative(root, file), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, callee: node.expression.text, raw, method, route: relativePath(resolvedRaw) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}
const routePattern = (route) => route?.replace(/\{[^}]+\}/g, "{param}").replace(/[.*+?^$()[\]\\]/g, "\\$&").replaceAll("{param}", "[^/]+")
const matchesFor = (call) => {
  if (!call.route) return []
  return Object.keys(sorted).filter((key) => {
    if (!key.startsWith(`${call.method} `)) return false
    const route = key.slice(key.indexOf(" ") + 1)
    return new RegExp(`^${routePattern(route)}$`).test(call.route.replace(/\{[^}]+\}/g, "param"))
      || new RegExp(`^${routePattern(call.route)}$`).test(route)
  })
}
const classify = (call) => {
  if (/\.test\.[^.]+$/.test(call.file) || call.file.includes("/test-harness/")) return "test-only"
  if (call.raw.includes("/api/test-harness/")) return "test-harness"
  if (call.raw.includes("health")) return "health"
  if (call.raw.includes("/auth/refresh")) return "client-auth-refresh"
  if (call.raw.includes("mascotAssetRoot")) return "asset-fetch"
  if (/\{(?:API_BASE|ADMIN_BASE|ACCOUNT_BASE)\}/.test(call.raw)) return "dynamic-api-base"
  return call.route ? "api-call" : "external-or-dynamic"
}
const inventory = calls.map((call) => {
  const matchedOperations = matchesFor(call)
  return { ...call, matchedOperation: matchedOperations[0] ?? null, matchedOperations, classification: classify(call) }
})
const used = new Set(inventory.filter(x => x.classification !== 'test-only').flatMap((x) => x.matchedOperations))
const endpointInventory = { schema: "backend-v2/contracts/openapi-v2.json", calls: inventory, unmappedCalls: inventory.filter((x) => !x.matchedOperation), unconsumedOperations: Object.keys(sorted).filter((x) => !used.has(x)) }
write(path.join(contracts, "endpoint-inventory.json"), `${JSON.stringify(endpointInventory, null, 2)}\n`)
if (check) {
  const definite = endpointInventory.unmappedCalls.filter((call) => call.classification === "api-call")
  if (definite.length) throw new Error(`unmapped production API calls: ${definite.length} (see contracts/endpoint-inventory.json)`)
}
if (!check) console.log(`generated ${Object.keys(sorted).length} operations; inventoried ${calls.length} calls (${endpointInventory.unmappedCalls.length} unmapped)`)
