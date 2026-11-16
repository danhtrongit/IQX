-- SACO nhận định: tác giả sửa bài đã đăng (edited_at, log action 'edit') và thu hồi bài (status 'withdrawn',
-- log actions 'withdraw' / 'republish'). Additive and idempotent: only widens two CHECK constraints and adds
-- one nullable column. A withdrawn post keeps published_at, hearts and comments (ck_tf_posts_published
-- only ties 'draft' to a NULL published_at, so it still holds).

ALTER TABLE tf_posts ADD COLUMN IF NOT EXISTS edited_at timestamptz;

ALTER TABLE tf_posts DROP CONSTRAINT IF EXISTS tf_posts_status_check;
ALTER TABLE tf_posts
  ADD CONSTRAINT tf_posts_status_check
  CHECK (status IN ('draft', 'published', 'hidden', 'withdrawn'));

ALTER TABLE tf_post_log DROP CONSTRAINT IF EXISTS tf_post_log_action_check;
ALTER TABLE tf_post_log
  ADD CONSTRAINT tf_post_log_action_check
  CHECK (action IN ('publish', 'hide', 'unhide', 'edit', 'withdraw', 'republish'));
