/**
 * SACO nhận định trong khu giao dịch: bảng cố định góc phải trên và bảng trượt bên phải
 * (danh sách hôm nay ↔ trang đọc bài). Giữ `world.posts` khớp máy chủ cho bảng tường Phaser.
 */
import { useEffect, useRef, type KeyboardEvent } from "react"
import { ChevronRight, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { closePosts, openPosts, ui, world } from "../bridge"
import type { PostCard } from "../net/types"
import { useStore } from "../use-store"
import { PostReader } from "./post-reader"
import { PostCardView } from "./post-view"
import { messageSaco, toggleHeart } from "./posts-actions"
import { useTodayPosts } from "./use-today-posts"
import "./posts.css"

const BOARD_ROWS = 3

export function PostsLayer() {
  const posts = useStore(world.posts)
  const state = useStore(ui.posts)
  const fresh = useTodayPosts()

  return (
    <>
      <PostsBoard posts={posts} fresh={fresh} />
      {state.open && (
        <PostsPanel postId={state.postId} posts={posts} fresh={fresh} />
      )}
    </>
  )
}

function PostsBoard({
  posts,
  fresh,
}: {
  posts: PostCard[]
  fresh: ReadonlySet<string>
}) {
  const top = posts.slice(0, BOARD_ROWS)
  return (
    <button
      type="button"
      className="tf-posts-board tf-post-theme"
      onClick={() => openPosts()}
      aria-label={`SACO nhận định, ${posts.length} bài hôm nay. Mở danh sách`}
    >
      <span className="tf-posts-board-title">SACO NHẬN ĐỊNH</span>
      {top.length === 0 ? (
        <span className="tf-posts-board-empty">Chưa có nhận định hôm nay</span>
      ) : (
        top.map((post) => (
          <span
            key={post.id}
            className={cn(
              "tf-posts-board-row",
              fresh.has(post.id) && "tf-posts-board-row--flash"
            )}
          >
            <span className="tf-posts-board-saco">{post.sacoName}</span>
            <span className="tf-posts-board-headline">{post.headline}</span>
          </span>
        ))
      )}
      <span className="tf-posts-board-more">
        Chạm để xem tất cả
        <ChevronRight aria-hidden="true" className="tf-posts-board-chevron" />
      </span>
    </button>
  )
}

function PostsPanel({
  postId,
  posts,
  fresh,
}: {
  postId: string | null
  posts: PostCard[]
  fresh: ReadonlySet<string>
}) {
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [postId])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Phím gõ trong bảng trượt không được đi tới cảnh Phaser (WASD, E…).
    event.stopPropagation()
    if (event.key === "Escape") closePosts()
  }

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label={postId ? "Nhận định" : "SACO nhận định hôm nay"}
      className="tf-posts-panel tf-post-theme"
      onKeyDown={onKeyDown}
    >
      {postId ? (
        <PostReader
          key={postId}
          postId={postId}
          onBack={() => openPosts()}
          onClose={closePosts}
        />
      ) : (
        <PostsList posts={posts} fresh={fresh} />
      )}
    </aside>
  )
}

function PostsList({
  posts,
  fresh,
}: {
  posts: PostCard[]
  fresh: ReadonlySet<string>
}) {
  return (
    <div className="tf-posts-view">
      <header className="tf-posts-bar tf-posts-bar--list">
        <div className="tf-posts-bar-heading">
          <h2 className="tf-posts-bar-title">SACO nhận định hôm nay</h2>
          <p className="tf-posts-bar-sub">
            {posts.length} bài · mới nhất ở trên
          </p>
        </div>
        <button
          type="button"
          className="tf-posts-icon-btn"
          aria-label="Đóng nhận định"
          onClick={closePosts}
        >
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="tf-posts-scroll">
        {posts.length === 0 ? (
          <p className="tf-posts-state">Chưa có nhận định nào hôm nay.</p>
        ) : (
          <ul className="tf-posts-list">
            {posts.map((post) => (
              <li key={post.id}>
                <PostCardView
                  sacoName={post.sacoName}
                  headline={post.headline}
                  hearts={post.hearts}
                  hearted={post.hearted}
                  fresh={fresh.has(post.id)}
                  onOpen={() => openPosts(post.id)}
                  onHeart={() =>
                    void toggleHeart(post.id, {
                      hearted: post.hearted,
                      hearts: post.hearts,
                    })
                  }
                  onMessage={() => messageSaco(post.sacoId)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
