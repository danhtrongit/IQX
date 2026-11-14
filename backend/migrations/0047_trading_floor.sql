-- Khu giao dịch (2D trading floor): Thần Tài ritual, SACO accounts, Chat SACO, SACO nhận định.
-- Specs: "IQX Văn phòng ảo · Spec nhắn tin với SACO" and "IQX Văn phòng ảo · Spec SACO nhận định".
-- Additive and idempotent.
--
--   tf_profiles           the look a signed-in account wears on the floor (name, avatar, outfit colour).
--   tf_rituals            one Thần Tài ritual per account and session: quẻ, VNINDEX call, 3 tickers, score.
--   tf_ritual_sessions    the VNINDEX close each session was scored with.
--   tf_sacos              SACO rights of an account. A team lead grants them inside the own group, an
--                         admin anywhere. `position` is the Chat SACO order shared by the whole floor.
--                         Removing rights keeps the row (`active = false`), so old chats stay readable.
--   tf_chat_convs         one conversation per (user, SACO), never closed.
--   tf_chat_messages      nobody edits or deletes a message. sender: u = user, s = SACO, x = system.
--   tf_chat_invites       every SACO considered in every Chat SACO run, skipped ones included.
--   tf_posts              SACO nhận định: draft -> published -> hidden (-> published by an admin).
--   tf_post_images        images uploaded into a post, re-encoded by the server.
--   tf_post_hearts        one heart per account and post.
--   tf_post_comments      flat comments; `deleted` by the writer, `hidden` by the author SACO or staff.
--   tf_post_comment_reports  one report per account and comment.
--   tf_post_log           who published, hid or restored a post, and when.

CREATE TABLE IF NOT EXISTS tf_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  avatar text NOT NULL,
  color text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tf_rituals (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session date NOT NULL,
  que_id smallint NOT NULL,
  -- NULL until the prediction is submitted: a drawn quẻ alone is an unfinished ritual.
  direction text,
  level numeric(10, 2),
  tickers text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  -- Set when the session is scored.
  correct boolean,
  error numeric(10, 2),
  PRIMARY KEY (user_id, session),
  CONSTRAINT ck_tf_rituals_direction CHECK (direction IS NULL OR direction IN ('up', 'down')),
  CONSTRAINT ck_tf_rituals_done CHECK ((direction IS NULL) = (done_at IS NULL))
);

CREATE INDEX IF NOT EXISTS ix_tf_rituals_session ON tf_rituals (session);

CREATE TABLE IF NOT EXISTS tf_ritual_sessions (
  session date PRIMARY KEY,
  close numeric(10, 2) NOT NULL,
  change numeric(10, 2) NOT NULL,
  source text NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tf_sacos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  -- The group (team lead) this SACO belongs to. Exactly one.
  lead_user_id uuid NOT NULL REFERENCES team_lead_profiles(user_id),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 40),
  icon text NOT NULL,
  position integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  on_duty boolean NOT NULL DEFAULT false,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  removed_at timestamptz,
  removed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_tf_sacos_duty CHECK (active OR NOT on_duty)
);

CREATE INDEX IF NOT EXISTS ix_tf_sacos_order ON tf_sacos (position) WHERE active;
CREATE INDEX IF NOT EXISTS ix_tf_sacos_lead ON tf_sacos (lead_user_id);

CREATE TABLE IF NOT EXISTS tf_chat_convs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  saco_id uuid NOT NULL REFERENCES tf_sacos(id) ON DELETE CASCADE,
  -- Two independent origins: matched through Chat SACO, opened directly through Nhắn SACO.
  matched boolean NOT NULL DEFAULT false,
  matched_at timestamptz,
  direct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  user_read_at timestamptz,
  saco_read_at timestamptz,
  CONSTRAINT uq_tf_chat_convs_pair UNIQUE (user_id, saco_id)
);

CREATE INDEX IF NOT EXISTS ix_tf_chat_convs_saco ON tf_chat_convs (saco_id, last_at DESC);
CREATE INDEX IF NOT EXISTS ix_tf_chat_convs_user ON tf_chat_convs (user_id, last_at DESC);

CREATE TABLE IF NOT EXISTS tf_chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conv_id uuid NOT NULL REFERENCES tf_chat_convs(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('u', 's', 'x')),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tf_chat_messages_conv ON tf_chat_messages (conv_id, id);

CREATE TABLE IF NOT EXISTS tf_chat_invites (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- One Chat SACO run of one user.
  run_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  saco_id uuid NOT NULL REFERENCES tf_sacos(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('accept', 'decline', 'timeout', 'skip-off', 'skip-busy', 'cancel')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tf_chat_invites_saco ON tf_chat_invites (saco_id, id DESC);

CREATE TABLE IF NOT EXISTS tf_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saco_id uuid NOT NULL REFERENCES tf_sacos(id) ON DELETE CASCADE,
  -- At most 90 characters once published; a draft may still be empty.
  headline text NOT NULL DEFAULT '' CHECK (char_length(headline) <= 200),
  -- Sanitized HTML.
  body_html text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden')),
  -- Bumped on every draft save; a save based on an older revision is refused.
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  saved_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  heart_count integer NOT NULL DEFAULT 0 CHECK (heart_count >= 0),
  comment_count integer NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  -- The author has seen every comment up to here (new-comment notice in "Bài của tôi").
  comments_seen_at timestamptz,
  CONSTRAINT ck_tf_posts_published CHECK ((status = 'draft') = (published_at IS NULL))
);

CREATE INDEX IF NOT EXISTS ix_tf_posts_published ON tf_posts (published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS ix_tf_posts_saco ON tf_posts (saco_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tf_post_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES tf_posts(id) ON DELETE CASCADE,
  path text NOT NULL,
  mime text NOT NULL,
  bytes integer NOT NULL CHECK (bytes > 0),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tf_post_images_post ON tf_post_images (post_id);

CREATE TABLE IF NOT EXISTS tf_post_hearts (
  post_id uuid NOT NULL REFERENCES tf_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS tf_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES tf_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Written by the SACO who wrote the post.
  is_author boolean NOT NULL DEFAULT false,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  moderated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  moderated_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_tf_post_comments_post ON tf_post_comments (post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tf_post_comment_reports (
  comment_id uuid NOT NULL REFERENCES tf_post_comments(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, reporter_user_id)
);

CREATE TABLE IF NOT EXISTS tf_post_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES tf_posts(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('publish', 'hide', 'unhide')),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tf_post_log_post ON tf_post_log (post_id, id);
