/** Trang đọc bài trong bảng trượt (spec "Trang đọc bài"). */
import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, X } from "lucide-react"

import { ApiError, errorMessage } from "@/lib/api"

import { world } from "../bridge"
import { floorSocket } from "../net/socket"
import type { PostDetail } from "../net/types"
import { postsApi } from "./api"
import { PostComments } from "./post-comments"
import { HeartButton, PostArticle, PostDisclaimer, SacoCard } from "./post-view"
import { messageSaco, toggleHeart } from "./posts-actions"

type ReaderState =
  | { status: "loading" }
  | { status: "ready"; post: PostDetail }
  | { status: "gone" }
  | { status: "error"; message: string }

export function PostReader({
  postId,
  onBack,
  onClose,
}: {
  postId: string
  onBack: () => void
  onClose: () => void
}) {
  const [state, setState] = useState<ReaderState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    postsApi.detail(postId, controller.signal).then(
      (post) => {
        if (!controller.signal.aborted) setState({ status: "ready", post })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        if (
          error instanceof ApiError &&
          (error.status === 410 || error.status === 404)
        )
          setState({ status: "gone" })
        else setState({ status: "error", message: errorMessage(error) })
      }
    )
    const offs = [
      floorSocket.on("post:hidden", (message) => {
        if (message.id === postId) setState({ status: "gone" })
      }),
      floorSocket.on("post:heart", (message) => {
        if (message.id !== postId) return
        setState((current) =>
          current.status === "ready"
            ? {
                status: "ready",
                post: { ...current.post, hearts: message.hearts },
              }
            : current
        )
      }),
    ]
    return () => {
      controller.abort()
      for (const off of offs) off()
    }
  }, [postId, attempt])

  const post = state.status === "ready" ? state.post : null

  const onCount = useCallback(
    (comments: number) => {
      setState((current) =>
        current.status === "ready" && current.post.comments !== comments
          ? { status: "ready", post: { ...current.post, comments } }
          : current
      )
      world.posts.update((list) =>
        list.some((item) => item.id === postId && item.comments !== comments)
          ? list.map((item) =>
              item.id === postId ? { ...item, comments } : item
            )
          : list
      )
    },
    [postId]
  )

  const heart = () => {
    if (!post) return
    void toggleHeart(
      post.id,
      { hearted: post.hearted, hearts: post.hearts },
      (next) =>
        setState((current) =>
          current.status === "ready" && current.post.id === post.id
            ? { status: "ready", post: { ...current.post, ...next } }
            : current
        )
    )
  }

  return (
    <div className="tf-posts-view">
      <header className="tf-posts-bar">
        <button
          type="button"
          className="tf-post-btn tf-post-btn--ghost tf-posts-back"
          onClick={onBack}
        >
          <ChevronLeft aria-hidden="true" className="tf-post-btn-icon" />
          Quay lại
        </button>
        <h2 className="tf-posts-bar-title">Nhận định</h2>
        {post && (
          <HeartButton
            hearted={post.hearted}
            hearts={post.hearts}
            onToggle={post.isAuthor ? undefined : heart}
          />
        )}
        <button
          type="button"
          className="tf-posts-icon-btn"
          aria-label="Đóng nhận định"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="tf-posts-scroll">
        {state.status === "loading" && (
          <p className="tf-posts-state">Đang tải bài…</p>
        )}
        {state.status === "gone" && (
          <div className="tf-posts-state">
            <p>Bài viết không còn hiển thị</p>
            <button
              type="button"
              className="tf-post-btn tf-post-btn--outline"
              onClick={onBack}
            >
              Quay lại danh sách
            </button>
          </div>
        )}
        {state.status === "error" && (
          <div className="tf-posts-state">
            <p>Không tải được bài. {state.message}</p>
            <button
              type="button"
              className="tf-post-btn"
              onClick={() => {
                  setState({ status: "loading" })
                  setAttempt((value) => value + 1)
                }}
            >
              Thử lại
            </button>
          </div>
        )}
        {post && (
          <div className="tf-posts-reader">
            <PostArticle
              sacoName={post.sacoName}
              publishedAt={post.publishedAt}
              headline={post.headline}
              bodyHtml={post.bodyHtml}
            />
            <SacoCard
              name={post.sacoName}
              onDuty={post.sacoOnDuty}
              onMessage={
                post.isAuthor || !post.sacoActive
                  ? undefined
                  : () => messageSaco(post.sacoId)
              }
            />
            <PostComments
              key={post.id}
              postId={post.id}
              canModerate={post.canModerate}
              onCount={onCount}
            />
            <PostDisclaimer />
          </div>
        )}
      </div>
    </div>
  )
}
