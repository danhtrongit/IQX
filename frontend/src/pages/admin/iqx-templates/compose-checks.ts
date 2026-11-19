/**
 * Checks of the admin info frame (spec Tab IQX §5.3, §5.4). Same rules and sentences as the backend
 * (`iqx-templates.validation.ts › infoErrors`) so the admin sees the error before the server does.
 */
import { errorDetails, errorMessage, isApiError } from "@/pages/strategy/shared/errors"
import { IQX_FIELD_LIMITS, type IqxInfo, type IqxKind } from "@/pages/strategy/shared/iqx"

import { CONFLICT_MESSAGE } from "./copy"

export type InfoField = keyof IqxInfo
export type FieldError = { field: string; message: string }

export const INFO_FIELDS: InfoField[] = ["name", "idea", "origin", "when_wrong"]
export const INFO_LABEL: Record<InfoField, string> = {
  name: "Tên",
  idea: "Ý tưởng",
  origin: "Nguồn gốc",
  when_wrong: "Khi nào dễ sai",
}

/** "1 câu": no sentence end followed by another sentence (backend regex). */
const MORE_THAN_ONE_SENTENCE = /[.!?…]\s+\S/u

export const charCount = (value: string) => [...value].length

export function infoErrors(info: IqxInfo): FieldError[] {
  const errors: FieldError[] = []
  for (const field of INFO_FIELDS) {
    const value = info[field].trim()
    const max = IQX_FIELD_LIMITS[field]
    if (!value) errors.push({ field, message: `${INFO_LABEL[field]}: bắt buộc nhập.` })
    else if ([...value].length > max) errors.push({ field, message: `${INFO_LABEL[field]}: tối đa ${max} ký tự.` })
  }
  const idea = info.idea.trim()
  if (idea && MORE_THAN_ONE_SENTENCE.test(idea)) errors.push({ field: "idea", message: "Ý tưởng: chỉ viết 1 câu." })
  return errors
}

/** Errors of an empty form when the tab never reported a definition (same sentences as the forms). */
export function emptyDefinitionErrors(kind: IqxKind): string[] {
  return kind === "filter" ? ["Bộ lọc cần ít nhất một điều kiện."] : ["Chưa bật chỉ báo Mua nào.", "Chưa bật chỉ báo Bán nào."]
}

export type ServerProblem = {
  conflict: boolean
  message: string
  /** Errors next to an info field (name, idea, origin, when_wrong, pair_slug). */
  fields: Record<string, string[]>
  /** Definition errors and anything else, listed in the frame. */
  other: string[]
}

const FRAME_FIELDS = new Set<string>([...INFO_FIELDS, "pair_slug"])

export function serverProblem(error: unknown): ServerProblem {
  const conflict = isApiError(error, 409, "IQX_TEMPLATE_CONFLICT")
  const message = conflict ? CONFLICT_MESSAGE : errorMessage(error)
  const fields: Record<string, string[]> = {}
  const other: string[] = []
  for (const item of errorDetails(error)) {
    if (typeof item.message !== "string") continue
    const field = typeof item.field === "string" ? item.field : ""
    if (FRAME_FIELDS.has(field)) (fields[field] ??= []).push(item.message)
    else if (item.message !== message) other.push(item.message)
  }
  return { conflict, message, fields, other }
}

/** Errors the frame handles itself (closed dialog, messages in the frame); anything else stays in the dialog. */
export function isFrameError(error: unknown): boolean {
  return (
    isApiError(error, 409, "IQX_TEMPLATE_CONFLICT") ||
    isApiError(error, 409, "IQX_TEMPLATE_NAME_TAKEN") ||
    isApiError(error, 422, "IQX_TEMPLATE_INVALID")
  )
}
