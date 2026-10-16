-- Admin spec v1.1 §2.1: every account has a username (Tên đăng nhập). It is lowercase,
-- matches ^[a-z0-9._]{4,30}$, is unique case-insensitively, and doubles as the referral code
-- of a team lead. Login accepts it in place of the email.
--
-- DECISION 1 (existing accounts): usernames are backfilled deterministically from the email
-- local part and the owner may change it exactly once (users.username_change_allowed).
-- The legacy referral-code shape ^(ls|ctv)_[0-9a-f]{10}$ is reserved so a username can never
-- collide with an LS_/CTV_ code that keeps working during the legacy window (DECISION 5).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username varchar(30),
  ADD COLUMN IF NOT EXISTS username_change_allowed boolean NOT NULL DEFAULT false;

-- Base candidate for an email: lowercase local part, characters outside [a-z0-9._] removed,
-- 'user' when nothing is left, right-padded with '0' to 4 characters, cut to 30. A base that
-- looks like a legacy referral code gets its first '_' replaced by '.'. Kept as a function so
-- the rule is testable; collisions are resolved by the backfill loop below.
CREATE OR REPLACE FUNCTION iqx_username_seed(p_email text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE
           WHEN base ~ '^(ls|ctv)_[0-9a-f]{10}$' THEN regexp_replace(base, '_', '.')
           ELSE base
         END
    FROM (
      -- rpad() also truncates, so it only runs on bases shorter than 4 characters.
      SELECT left(CASE WHEN length(cleaned) < 4 THEN rpad(cleaned, 4, '0') ELSE cleaned END,
                  30) AS base
        FROM (
          SELECT coalesce(nullif(regexp_replace(lower(split_part(p_email, '@', 1)),
                                                '[^a-z0-9._]', '', 'g'), ''),
                          'user') AS cleaned
        ) local_part
    ) seed
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower ON users (lower(username));

-- Oldest account keeps the bare base; later ones get the smallest free numeric suffix
-- (base2, base3, ...), the base being cut so the result stays within 30 characters.
DO $$
DECLARE
  account record;
  base text;
  candidate text;
  suffix integer;
BEGIN
  FOR account IN
    SELECT id, email FROM users WHERE username IS NULL ORDER BY created_at, id
  LOOP
    base := iqx_username_seed(account.email);
    candidate := base;
    suffix := 1;
    WHILE candidate ~ '^(ls|ctv)_[0-9a-f]{10}$'
       OR EXISTS (SELECT 1 FROM users WHERE lower(username) = candidate) LOOP
      suffix := suffix + 1;
      candidate := left(base, 30 - length(suffix::text)) || suffix::text;
    END LOOP;
    UPDATE users
       SET username = candidate, username_change_allowed = true
     WHERE id = account.id;
  END LOOP;
END $$;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_username_format;
ALTER TABLE users
  ADD CONSTRAINT ck_users_username_format
  CHECK (username ~ '^[a-z0-9._]{4,30}$' AND username !~ '^(ls|ctv)_[0-9a-f]{10}$');
