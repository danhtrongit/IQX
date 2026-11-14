/** Mục Bình luận dưới thẻ SACO: phẳng, mới nhất ở trên, xoá của mình, ẩn khi được quản lý, báo cáo. */
import { useCallback, useEffect, useState, type FormEvent } from "react"

import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"

import { toast } from "../bridge"
import { floorSocket } from "../net/socket"
import type { PostComment } from "../net/types"
import { COMMENT_MAX, postsApi, type PostComments as CommentsData } from "./api"
import { timeAgo } from "./format"

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

export function PostComments({
  postId,
  canModerate,
  onCount,
}: {
  postId: string
  canModerate: boolean
  onCount?: (total: number) => void
}) {
  const [data, setData] = useState<CommentsData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const now = useNow()

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const result = await postsApi.comments(postId, signal)
        if (signal?.aborted) return
        setData(result)
        setLoadError(null)
      } catch (error) {
        if (signal?.aborted) return
        setLoadError(errorMessage(error))
      }
    },
    [postId]
  )

  const total = data?.total
  useEffect(() => {
    if (total !== undefined) onCount?.(total)
  }, [total, onCount])

  useEffect(() => {
    const controller = new AbortController()
    const fetchComments = () =>
      postsApi.comments(postId, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return
          setData(result)
          setLoadError(null)
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setLoadError(errorMessage(error))
        }
      )
    void fetchComments()
    const off = floorSocket.on("post:comment", (message) => {
      if (message.postId === postId) void fetchComments()
    })
    return () => {
      controller.abort()
      off()
    }
  }, [postId])

  const remove = (id: string) => {
    setData((current) => {
      if (!current || !current.items.some((comment) => comment.id === id))
        return current
      return {
        total: Math.max(0, current.total - 1),
        items: current.items.filter((comment) => comment.id !== id),
      }
    })
  }

  const patch = (id: string, change: Partial<PostComment>) =>
    setData(
      (current) =>
        current && {
          ...current,
          items: current.items.map((comment) =>
            comment.id === id ? { ...comment, ...change } : comment
          ),
        }
    )

  const run = async (
    id: string,
    action: () => Promise<unknown>,
    after: () => void,
    done?: string
  ) => {
    setBusyId(id)
    try {
      await action()
      after()
      if (done) toast(done, "info", 2600)
    } catch (error) {
      toast(errorMessage(error), "warn")
    } finally {
      setBusyId(null)
      setConfirmDeleteId(null)
    }
  }

  const trimmed = text.trim()
  const tooLong = trimmed.length > COMMENT_MAX

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!trimmed || tooLong || sending) return
    setSending(true)
    try {
      const comment = await postsApi.comment(postId, trimmed)
      setText("")
      setData((current) => {
        const items =
          current?.items.filter((item) => item.id !== comment.id) ?? []
        return {
          total:
            (current?.total ?? 0) +
            (items.length === (current?.items.length ?? 0) ? 1 : 0),
          items: [comment, ...items],
        }
      })
    } catch (error) {
      toast(errorMessage(error), "warn")
    } finally {
      setSending(false)
    }
  }

  return (
    <section
      className="tf-post-comments"
      aria-labelledby={`tf-post-comments-${postId}`}
    >
      <h3 id={`tf-post-comments-${postId}`} className="tf-post-comments-title">
        Bình luận ({data?.total ?? 0})
      </h3>
      <form className="tf-post-comment-form" onSubmit={submit}>
        <textarea
          className="tf-post-comment-input"
          value={text}
          rows={3}
          maxLength={COMMENT_MAX + 50}
          placeholder="Viết bình luận…"
          aria-label="Viết bình luận"
          aria-invalid={tooLong}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="tf-post-comment-form-foot">
          <span
            className={cn(
              "tf-post-comment-counter",
              tooLong && "tf-post-comment-counter--over"
            )}
          >
            {trimmed.length}/{COMMENT_MAX}
          </span>
          <button
            type="submit"
            className="tf-post-btn tf-post-btn--gold"
            disabled={!trimmed || tooLong || sending}
          >
            {sending ? "Đang gửi…" : "Gửi"}
          </button>
        </div>
      </form>

      {loadError && !data ? (
        <div className="tf-post-comments-state">
          <p>Không tải được bình luận. {loadError}</p>
          <button
            type="button"
            className="tf-post-btn"
            onClick={() => void load()}
          >
            Thử lại
          </button>
        </div>
      ) : !data ? (
        <p className="tf-post-comments-state">Đang tải bình luận…</p>
      ) : data.items.length === 0 ? (
        <p className="tf-post-comments-state">
          Chưa có bình luận. Hãy là người đầu tiên.
        </p>
      ) : (
        <ul className="tf-post-comment-list">
          {data.items.map((comment) => (
            <li
              key={comment.id}
              className={cn(
                "tf-post-comment",
                comment.mine && "tf-post-comment--mine"
              )}
            >
              <p className="tf-post-comment-meta">
                <span className="tf-post-comment-author">
                  {comment.authorName}
                </span>
                {comment.isAuthor && (
                  <span className="tf-post-comment-tag">Tác giả</span>
                )}
                <span className="tf-post-comment-time">
                  {timeAgo(comment.at, now)}
                </span>
              </p>
              <p className="tf-post-comment-text">{comment.text}</p>
              <div className="tf-post-comment-actions">
                {comment.mine &&
                  (confirmDeleteId === comment.id ? (
                    <>
                      <span>Xoá bình luận này?</span>
                      <button
                        type="button"
                        className="tf-post-link tf-post-link--danger"
                        disabled={busyId === comment.id}
                        onClick={() =>
                          void run(
                            comment.id,
                            () => postsApi.deleteComment(comment.id),
                            () => remove(comment.id)
                          )
                        }
                      >
                        Xoá
                      </button>
                      <button
                        type="button"
                        className="tf-post-link"
                        disabled={busyId === comment.id}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Huỷ
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="tf-post-link"
                      onClick={() => setConfirmDeleteId(comment.id)}
                    >
                      Xoá
                    </button>
                  ))}
                {canModerate && !comment.mine && (
                  <button
                    type="button"
                    className="tf-post-link"
                    disabled={busyId === comment.id}
                    onClick={() =>
                      void run(
                        comment.id,
                        () => postsApi.hideComment(comment.id),
                        () => remove(comment.id),
                        "Đã ẩn bình luận"
                      )
                    }
                  >
                    Ẩn
                  </button>
                )}
                {!comment.mine && (
                  <button
                    type="button"
                    className="tf-post-link"
                    disabled={comment.reported || busyId === comment.id}
                    onClick={() =>
                      void run(
                        comment.id,
                        () => postsApi.reportComment(comment.id),
                        () => patch(comment.id, { reported: true }),
                        "Đã gửi báo cáo"
                      )
                    }
                  >
                    {comment.reported ? "Đã báo cáo" : "Báo cáo"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
