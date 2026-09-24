import type { OperationMap } from "./generated/operation-map"

/** Response payload for a generated `METHOD /api/v2/path` contract key. */
export type ApiResponseFor<K extends keyof OperationMap> = OperationMap[K]["response"]

/** Generated operation input: path/query/body and its canonical URL. */
export type ApiRequestFor<K extends keyof OperationMap> = OperationMap[K]["request"]

export type ApiOperation = keyof OperationMap
