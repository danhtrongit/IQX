-- Khu giao dịch: Chat SACO nhắn trước rồi tự phân phối (update chat-saco). When no SACO accepts the
-- invite, the conversation goes to a SACO by ranking and the invite log records it as result 'auto'.
-- Additive and idempotent.

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
