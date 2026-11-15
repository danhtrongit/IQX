import { useState, type ReactNode } from "react"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { AdminLa, AdminLaPatch, AdminQuePatch, Hang } from "@/pages/trading-floor/net/types"
import { HANG_META, HANG_ORDER } from "@/pages/trading-floor/than-tai"

import { useSaveLa, useSaveQue } from "./api"
import { CHOT_MAX_WORDS, LUAN_WORDS, TRIGRAM_LABEL, wordCount } from "./form"

function Field({ id, label, hint, warn, children }: { id: string; label: string; hint?: string; warn?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {hint && <span className={cn("text-xs tabular-nums text-muted-foreground", warn && "text-destructive")}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

type LaDraft = Required<AdminLaPatch>
type QueDraft = Required<AdminQuePatch>

function laDraftOf(la: AdminLa): LaDraft {
  return { tenHao: la.tenHao, haoVan: la.haoVan, haoNghia: la.haoNghia, hang: la.hang, luan: la.luan, chot: la.chot, active: la.active }
}

function queDraftOf(la: AdminLa): QueDraft {
  return { ten: la.queTen, chuHan: la.chuHan, tuong: la.tuong, thoan: la.thoan, thoanNghia: la.thoanNghia }
}

/** Only the fields that changed, so two admins editing different fields do not overwrite each other. */
function changed<T extends object>(draft: T, base: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(draft) as (keyof T)[]) {
    if (draft[key] !== base[key]) out[key] = draft[key]
  }
  return out
}

/** Sửa một lá (hào động, hạng, luận, chốt, bật/tắt) và phần chung của quẻ chứa nó. */
export function LaEditorDialog({ la, sameQue, onClose }: { la: AdminLa; sameQue: number; onClose: () => void }) {
  const saveLa = useSaveLa()
  const saveQue = useSaveQue()
  const [tab, setTab] = useState("la")
  const [laDraft, setLaDraft] = useState<LaDraft>(() => laDraftOf(la))
  const [queDraft, setQueDraft] = useState<QueDraft>(() => queDraftOf(la))
  const busy = saveLa.isPending || saveQue.isPending

  const laPatch = changed(laDraft, laDraftOf(la))
  const quePatch = changed(queDraft, queDraftOf(la))
  const dirty = Object.keys(laPatch).length > 0 || Object.keys(quePatch).length > 0
  const luanWords = wordCount(laDraft.luan)
  const chotWords = wordCount(laDraft.chot)
  const requiredMissing = !laDraft.tenHao.trim() || !laDraft.luan.trim() || !laDraft.chot.trim() || !queDraft.ten.trim() || !queDraft.chuHan.trim()

  async function submit() {
    try {
      if (Object.keys(quePatch).length) await saveQue.mutateAsync({ id: la.queId, patch: quePatch })
      if (Object.keys(laPatch).length) await saveLa.mutateAsync({ id: la.id, patch: laPatch })
      onClose()
    } catch {
      // The mutation hooks already toast the error; keep the dialog open with the draft.
    }
  }

  const setLa = <K extends keyof LaDraft>(key: K, value: LaDraft[K]) => setLaDraft((draft) => ({ ...draft, [key]: value }))
  const setQue = <K extends keyof QueDraft>(key: K, value: QueDraft[K]) => setQueDraft((draft) => ({ ...draft, [key]: value }))

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            #{la.queId} {la.queTen} <span lang="zh">{la.chuHan}</span> · {la.tenHao}
          </DialogTitle>
          <DialogDescription>
            {TRIGRAM_LABEL[la.queTren] ?? la.queTren} trên · {TRIGRAM_LABEL[la.queDuoi] ?? la.queDuoi} dưới · hào động {la.haoDong}. Lá tắt
            không được rút nữa nhưng ai đã gieo hôm nay vẫn xem đủ.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant="line">
            <TabsTrigger value="la">Lá (hào động)</TabsTrigger>
            <TabsTrigger value="que">Quẻ · dùng chung {sameQue} lá</TabsTrigger>
          </TabsList>
          <ScrollArea className="max-h-[60dvh]" viewportClassName="[&>div]:!block">
            <TabsContent value="la" className="space-y-4 pr-3">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                <Field id="tt-ten-hao" label="Tên hào">
                  <Input id="tt-ten-hao" value={laDraft.tenHao} onChange={(e) => setLa("tenHao", e.target.value)} placeholder="Sơ Cửu" />
                </Field>
                <Field id="tt-hang" label="Hạng">
                  <Select value={laDraft.hang} onValueChange={(value) => setLa("hang", value as Hang)}>
                    <SelectTrigger id="tt-hang" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HANG_ORDER.map((hang) => (
                        <SelectItem key={hang} value={hang}>
                          <span className="inline-block size-2.5 rounded-full" style={{ background: HANG_META[hang].color }} />
                          {HANG_META[hang].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <label className="flex h-8 items-center gap-2 text-sm font-medium">
                  <Switch checked={laDraft.active} onCheckedChange={(active) => setLa("active", active)} />
                  Đang bật
                </label>
              </div>
              <Field id="tt-hao-van" label="Hào văn (kinh văn Hán Việt)">
                <Textarea id="tt-hao-van" rows={2} value={laDraft.haoVan} onChange={(e) => setLa("haoVan", e.target.value)} />
              </Field>
              <Field id="tt-hao-nghia" label="Hào nghĩa (một câu)">
                <Textarea id="tt-hao-nghia" rows={2} value={laDraft.haoNghia} onChange={(e) => setLa("haoNghia", e.target.value)} />
              </Field>
              <Field
                id="tt-luan"
                label="Thầy luận"
                hint={`${luanWords} chữ · nên ${LUAN_WORDS.min}–${LUAN_WORDS.max}`}
                warn={luanWords > 0 && (luanWords < LUAN_WORDS.min || luanWords > LUAN_WORDS.max)}
              >
                <Textarea id="tt-luan" rows={5} value={laDraft.luan} onChange={(e) => setLa("luan", e.target.value)} />
              </Field>
              <Field id="tt-chot" label="Lời thầy chốt" hint={`${chotWords}/${CHOT_MAX_WORDS} chữ`} warn={chotWords > CHOT_MAX_WORDS}>
                <Input id="tt-chot" value={laDraft.chot} onChange={(e) => setLa("chot", e.target.value)} />
              </Field>
              <p className="text-xs text-muted-foreground">
                Luận và lời chốt không nêu mã, không dự báo giá hay chỉ số; chỉ nói về cách giao dịch và tâm thế.
              </p>
            </TabsContent>
            <TabsContent value="que" className="space-y-4 pr-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="tt-que-ten" label="Tên quẻ">
                  <Input id="tt-que-ten" value={queDraft.ten} onChange={(e) => setQue("ten", e.target.value)} />
                </Field>
                <Field id="tt-que-han" label="Chữ Hán">
                  <Input id="tt-que-han" lang="zh" value={queDraft.chuHan} onChange={(e) => setQue("chuHan", e.target.value)} />
                </Field>
              </div>
              <Field id="tt-tuong" label="Tượng (tối đa 20 chữ)" hint={`${wordCount(queDraft.tuong)} chữ`} warn={wordCount(queDraft.tuong) > 20}>
                <Textarea id="tt-tuong" rows={2} value={queDraft.tuong} onChange={(e) => setQue("tuong", e.target.value)} />
              </Field>
              <Field id="tt-thoan" label="Thoán (kinh văn)">
                <Textarea id="tt-thoan" rows={2} value={queDraft.thoan} onChange={(e) => setQue("thoan", e.target.value)} />
              </Field>
              <Field id="tt-thoan-nghia" label="Nghĩa thoán (một câu)">
                <Textarea id="tt-thoan-nghia" rows={2} value={queDraft.thoanNghia} onChange={(e) => setQue("thoanNghia", e.target.value)} />
              </Field>
              <p className="text-xs text-muted-foreground">Sửa ở đây đổi nội dung của cả {sameQue} lá thuộc quẻ này.</p>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Hủy
          </Button>
          <Button type="button" disabled={!dirty || busy || requiredMissing} onClick={() => void submit()}>
            {busy && <LoaderCircle className="animate-spin" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
