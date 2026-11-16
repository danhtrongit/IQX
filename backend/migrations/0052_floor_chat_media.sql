-- Khu giao dịch: Chat SACO nhắn trước rồi tự phân phối, ảnh và thu hồi tin (update chat-saco). When no
-- SACO accepts the invite, the conversation goes to a SACO by ranking and the invite log records it as
-- result 'auto'. Additive and idempotent.

-- 1. Chat SACO invite log: new result 'auto' (assigned by ranking after nobody accepted).
ALTER TABLE tf_chat_invites DROP CONSTRAINT IF EXISTS tf_chat_invites_result_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tf_chat_invites'::regclass AND conname = 'ck_tf_chat_invites_result'
  ) THEN
    ALTER TABLE tf_chat_invites
      ADD CONSTRAINT ck_tf_chat_invites_result
      CHECK (result IN ('accept', 'decline', 'timeout', 'skip-off', 'skip-busy', 'cancel', 'auto'));
  END IF;
END $$;

-- 2. Images and recall in SACO chat (UX-06). An image message has empty text and the image fields; a
-- recalled message keeps its text for the staff history (team leads, admins) while participants see
-- "đã thu hồi" and the image file is deleted.
ALTER TABLE tf_chat_messages
  ADD COLUMN IF NOT EXISTS image_id uuid,
  ADD COLUMN IF NOT EXISTS image_w int,
  ADD COLUMN IF NOT EXISTS image_h int,
  ADD COLUMN IF NOT EXISTS recalled_at timestamptz;

ALTER TABLE tf_chat_messages DROP CONSTRAINT IF EXISTS tf_chat_messages_text_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tf_chat_messages'::regclass AND conname = 'ck_tf_chat_messages_text'
  ) THEN
    ALTER TABLE tf_chat_messages
      ADD CONSTRAINT ck_tf_chat_messages_text
      CHECK (char_length(text) <= 1000 AND (char_length(text) >= 1 OR image_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tf_chat_messages'::regclass AND conname = 'ck_tf_chat_messages_image'
  ) THEN
    ALTER TABLE tf_chat_messages
      ADD CONSTRAINT ck_tf_chat_messages_image
      CHECK (
        (image_id IS NULL AND image_w IS NULL AND image_h IS NULL)
        OR (image_id IS NOT NULL AND image_w > 0 AND image_h > 0)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tf_chat_messages_image
  ON tf_chat_messages (image_id) WHERE image_id IS NOT NULL;
