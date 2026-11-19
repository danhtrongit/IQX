/**
 * Quản trị › Mẫu IQX › Soạn (spec Tab IQX §5.3, §5.4): the admin info frame on top of the REAL Bộ lọc /
 * Backtest form in compose mode. The form reports its definition and its own validation errors through
 * the compose binding; this page only adds the info fields, Lưu nháp and Xuất bản….
 */
import { useId, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, LoaderCircle, RotateCw, Save, Send } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { ReasonDialog } from "@/pages/admin/core/components/reason-dialog"
import { BacktestTab } from "@/pages/strategy/backtest/backtest-tab"
import { FilterTab } from "@/pages/strategy/filter/filter-tab"
import { errorMessage } from "@/pages/strategy/shared/errors"
import {
  IQX_DISCLAIMER,
  IQX_FIELD_LIMITS,
  iqxTitle,
  type FilterComposeBinding,
  type IqxComposeState,
  type IqxInfo,
  type IqxKind,
  type StrategyComposeBinding,
} from "@/pages/strategy/shared/iqx"

import {
  useCreateIqxTemplate,
  useIqxAdminDetail,
  useIqxAdminList,
  usePublishIqxTemplate,
  useSaveIqxDraft,
  type IqxAdminDetail,
  type IqxAdminItem,
  type IqxDraftInput,
} from "./api"
import {
  charCount,
  emptyDefinitionErrors,
  infoErrors,
  isFrameError,
  serverProblem,
  type FieldError,
  type InfoField,
  type ServerProblem,
} from "./compose-checks"
import { DRAFT_SAVED_TOAST, IQX_KIND_LABEL, PUBLISH_ALWAYS, PUBLISH_BODY, iqxListPath } from "./copy"

const NO_PAIR = "__none__"

type Info = IqxInfo & { pair_slug: string | null }
type Base = { id: string | null; current_version: number | null; draft_updated_at: string | null }

const text = (value: unknown) => (typeof value === "string" ? value : "")

