-- Khu giao dịch: khách (tf_guests) chat với SACO như tài khoản (update guest-chat). A conversation or an
-- invite-log row now belongs to exactly one owner: an account (user_id) or a guest (guest_id).
-- Additive and idempotent. The existing UNIQUE (user_id, saco_id) stays: NULL user_ids never collide,
-- and guests get their own partial unique index below.

-- 1. Conversations.
ALTER TABLE tf_chat_convs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE tf_chat_convs
  ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES tf_guests(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tf_chat_convs'::regclass AND conname = 'ck_tf_chat_convs_owner'
  ) THEN
    ALTER TABLE tf_chat_convs
      ADD CONSTRAINT ck_tf_chat_convs_owner CHECK ((user_id IS NOT NULL) <> (guest_id IS NOT NULL));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tf_chat_convs_guest_pair
  ON tf_chat_convs (guest_id, saco_id) WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_tf_chat_convs_guest ON tf_chat_convs (guest_id, last_at DESC);

-- 2. Chat SACO invite log.
ALTER TABLE tf_chat_invites ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE tf_chat_invites
  ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES tf_guests(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'tf_chat_invites'::regclass AND conname = 'ck_tf_chat_invites_owner'
  ) THEN
    ALTER TABLE tf_chat_invites
      ADD CONSTRAINT ck_tf_chat_invites_owner CHECK ((user_id IS NOT NULL) <> (guest_id IS NOT NULL));
  END IF;
END $$;
