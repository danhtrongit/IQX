import { api, apiResponse } from "./api"
import type { ApiOperation, ApiRequestFor, ApiResponseFor } from "./contract-types"

type Request<K extends ApiOperation> = Omit<ApiRequestFor<K>, "url">
type TransportOptions = Pick<RequestInit, "signal" | "headers" | "cache">

/** Serialize an OpenAPI operation through the one authenticated HTTP boundary. */
function serialize<K extends ApiOperation>(key: K, request: Request<K>, options: TransportOptions) {
  const separator = key.indexOf(" ")
  const method = key.slice(0, separator)
  const wire = request as { path?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown }
  const endpoint = key.slice(separator + 1).replace(/^\/api\/v2/, "").replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = wire.path?.[name]
    if (typeof value !== "string" && typeof value !== "number") throw new TypeError(`Missing path parameter: ${name}`)
    return encodeURIComponent(String(value))
  })
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(wire.query ?? {})) {
    if (value === undefined || value === null) continue
    const values = Array.isArray(value) ? value : [value]
    for (const item of values) {
      if (!["string", "number", "boolean"].includes(typeof item)) throw new TypeError(`Invalid query parameter: ${name}`)
      query.append(name, String(item))
    }
  }
  let body: BodyInit | undefined
  if (wire.body instanceof FormData) body = wire.body
  else if (wire.body && typeof wire.body === "object" && Object.values(wire.body).some(value => value instanceof Blob)) {
    const form = new FormData()
    for (const [name, value] of Object.entries(wire.body)) {
      if (value === undefined || value === null) continue
      if (value instanceof Blob) form.append(name, value)
      else if (["string", "number", "boolean"].includes(typeof value)) form.append(name, String(value))
      else throw new TypeError(`Invalid multipart field: ${name}`)
    }
    body = form
  } else if (wire.body !== undefined) body = JSON.stringify(wire.body)
  return { path: `${endpoint}${query.size ? `?${query}` : ""}`, options: { ...options, method, body } }
}

/** Typed access to every canonical JSON operation, without a second API client. */
export function requestOperation<K extends ApiOperation>(key: K, request: Request<K>, options: TransportOptions = {}): Promise<ApiResponseFor<K>> {
  const serialized = serialize(key, request, options)
  return api<ApiResponseFor<K>>(serialized.path, serialized.options)
}

/** Same typed request contract for CSV, signed media and other raw responses. */
export function requestOperationResponse<K extends ApiOperation>(key: K, request: Request<K>, options: TransportOptions = {}): Promise<Response> {
  const serialized = serialize(key, request, options)
  return apiResponse(serialized.path, serialized.options)
}
