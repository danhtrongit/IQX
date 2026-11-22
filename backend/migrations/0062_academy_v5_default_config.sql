-- Học viện v5 · Chương 13–17 in the default config (IQX-Hoc-Vien-SPEC-v5 §9, plan HV v5 D4 §6).
-- Idempotent. Only the `default` config gets the five new industry chapters (`ch13`..`ch17`) it is missing, appended
-- after its chapters in catalog order (configs store chapter ids in catalog order, and every new id comes after
-- `ch12`). One `academy_config_logs` row (`update`, `changed_by` NULL) records the change, only when something
-- changed. Team lead configs are NOT touched: an administrator enables the new chapters per group, so a sequential
-- group never gets chapters inserted into the chain it is learning.
-- No progress row is read or written (completions and rewards are keyed by lesson_key, every v4 key is kept).

WITH target AS (
  SELECT c.id,
         c.mode,
         c.chapter_ids AS before_ids,
         c.chapter_ids || ARRAY(
           SELECT n.chapter_id
             FROM unnest(ARRAY['ch13', 'ch14', 'ch15', 'ch16', 'ch17']) WITH ORDINALITY AS n(chapter_id, ord)
            WHERE NOT (n.chapter_id = ANY (c.chapter_ids))
            ORDER BY n.ord
         ) AS after_ids
    FROM academy_configs c
   WHERE c.owner_type = 'default'
   FOR UPDATE
),
changed AS (
  UPDATE academy_configs a
     SET chapter_ids = t.after_ids,
         updated_at = now()
    FROM target t
   WHERE a.id = t.id
     AND t.after_ids <> t.before_ids
  RETURNING a.id, t.mode, t.before_ids, t.after_ids
)
INSERT INTO academy_config_logs (config_id, owner_type, leader_id, action, changed_by, before, after)
SELECT id,
       'default',
       NULL,
       'update',
       NULL,
       jsonb_build_object('mode', mode, 'chapter_ids', to_jsonb(before_ids)),
       jsonb_build_object('mode', mode, 'chapter_ids', to_jsonb(after_ids))
  FROM changed;
