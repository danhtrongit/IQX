-- Flashback v2.4 · Chat phòng (spec IQX-Flashback-SPEC-v2.4-BoSung §3).
-- Additive and idempotent.
--
--   fb_rooms.chat_enabled   the owner's "Chat trong phòng: Bật / Tắt" choice when creating the room.
--   fb_chat_messages        one thread per room; `phien` is the sender's session when sending and
--                           decides when the server may deliver the message to someone else (§3.4).
--                           Kept 7 days (flashback.rooms-sweep deletes older rows).
--   fb_chat_mutes           "Tắt tiếng": only the muter stops receiving; lives with the room.
--   fb_chat_banned_words    admin-managed list; a match becomes *** before the message is stored.
--   fb_chat_reports         reported message plus a copy of the 10 messages before it, so the report
--                           stays readable after the 7-day purge.

ALTER TABLE fb_rooms ADD COLUMN IF NOT EXISTS chat_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS fb_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES fb_rooms(id) ON DELETE CASCADE,
  -- NULL = sent in the waiting room.
  match_id uuid REFERENCES fb_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phien integer NOT NULL DEFAULT 0 CHECK (phien >= 0),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 1000),
  reported boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_fb_chat_messages_room ON fb_chat_messages (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_fb_chat_messages_sender ON fb_chat_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_fb_chat_messages_created ON fb_chat_messages (created_at);

CREATE TABLE IF NOT EXISTS fb_chat_mutes (
  room_id uuid NOT NULL REFERENCES fb_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id, muted_user_id)
);

CREATE INDEX IF NOT EXISTS ix_fb_chat_mutes_created ON fb_chat_mutes (created_at);

CREATE TABLE IF NOT EXISTS fb_chat_banned_words (
  word text PRIMARY KEY CHECK (char_length(word) BETWEEN 1 AND 64),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fb_chat_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The message itself is purged after 7 days; the report keeps its own copy of the text.
  message_id uuid REFERENCES fb_chat_messages(id) ON DELETE SET NULL,
  room_code varchar(6) NOT NULL,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_text text NOT NULL,
  message_phien integer NOT NULL,
  message_at timestamptz NOT NULL,
  context jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS ix_fb_chat_reports_status ON fb_chat_reports (status, created_at DESC);

COMMENT ON COLUMN fb_rooms.chat_enabled IS 'Flashback v2.4: chủ phòng bật hoặc tắt chat khi tạo phòng.';
COMMENT ON COLUMN fb_chat_messages.phien IS 'Phiên của người gửi lúc gửi (0 ở phòng chờ); người nhận chỉ nhận khi đã tới phiên này hoặc ván đã kết thúc.';