export function IqxComposePage() {
  const params = useParams()
  const kind: IqxKind | null = params.kind === "filter" || params.kind === "strategy" ? params.kind : null
  const id = params.id ?? "new"
  const isNew = id === "new"
  const detail = useIqxAdminDetail(kind && !isNew ? id : null)
  const strategies = useIqxAdminList("strategy", kind === "filter")
  const [reload, setReload] = useState(0)

  async function reloadLatest() {
    if (!isNew) await detail.refetch()
    if (kind === "filter") void strategies.refetch()
    setReload((value) => value + 1)
  }

  if (!kind) {
    return (
      <WorkspacePage title="Mẫu IQX">
        <p className="text-sm text-muted-foreground">Không có loại mẫu này.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/iqx-templates">
            <ArrowLeft aria-hidden="true" />
            Về danh sách
          </Link>
        </Button>
      </WorkspacePage>
    )
  }

  if (!isNew && !detail.data) {
    return (
      <WorkspacePage title="Mẫu IQX">
        {detail.error ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">{errorMessage(detail.error)}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void detail.refetch()}>
                <RotateCw aria-hidden="true" />
                Thử lại
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to={iqxListPath(kind)}>Về danh sách</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div role="status" aria-label="Đang tải mục IQX" className="space-y-3">
            <Skeleton className="h-6 w-64 max-w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
      </WorkspacePage>
    )
  }

  return (
    <WorkspacePage title="Mẫu IQX">
      <ComposeEditor
        key={`${id}:${reload}`}
        kind={detail.data?.kind ?? kind}
        detail={isNew ? null : (detail.data ?? null)}
        strategies={strategies.data?.items ?? []}
        onReload={() => void reloadLatest()}
      />
    </WorkspacePage>
  )
}

function ComposeEditor({
  kind,
  detail,
  strategies,
  onReload,
}: {
  kind: IqxKind
  detail: IqxAdminDetail | null
  strategies: IqxAdminItem[]
  onReload: () => void
}) {
  const navigate = useNavigate()
  const create = useCreateIqxTemplate()
  const save = useSaveIqxDraft()
  const publish = usePublishIqxTemplate()

  // Content loaded into the form: the draft, else the current version, else an empty form (§5.3).
  const [loaded] = useState(() => {
    const content = (detail?.draft ?? detail?.current?.content ?? null) as Record<string, unknown> | null
    return { content, fromDraft: !!detail?.draft }
  })
  const [info, setInfo] = useState<Info>(() => ({
    name: text(loaded.content?.name),
    idea: text(loaded.content?.idea),
    origin: text(loaded.content?.origin),
    when_wrong: text(loaded.content?.when_wrong),
    pair_slug: typeof loaded.content?.pair_slug === "string" ? loaded.content.pair_slug : null,
  }))
  const [base, setBase] = useState<Base>(() => ({
    id: detail?.id ?? null,
    current_version: detail?.current_version ?? null,
    draft_updated_at: detail?.draft_updated_at ?? null,
  }))

  const initialDefinition = loaded.content?.definition ?? null
  const definitionRef = useRef<unknown>(initialDefinition)
  // `hasDefinition`: a definition is in hand (loaded, or reported once by the form) for Lưu nháp / Xuất bản.
  const [formState, setFormState] = useState<{ reported: boolean; errors: string[]; hasDefinition: boolean }>(() => ({
    reported: false,
    errors: [],
    hasDefinition: initialDefinition !== null,
  }))
  const binding = useMemo(
    () => ({
      initial: initialDefinition,
      onChange: (state: IqxComposeState<unknown>) => {
        if (state.definition) definitionRef.current = state.definition
        setFormState((previous) => {
          const hasDefinition = previous.hasDefinition || state.definition !== null
          return previous.reported && previous.hasDefinition === hasDefinition && previous.errors.join("\n") === state.errors.join("\n")
            ? previous
            : { reported: true, errors: state.errors, hasDefinition }
        })
      },
    }),
    // The form loads `initial` once; the binding never changes for this editor instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [checked, setChecked] = useState(false)
  const [nameMissing, setNameMissing] = useState(false)
  const [problem, setProblem] = useState<ServerProblem | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const pending = create.isPending || save.isPending || publish.isPending

  const kindLabel = IQX_KIND_LABEL[kind]
  const displayName = info.name.trim() || "Mục mới"
  const nextVersion = (base.current_version ?? 0) + 1
  const visibility = detail?.visibility ?? "shown"

  const statusLine =
    base.current_version === null
      ? "Mục mới · chưa xuất bản"
      : `${visibility === "hidden" ? "Đang ẩn với người dùng" : "Đang hiện với người dùng"} · v${base.current_version}`

  // Errors the client found (shown once Xuất bản… was pressed, then kept live).
  const clientInfoErrors: FieldError[] = checked
    ? infoErrors(info)
    : nameMissing && !info.name.trim()
      ? [{ field: "name", message: "Tên: bắt buộc nhập." }]
      : []
  const definitionErrors: string[] = !checked
    ? []
    : formState.errors.length > 0
      ? formState.errors
      : !formState.hasDefinition
        ? emptyDefinitionErrors(kind)
        : []
  const fieldMessages = (field: string) => [
    ...clientInfoErrors.filter((error) => error.field === field).map((error) => error.message),
    ...(problem?.fields[field] ?? []),
  ]

  function setField<K extends keyof Info>(field: K, value: Info[K]) {
    setInfo((previous) => ({ ...previous, [field]: value }))
  }

  function draftBody(): IqxDraftInput {
    const draft: IqxDraftInput = {
      name: info.name.trim(),
      idea: info.idea,
      origin: info.origin,
      when_wrong: info.when_wrong,
    }
    if (kind === "filter") draft.pair_slug = info.pair_slug
    if (definitionRef.current !== null) draft.definition = definitionRef.current
    return draft
  }

  async function saveDraft() {
    if (pending) return
    if (!info.name.trim()) {
      setNameMissing(true)
      return
    }
    setProblem(null)
    try {
      if (base.id === null) {
        const created = await create.mutateAsync({ kind, draft: draftBody() })
        toast.success(DRAFT_SAVED_TOAST)
        navigate(`/admin/iqx-templates/${kind}/${created.id}`, { replace: true })
        return
      }
      const saved = await save.mutateAsync({ id: base.id, draft: draftBody(), draftUpdatedAt: base.draft_updated_at })
      setBase((previous) => ({ ...previous, draft_updated_at: saved.draft_updated_at }))
      toast.success(DRAFT_SAVED_TOAST)
    } catch (error) {
      setProblem(serverProblem(error))
    }
  }

  function openPublish() {
    if (pending) return
    setChecked(true)
    setProblem(null)
    const errors = infoErrors(info)
    const formErrors = formState.errors.length > 0 ? formState.errors : !formState.hasDefinition ? emptyDefinitionErrors(kind) : []
    if (errors.length > 0 || formErrors.length > 0) return
    setDialogError(null)
    setPublishing(true)
  }

  async function confirmPublish(reason: string) {
    setDialogError(null)
    try {
      let target = base
      if (target.id === null) {
        // A new item that was never saved is created first, then published.
        const created = await create.mutateAsync({ kind, draft: draftBody() })
        target = { id: created.id, current_version: null, draft_updated_at: created.draft_updated_at }
        setBase(target)
      }
      const content = {
        name: info.name.trim(),
        idea: info.idea.trim(),
        origin: info.origin.trim(),
        when_wrong: info.when_wrong.trim(),
        ...(kind === "filter" ? { pair_slug: info.pair_slug } : {}),
        definition: definitionRef.current,
      }
      const published = await publish.mutateAsync({
        id: target.id as string,
        body: { content, reason, expected_version: target.current_version, draft_updated_at: target.draft_updated_at },
      })
      setPublishing(false)
      toast.success(`Đã xuất bản ${iqxTitle(kind, published.name)} (v${published.current_version ?? nextVersion}).`)
      navigate(iqxListPath(kind))
    } catch (error) {
      if (isFrameError(error)) {
        setPublishing(false)
        setProblem(serverProblem(error))
      } else {
        setDialogError(errorMessage(error))
      }
    }
  }

  const pairOptions = strategies
    .filter((item) => item.current_version !== null)
    .sort((a, b) => a.sort_order - b.sort_order)
  const pairMissing = info.pair_slug !== null && !pairOptions.some((item) => item.slug === info.pair_slug)
  const listErrors = [...definitionErrors, ...(problem?.other ?? [])]

  return (
    <div className="space-y-4">
      <section aria-labelledby="iqx-compose-title" className="space-y-4 rounded-lg border border-primary/40 bg-card p-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-wider text-primary">QUẢN TRỊ</p>
          <h2 id="iqx-compose-title" className="font-heading text-lg font-semibold break-words">
            Soạn {kindLabel} · {displayName}
          </h2>
          <p className="text-sm text-muted-foreground">
            {statusLine}
            {loaded.fromDraft ? " · đang mở bản nháp" : ""}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <InfoInput field="name" label="Tên" value={info.name} errors={fieldMessages("name")} onChange={(value) => setField("name", value)} />
          <InfoInput field="idea" label="Ý tưởng" hint="1 câu" value={info.idea} errors={fieldMessages("idea")} onChange={(value) => setField("idea", value)} />
          <InfoInput field="origin" label="Nguồn gốc" multiline value={info.origin} errors={fieldMessages("origin")} onChange={(value) => setField("origin", value)} />
          <InfoInput field="when_wrong" label="Khi nào dễ sai" multiline value={info.when_wrong} errors={fieldMessages("when_wrong")} onChange={(value) => setField("when_wrong", value)} />
          {kind === "filter" && (
            <FieldShell id="iqx-pair" label="Đi cặp với Chiến lược IQX" errors={problem?.fields.pair_slug ?? []}>
              <Select value={info.pair_slug ?? NO_PAIR} onValueChange={(value) => setField("pair_slug", value === NO_PAIR ? null : value)}>
                <SelectTrigger id="iqx-pair" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PAIR}>Không đi cặp</SelectItem>
                  {pairOptions.map((item) => (
                    <SelectItem key={item.id} value={item.slug}>
                      {item.name}
                      {item.status === "hidden" ? " (đã ẩn)" : ""}
                    </SelectItem>
                  ))}
                  {pairMissing && <SelectItem value={info.pair_slug as string}>{info.pair_slug}</SelectItem>}
                </SelectContent>
              </Select>
            </FieldShell>
          )}
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          Dòng “{IQX_DISCLAIMER}” luôn tự thêm khi hiển thị cho người dùng.
        </p>

        {problem && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span role="alert">{problem.message}</span>
              {problem.conflict && (
                <Button type="button" size="sm" variant="outline" onClick={onReload}>
                  <RotateCw aria-hidden="true" />
                  Tải lại
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {listErrors.length > 0 && (
          <ul aria-label="Lỗi kiểm tra" className="list-disc space-y-1 pl-5 text-sm text-destructive">
            {listErrors.map((message, index) => (
              <li key={`${index}-${message}`}>{message}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => navigate(iqxListPath(kind))}>
            Hủy
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => void saveDraft()}>
            {create.isPending || save.isPending ? <LoaderCircle className="animate-spin" /> : <Save aria-hidden="true" />}
            Lưu nháp
          </Button>
          <Button type="button" disabled={pending} onClick={openPublish}>
            <Send aria-hidden="true" />
            Xuất bản…
          </Button>
        </div>
      </section>

      <div className="flex h-[calc(100dvh-10rem)] min-h-[720px] flex-col overflow-hidden rounded-lg border border-border bg-background">
        {kind === "filter" ? (
          <FilterTab compose={binding as FilterComposeBinding} />
        ) : (
          <BacktestTab compose={binding as StrategyComposeBinding} />
        )}
      </div>

      {publishing && (
        <ReasonDialog
          title={`Xuất bản ${iqxTitle(kind, displayName)} (v${nextVersion})?`}
          description={base.current_version === null ? PUBLISH_BODY.new : visibility === "hidden" ? PUBLISH_BODY.hidden : PUBLISH_BODY.shown}
          confirmLabel="Xuất bản"
          reasonLabel="Lý do thay đổi"
          pending={pending}
          error={dialogError}
          onClose={() => setPublishing(false)}
          onSubmit={(reason) => void confirmPublish(reason)}
        >
          <p className="text-sm text-muted-foreground">{PUBLISH_ALWAYS}</p>
        </ReasonDialog>
      )}
    </div>
  )
}

function FieldShell({ id, label, hint, counter, errors, children }: { id: string; label: string; hint?: string; counter?: ReactNode; errors: string[]; children: ReactNode }) {
  const errorId = `${id}-error`
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {hint && <span className="font-normal text-muted-foreground"> · {hint}</span>}
        </Label>
        {counter}
      </div>
      {children}
      {errors.length > 0 && (
        <div id={errorId} className="space-y-0.5">
          {errors.map((message, index) => (
            <p key={`${index}-${message}`} className="text-xs text-destructive">{message}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function InfoInput({
  field,
  label,
  hint,
  multiline = false,
  value,
  errors,
  onChange,
}: {
  field: InfoField
  label: string
  hint?: string
  multiline?: boolean
  value: string
  errors: string[]
  onChange: (value: string) => void
}) {
  const id = `iqx-${field}-${useId()}`
  const max = IQX_FIELD_LIMITS[field]
  const count = charCount(value)
  const props = {
    id,
    value,
    "aria-invalid": errors.length > 0 || undefined,
    "aria-describedby": errors.length > 0 ? `${id}-error` : undefined,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  }
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      errors={errors}
      counter={
        <span className={cn("text-xs tabular-nums", count > max ? "text-destructive" : "text-muted-foreground")}>
          {count}/{max}
        </span>
      }
    >
      {multiline ? <Textarea rows={2} {...props} /> : <Input {...props} />}
    </FieldShell>
  )
}
