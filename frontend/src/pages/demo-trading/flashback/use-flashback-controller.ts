/**
 * Bộ điều khiển của Flashback v2 "Phòng chơi": giữ màn đang mở (Sảnh, Phòng chờ, Màn chơi) và
 * trạng thái ván dùng chung giữa vùng chính và panel phải (spec v2 §1, §2, §4, §6, §7).
 *
 * Vào màn hình thì hỏi `rooms/me` để chơi tiếp phòng đang dở. Sảnh làm mới mỗi 3 giây, phòng chờ
 * và trạng thái ván làm mới mỗi 2 giây (spec cho phép "làm mới mỗi vài giây"); đồng hồ của ván do
 * server quyết định, trình duyệt chỉ đếm lùi từ mốc server gửi.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { useAuth } from "@/hooks/use-auth"
import { ApiError } from "@/lib/api"

import { SHOP_QUERY_ROOT } from "../shop/shop-model"
import { useShopState } from "../shop/use-shop"
import {
  createRoom as createRoomRequest,
  fetchMatch,
  fetchMatchResult,
  fetchMatchState,
  fetchMyRoom,
  fetchRoom,
  fetchRooms,
  finishMatch,
  joinRoom as joinRoomRequest,
  leaveRoom,
  nextBar,
  placeOrder,
  randomJoinRoom,
  replayRoom,
  startRoom,
  type FlashbackCreateRoomBody,
  type FlashbackIndicatorParams,
  type FlashbackMatchState,
  type FlashbackOrderSide,
  type FlashbackRoom,
  type FlashbackRoomFilter,
  type FlashbackSnapshot,
} from "./flashback-api"
import type {
  ChartIndicator,
  FlashbackContextValue,
  FlashbackPhase,
  JoinOutcome,
  LocalIndicator,
  MatchApi,
} from "./flashback-context"
import { loadStoredIndicators, saveStoredIndicators } from "./flashback-indicator-store"
import { computeIndicator, defaultParams, validateParams } from "./flashback-indicators"
import {
  ROOM_CODE_ERROR,
  formatNumber,
  indicatorColor,
  instanceShortLabel,
  isRoomCode,
  orderError,
} from "./flashback-model"
import {
  applyFinish,
  applyFinishToState,
  applyNext,
  applyOrder,
  flashbackKeys,
  useFlashbackIndicators,
} from "./use-flashback"

type Place =
  | { phase: "boot" }
  | { phase: "lobby" }
  | { phase: "room"; code: string }
  | { phase: "match"; code: string; matchId: string; fresh: boolean }

const LOBBY: Place = { phase: "lobby" }
const NO_USER = ""

/** Màn mở ra khi vào Flashback: phòng chờ, ván đang dở (kể cả ván đã kết thúc chưa rời) hoặc sảnh. */
function placeFromRoom(room: FlashbackRoom | null): Place {
  if (!room) return LOBBY
  if (room.status === "playing" && room.match?.joined) {
    return { phase: "match", code: room.id, matchId: room.match.id, fresh: false }
  }
  return { phase: "room", code: room.id }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback
}

function codeOf(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined
}

/** Server báo mình không còn trong phòng hoặc ván này (bị đưa ra, phòng đóng, ván không còn). */
function isGone(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404)
}

function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
  }
}

export function useFlashbackController(): FlashbackContextValue {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  const queryClient = useQueryClient()
  const shop = useShopState()
  const balance = shop.data?.wallet?.balance ?? null

  const [place, setPlace] = useState<Place>({ phase: "boot" })
  const phase: FlashbackPhase = place.phase
  const roomCode = place.phase === "room" || place.phase === "match" ? place.code : null
  const matchId = place.phase === "match" ? place.matchId : null

  // ------------------------------------------------------------------ vào màn hình

  /** Hỏi server mình đang ở đâu; thông báo một lần (ví dụ bị đưa ra vì thiếu xu) hiện ngay tại đây. */
  const loadMine = useCallback(
    async (signal?: AbortSignal) => {
      const mine = await fetchMyRoom(signal)
      if (mine.notice) toast.info(mine.notice)
      if (mine.room) queryClient.setQueryData(flashbackKeys.room(userId, mine.room.id), mine.room)
      return mine
    },
    [queryClient, userId],
  )

  const mineQuery = useQuery({
    queryKey: flashbackKeys.mine(userId),
    enabled: !!userId && place.phase === "boot",
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => loadMine(signal),
  })

  if (place.phase === "boot" && mineQuery.data) {
    setPlace(placeFromRoom(mineQuery.data.room))
  }

  /** Không còn trong phòng: đồng bộ lại với server (kèm thông báo nếu có) rồi về đúng màn. */
  const resync = useCallback(async () => {
    try {
      const mine = await queryClient.fetchQuery({
        queryKey: flashbackKeys.mine(userId),
        queryFn: ({ signal }) => loadMine(signal),
        staleTime: 0,
      })
      setPlace(placeFromRoom(mine.room))
    } catch {
      setPlace(LOBBY)
    }
  }, [loadMine, queryClient, userId])

  /** Chạy một lần đọc phòng hoặc ván; server báo không còn trong đó thì đồng bộ lại ngay khi lỗi về. */
  const guarded = useCallback(
    async <T>(read: () => Promise<T>): Promise<T> => {
      try {
        return await read()
      } catch (error) {
        if (isGone(error)) void resync()
        throw error
      }
    },
    [resync],
  )

  const refetchMine = mineQuery.refetch
  const retryBoot = useCallback(() => {
    void refetchMine()
  }, [refetchMine])

  // ------------------------------------------------------------------ sảnh

  const [filter, setFilter] = useState<FlashbackRoomFilter>("all")
  const roomsQuery = useQuery({
    queryKey: flashbackKeys.rooms(userId, filter),
    enabled: !!userId && place.phase === "lobby",
    refetchInterval: 3_000,
    staleTime: 0,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => (await fetchRooms(filter, signal)).rooms,
  })

  const enterRoom = useCallback(
    (room: FlashbackRoom) => {
      queryClient.setQueryData(flashbackKeys.room(userId, room.id), room)
      setPlace({ phase: "room", code: room.id })
    },
    [queryClient, userId],
  )

  const joinMutation = useMutation({
    mutationFn: (input: { code: string; password?: string }) => joinRoomRequest(input.code, input.password),
  })
  const randomMutation = useMutation({ mutationFn: randomJoinRoom })
  const createMutation = useMutation({ mutationFn: (body: FlashbackCreateRoomBody) => createRoomRequest(body) })

  const join = useCallback(
    async (code: string, password?: string): Promise<JoinOutcome> => {
      try {
        const room = await joinMutation.mutateAsync({ code, password })
        enterRoom(room)
        return { status: "joined" }
      } catch (error) {
        const message = messageOf(error, "Chưa vào được phòng. Thử lại.")
        const kind = codeOf(error)
        if (kind === "PASSWORD_REQUIRED") return { status: "password", wrong: false, message }
        if (kind === "WRONG_PASSWORD") return { status: "password", wrong: true, message }
        toast.error(message)
        // Đang ở một phòng khác: chơi tiếp phòng đó thay vì kẹt ở sảnh.
        if (kind === "ALREADY_IN_ROOM") void resync()
        return { status: "failed", message }
      }
    },
    [enterRoom, joinMutation, resync],
  )

  const joinById = useCallback(
    async (raw: string): Promise<JoinOutcome | null> => {
      const code = raw.trim()
      if (!isRoomCode(code)) {
        toast.error(ROOM_CODE_ERROR)
        return null
      }
      return join(code)
    },
    [join],
  )

  const randomJoin = useCallback(() => {
    randomMutation.mutate(undefined, {
      onSuccess: enterRoom,
      onError: (error) => {
        toast.error(messageOf(error, "Chưa có phòng mở phù hợp, hãy tạo phòng"))
        if (codeOf(error) === "ALREADY_IN_ROOM") void resync()
      },
    })
  }, [enterRoom, randomMutation, resync])

  const createRoom = useCallback(
    async (body: FlashbackCreateRoomBody): Promise<string | null> => {
      try {
        const room = await createMutation.mutateAsync(body)
        enterRoom(room)
        return null
      } catch (error) {
        if (codeOf(error) === "ALREADY_IN_ROOM") void resync()
        return messageOf(error, "Chưa tạo được phòng. Thử lại.")
      }
    },
    [createMutation, enterRoom, resync],
  )

  // ------------------------------------------------------------------ ván chơi

  const sawPlaying = useRef(new Set<string>())
  const snapshotQuery = useQuery({
    queryKey: flashbackKeys.match(userId, matchId ?? ""),
    enabled: !!userId && matchId !== null,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => guarded(() => fetchMatch(matchId ?? "", signal)),
  })
  const stateQuery = useQuery({
    queryKey: flashbackKeys.state(userId, matchId ?? ""),
    enabled: !!userId && matchId !== null,
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) => guarded(() => fetchMatchState(matchId ?? "", signal)),
    // Ván đã kết thúc thì thôi hỏi: trạng thái không còn đổi.
    refetchInterval: (query) => (query.state.data?.status === "ended" ? false : 2_000),
  })

  const refetchState = stateQuery.refetch
  const refetchSnapshot = snapshotQuery.refetch
  const snapshot = snapshotQuery.data
  const matchState = stateQuery.data
  const ended = matchState?.status === "ended" || snapshot?.status === "ended"
  const snapshotEnded = snapshot?.status === "ended"

  // Mình đã thấy ván này đang chơi (kể cả ván do chính mình bắt đầu, ảnh chụp đầu đến từ lệnh bắt đầu
  // chứ không phải từ lần đọc ván): chỉ người đang ở trong ván lúc nó hết giờ mới được báo "Hết giờ".
  const playingSeen = snapshot?.status === "playing" || matchState?.status === "playing"
  useEffect(() => {
    if (matchId && playingSeen) sawPlaying.current.add(matchId)
  }, [matchId, playingSeen])

  // Ván vừa kết thúc: lấy lại ảnh chụp cuối (tài khoản chốt, đủ nến) và số dư xu mới.
  useEffect(() => {
    if (!ended || !matchId) return
    void queryClient.invalidateQueries({ queryKey: SHOP_QUERY_ROOT })
  }, [ended, matchId, queryClient])
  useEffect(() => {
    if (!ended || snapshotEnded || !matchId) return
    void queryClient.invalidateQueries({ queryKey: flashbackKeys.match(userId, matchId) })
  }, [ended, snapshotEnded, matchId, queryClient, userId])

  const resultQuery = useQuery({
    queryKey: flashbackKeys.result(userId, matchId ?? ""),
    enabled: !!userId && matchId !== null && ended,
    staleTime: Infinity,
    retry: (count, error) => codeOf(error) === "RESULT_NOT_READY" && count < 8,
    retryDelay: 800,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => fetchMatchResult(matchId ?? "", signal),
  })
  const result = resultQuery.data

  // "Hết giờ" chỉ báo cho người đang ở trong ván lúc nó kết thúc, không báo cho người mở lại ván cũ.
  const timeoutToasted = useRef(new Set<string>())
  useEffect(() => {
    if (!result || result.end_reason !== "timeout") return
    if (!sawPlaying.current.has(result.match_id) || timeoutToasted.current.has(result.match_id)) return
    timeoutToasted.current.add(result.match_id)
    toast.info("Hết giờ")
  }, [result])

  // Màn chơi mới: báo đã trừ cược (hoặc chơi một mình) đúng một lần cho mỗi ván, và lấy lại số dư xu
  // (người vào ván do chủ phòng bắt đầu cũng bị trừ cược mà không tự làm mới ví).
  const freshMatchId = place.phase === "match" && place.fresh ? place.matchId : null
  const freshStake = snapshot?.stake_xu ?? null
  const startedToasts = useRef(new Set<string>())
  useEffect(() => {
    if (!freshMatchId || freshStake === null || startedToasts.current.has(freshMatchId)) return
    startedToasts.current.add(freshMatchId)
    toast.success(freshStake > 0 ? `Bắt đầu · đã trừ ${formatNumber(freshStake)} xu` : "Bắt đầu chơi")
    if (freshStake > 0) void queryClient.invalidateQueries({ queryKey: SHOP_QUERY_ROOT })
  }, [freshMatchId, freshStake, queryClient])

  // ------------------------------------------------------------------ phòng (chờ, và sau ván để bắt ván mới)

  const roomPolling = place.phase === "room" || (place.phase === "match" && ended)
  const roomQuery = useQuery({
    queryKey: flashbackKeys.room(userId, roomCode ?? ""),
    enabled: !!userId && roomCode !== null && roomPolling,
    refetchInterval: place.phase === "room" ? 2_000 : 3_000,
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) => guarded(() => fetchRoom(roomCode ?? "", signal)),
  })
  const room = roomQuery.data

  // Chủ phòng bắt đầu ván: người còn lại sang màn chơi. Ván mới sau "Chơi lại" cũng vậy.
  const roomMatch = room && room.id === roomCode ? room.match : null
  if (roomMatch?.joined && roomMatch.status === "playing") {
    if (place.phase === "room") {
      setPlace({ phase: "match", code: place.code, matchId: roomMatch.id, fresh: true })
    } else if (place.phase === "match" && ended && roomMatch.id !== place.matchId) {
      setPlace({ phase: "match", code: place.code, matchId: roomMatch.id, fresh: true })
    }
  }
  // Một người bấm "Chơi lại": cả phòng về phòng chờ (§7.3). Ai còn ở màn kết quả sang phòng chờ để
  // tự chọn ở lại hay Rời phòng, thay vì bị kéo vào ván mới (và bị trừ cược) khi chủ phòng bắt đầu.
  if (place.phase === "match" && ended && room && room.id === place.code && room.status === "waiting") {
    setPlace({ phase: "room", code: place.code })
  }

  // Có người vào hoặc rời phòng chờ: báo ngắn (§4). Lần tải đầu chỉ lấy mốc so sánh.
  const knownMembers = useRef<{ code: string; members: Map<string, string> } | null>(null)
  useEffect(() => {
    if (place.phase !== "room" || !room || room.id !== place.code) {
      knownMembers.current = null
      return
    }
    const members = new Map(room.members.map((member) => [member.user_id, member.name]))
    const previous = knownMembers.current
    knownMembers.current = { code: room.id, members }
    if (!previous || previous.code !== room.id) return
    for (const member of room.members) {
      if (!previous.members.has(member.user_id) && !member.is_me) toast.info(`${member.name} đã vào phòng`)
    }
    for (const [id, name] of previous.members) {
      if (!members.has(id)) toast.info(`${name} đã rời phòng`)
    }
  }, [place, room])

  const leaveMutation = useMutation({
    mutationFn: (code: string) => leaveRoom(code),
    onSuccess: () => setPlace(LOBBY),
    onError: (error) => {
      // 4xx: server không còn coi mình ở phòng này, về sảnh luôn; lỗi mạng thì ở lại để thử lại.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) setPlace(LOBBY)
      else toast.error(messageOf(error, "Chưa rời được phòng. Thử lại."))
    },
  })
  const leave = useCallback(() => {
    if (roomCode) leaveMutation.mutate(roomCode)
  }, [leaveMutation, roomCode])

  const startMutation = useMutation({
    mutationFn: (code: string) => startRoom(code),
    onSuccess: (started) => {
      queryClient.setQueryData(flashbackKeys.match(userId, started.match.match_id), started.match)
      queryClient.setQueryData(flashbackKeys.room(userId, started.room.id), started.room)
      for (const removed of started.removed) toast.info(`${removed.name} đã rời phòng`)
      setPlace({ phase: "match", code: started.room.id, matchId: started.match.match_id, fresh: true })
    },
    onError: (error) => {
      toast.error(messageOf(error, "Chưa bắt đầu được ván. Thử lại."))
      // Phòng đã đổi (ván đã bắt đầu, mình không còn là chủ phòng...): lấy lại trạng thái thật.
      if (codeOf(error) === "ROOM_CHANGED" || codeOf(error) === "NOT_ROOM_OWNER") void resync()
    },
  })
  const start = useCallback(() => {
    if (roomCode) startMutation.mutate(roomCode)
  }, [roomCode, startMutation])

  const copyId = useCallback(() => {
    if (!roomCode) return
    const fallback = () => toast.info(`ID phòng: ${roomCode}`)
    try {
      navigator.clipboard.writeText(roomCode).then(() => toast.success(`Đã sao chép ID ${roomCode}`), fallback)
    } catch {
      fallback()
    }
  }, [roomCode])

  const replayMutation = useMutation({
    mutationFn: (code: string) => replayRoom(code),
    onSuccess: enterRoom,
    onError: (error) => {
      toast.error(messageOf(error, "Chưa chơi lại được. Thử lại."))
      // Thiếu xu để chơi lại: server đã đưa mình ra khỏi phòng, về sảnh.
      if (codeOf(error) === "XU_INSUFFICIENT") setPlace(LOBBY)
      else if (isGone(error)) void resync()
    },
  })
  const playAgain = useCallback(() => {
    if (roomCode) replayMutation.mutate(roomCode)
  }, [replayMutation, roomCode])

  // ------------------------------------------------------------------ thao tác trong ván

  const patchSnapshot = useCallback(
    (update: (current: FlashbackSnapshot) => FlashbackSnapshot) => {
      if (!matchId) return
      queryClient.setQueryData<FlashbackSnapshot>(flashbackKeys.match(userId, matchId), (current) =>
        current ? update(current) : current,
      )
    },
    [matchId, queryClient, userId],
  )

  /** Thao tác bị từ chối vì ván đã đổi: tải lại ảnh chụp và trạng thái, không báo lỗi thao tác. */
  const refreshMatch = useCallback(() => {
    if (!matchId) return
    void queryClient.invalidateQueries({ queryKey: flashbackKeys.match(userId, matchId) })
    void queryClient.invalidateQueries({ queryKey: flashbackKeys.state(userId, matchId) })
  }, [matchId, queryClient, userId])

  const failMatchAction = useCallback(
    (error: unknown, fallback: string) => {
      const kind = codeOf(error)
      if (kind === "MATCH_ENDED") {
        refreshMatch()
        return
      }
      toast.error(messageOf(error, fallback))
      if (kind === "ALREADY_FINISHED" || kind === "AT_LAST_BAR" || kind === "NOT_AT_END" || kind === "ORDER_CONFLICT") {
        refreshMatch()
      }
    },
    [refreshMatch],
  )

  const nextMutation = useMutation({
    mutationFn: () => nextBar(matchId ?? ""),
    onSuccess: (next) => patchSnapshot((current) => applyNext(current, next)),
    onError: (error) => failMatchAction(error, "Chưa mở được phiên tiếp theo."),
  })

  const [side, setSide] = useState<FlashbackOrderSide>("buy")
  const [qty, setQty] = useState("")
  const [focusQtyTick, setFocusQtyTick] = useState(0)
  const [formMatch, setFormMatch] = useState<string | null>(null)
  if (formMatch !== matchId) {
    // Ván mới thì khung đặt lệnh bắt đầu lại.
    setFormMatch(matchId)
    setSide("buy")
    setQty("")
  }
  const requestQtyFocus = useCallback(() => setFocusQtyTick((tick) => tick + 1), [])
  // Cửa sổ kết quả tự mở khi có kết quả; "Xem lại biểu đồ" đóng nó cho tới khi bấm "Xem kết quả".
  const [dismissedResult, setDismissedResult] = useState<string | null>(null)

  // Một lệnh gửi lại sau lỗi mạng dùng lại đúng khoá cũ để server không khớp hai lần.
  const pendingOrder = useRef<{ signature: string; key: string } | null>(null)
  const orderMutation = useMutation({
    mutationFn: (input: { side: FlashbackOrderSide; qty: number; key: string }) =>
      placeOrder(matchId ?? "", { side: input.side, qty: input.qty, idempotency_key: input.key }),
    onSuccess: (placed) => {
      pendingOrder.current = null
      patchSnapshot((current) => applyOrder(current, placed.me))
      setQty("")
      const verb = placed.order.side === "buy" ? "Đã mua" : "Đã bán"
      toast.success(`${verb} ${formatNumber(placed.order.qty)} cp giá ${formatNumber(Number(placed.order.price))}`)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status < 500) pendingOrder.current = null
      failMatchAction(error, "Không đặt được lệnh. Thử lại.")
    },
  })

  const finishMutation = useMutation({
    mutationFn: () => finishMatch(matchId ?? ""),
    onSuccess: (finished) => {
      patchSnapshot((current) => applyFinish(current, finished))
      if (matchId) {
        queryClient.setQueryData<FlashbackMatchState>(flashbackKeys.state(userId, matchId), (current) =>
          current ? applyFinishToState(current, finished) : current,
        )
      }
      if (finished.ended) void refetchState()
    },
    onError: (error) => failMatchAction(error, "Chưa chốt được kết quả."),
  })

  // ------------------------------------------------------------------ chỉ báo (chỉ ở trình duyệt)

  const indicatorList = useFlashbackIndicators(true)
  const indicatorMetas = useMemo(() => indicatorList.data?.indicators ?? [], [indicatorList.data])
  const metaById = useMemo(() => new Map(indicatorMetas.map((meta) => [meta.id, meta])), [indicatorMetas])
  const [instances, setInstances] = useState<LocalIndicator[]>(loadStoredIndicators)
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(new Set())

  const historyBars = snapshot?.history_bars
  const playedBars = snapshot?.played_bars
  const warmupBars = snapshot?.warmup_bars
  const bars = useMemo(() => (historyBars && playedBars ? [...historyBars, ...playedBars] : []), [historyBars, playedBars])
  const warmup = useMemo(() => warmupBars ?? [], [warmupBars])

  const chartIndicators = useMemo<ChartIndicator[]>(() => {
    const withWarmup = [...warmup, ...bars]
    // Bộ chỉ báo đã lưu có thể cũ hoặc bị sửa tay: bỏ chỉ báo lạ, tham số sai thì dùng mặc định.
    const usable = metaById.size > 0 ? instances.filter((instance) => metaById.has(instance.id)) : instances
    return usable.map((instance, index) => {
      const meta = metaById.get(instance.id)
      const params = meta && validateParams(meta, instance.params) ? defaultParams(meta) : instance.params
      const sameId = usable.filter((candidate) => candidate.id === instance.id)
      const position = sameId.findIndex((candidate) => candidate.key === instance.key)
      const computed = computeIndicator(instance.id, params, withWarmup)
      const plot =
        warmup.length > 0
          ? {
              ...computed,
              series: computed.series.map((s) => ({ ...s, values: s.values.slice(warmup.length) })),
              histogram: computed.histogram ? computed.histogram.slice(warmup.length) : undefined,
              markers: computed.markers
                ?.filter((m) => m.index >= warmup.length)
                .map((m) => ({ ...m, index: m.index - warmup.length })),
            }
          : computed
      return {
        key: instance.key,
        id: instance.id,
        params,
        label: instanceShortLabel({ id: instance.id, params }, meta),
        color: indicatorColor(instance.id, position < 0 ? index : position),
        hidden: hiddenKeys.has(instance.key),
        plot,
      }
    })
  }, [instances, bars, warmup, hiddenKeys, metaById])

  const persist = useCallback((next: LocalIndicator[]) => {
    setInstances(next)
    saveStoredIndicators(next)
  }, [])

  const addIndicator = useCallback(
    (id: string, params: FlashbackIndicatorParams) => {
      persist([...instances, { key: `c${Date.now()}-${instances.length}`, id, params }])
    },
    [instances, persist],
  )

  const updateIndicator = useCallback(
    (key: string, params: FlashbackIndicatorParams) => {
      persist(instances.map((instance) => (instance.key === key ? { ...instance, params } : instance)))
    },
    [instances, persist],
  )

  const removeIndicator = useCallback(
    (key: string) => {
      persist(instances.filter((instance) => instance.key !== key))
    },
    [instances, persist],
  )

  const toggleIndicator = useCallback((key: string) => {
    setHiddenKeys((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // ------------------------------------------------------------------ giá trị cho màn chơi

  const expireClock = useCallback(() => {
    void refetchState()
  }, [refetchState])

  const retryMatch = useCallback(() => {
    void refetchSnapshot()
    void refetchState()
  }, [refetchSnapshot, refetchState])

  let match: MatchApi | null = null
  if (snapshot && place.phase === "match") {
    const me = snapshot.me
    const price = Number(me.price)
    const cash = Number(me.cash)
    const parsedQty = Number.parseInt(qty, 10)
    const qtyNumber = Number.isFinite(parsedQty) ? parsedQty : 0
    const finished = me.finished || snapshot.my_finished || matchState?.my_finished === true
    const clockSource = matchState
      ? { remainingMs: matchState.remaining_ms, receivedAt: stateQuery.dataUpdatedAt }
      : { remainingMs: snapshot.remaining_ms, receivedAt: snapshotQuery.dataUpdatedAt }
    const dialogClosed = result ? dismissedResult === result.match_id : false
    match = {
      snapshot,
      me,
      players: matchState?.players ?? snapshot.players,
      ended,
      bars,
      warmup,
      viewBars: snapshot.view_bars,
      playBars: snapshot.play_bars,
      step: me.step,
      cash,
      totalAssets: Number(me.total_assets),
      price,
      finished,
      playingCount: matchState?.playing_count ?? snapshot.playing_count,
      clock: ended ? { remainingMs: 0, receivedAt: clockSource.receivedAt } : clockSource,
      expireClock,
      side,
      setSide,
      qty,
      setQty,
      focusQtyTick,
      requestQtyFocus,
      orderError: orderError(side, qtyNumber, price, cash, me.positions, me.step),
      orderBusy: orderMutation.isPending,
      submitOrder: () => {
        if (!qtyNumber || finished || ended) return
        if (orderError(side, qtyNumber, price, cash, me.positions, me.step)) return
        const signature = `${side}:${qtyNumber}:${me.step}:${me.orders.length}`
        const key = pendingOrder.current?.signature === signature ? pendingOrder.current.key : newIdempotencyKey()
        pendingOrder.current = { signature, key }
        orderMutation.mutate({ side, qty: qtyNumber, key })
      },
      nextSession: () => {
        if (!finished && !ended && me.step < snapshot.play_bars) nextMutation.mutate()
      },
      nextBusy: nextMutation.isPending,
      finish: () => {
        if (!finished && !ended && me.step >= snapshot.play_bars) finishMutation.mutate()
      },
      finishBusy: finishMutation.isPending,
      result,
      resultOpen: Boolean(result) && !dialogClosed,
      setResultOpen: (open) => setDismissedResult(open ? null : (result?.match_id ?? null)),
      playAgain,
      playAgainBusy: replayMutation.isPending,
      backToLobby: leave,
      backBusy: leaveMutation.isPending,
      indicatorMetas,
      indicatorsLoading: indicatorList.isPending,
      indicators: chartIndicators,
      addIndicator,
      updateIndicator,
      removeIndicator,
      toggleIndicator,
    }
  }

  return {
    phase,
    showPanel: place.phase === "match",
    bootFailed: place.phase === "boot" && mineQuery.isError,
    retryBoot,
    lobby: {
      filter,
      setFilter,
      rooms: roomsQuery.data,
      loading: roomsQuery.isPending,
      failed: roomsQuery.isError && !roomsQuery.data,
      busy: joinMutation.isPending || randomMutation.isPending || createMutation.isPending,
      joinById,
      join,
      randomJoin,
      createRoom,
      balance,
    },
    room: {
      room,
      loading: roomQuery.isPending,
      failed: roomQuery.isError && !room,
      copyId,
      leave,
      leaveBusy: leaveMutation.isPending,
      start,
      startBusy: startMutation.isPending,
    },
    match,
    matchLoading: place.phase === "match" && snapshotQuery.isPending,
    matchFailed: place.phase === "match" && snapshotQuery.isError && !snapshot,
    retryMatch,
  }
}
