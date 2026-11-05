-- Thống kê layout TradingView đã lưu (IQLine GĐ 0). Chỉ đọc, chỉ xuất số đếm theo loại, không xuất nội dung của người dùng.
\pset format unaligned
\pset fieldsep ' | '
\pset tuples_only on
\echo == totals: rows, users, symbols, with_charts, p95_kb, max_kb, last_update
SELECT count(*), count(DISTINCT user_id), count(DISTINCT symbol),
  count(*) FILTER (WHERE jsonb_typeof(state->'charts')='array'),
  round((percentile_cont(0.95) WITHIN GROUP (ORDER BY octet_length(state::text)))::numeric/1024,1),
  round(max(octet_length(state::text))/1024.0,1),
  max(updated_at)::date
FROM chart_drawings;
\echo == top-level keys
SELECT k, count(*) FROM chart_drawings, jsonb_object_keys(state) k GROUP BY 1 ORDER BY 2 DESC LIMIT 15;
\echo == source types: type, sources, rows, users
WITH s AS (
  SELECT d.user_id, d.id AS rid, src->>'type' AS t
  FROM chart_drawings d,
    jsonb_array_elements(d.state->'charts') c,
    jsonb_array_elements(c->'panes') p,
    jsonb_array_elements(p->'sources') src
  WHERE jsonb_typeof(d.state->'charts')='array')
SELECT t, count(*), count(DISTINCT rid), count(DISTINCT user_id) FROM s GROUP BY 1 ORDER BY 2 DESC;
\echo == studies: id, sources, rows, users
WITH s AS (
  SELECT d.user_id, d.id AS rid, src
  FROM chart_drawings d,
    jsonb_array_elements(d.state->'charts') c,
    jsonb_array_elements(c->'panes') p,
    jsonb_array_elements(p->'sources') src
  WHERE jsonb_typeof(d.state->'charts')='array' AND src->>'type' NOT LIKE 'LineTool%' AND src->>'type' <> 'MainSeries')
SELECT coalesce(src->'metaInfo'->>'id', src->'metaInfo'->>'shortDescription', src->>'type'), count(*), count(DISTINCT rid), count(DISTINCT user_id) FROM s GROUP BY 1 ORDER BY 2 DESC LIMIT 60;
\echo == main series style: style, count
WITH s AS (
  SELECT src FROM chart_drawings d,
    jsonb_array_elements(d.state->'charts') c,
    jsonb_array_elements(c->'panes') p,
    jsonb_array_elements(p->'sources') src
  WHERE jsonb_typeof(d.state->'charts')='array' AND src->>'type'='MainSeries')
SELECT src->'state'->>'style', count(*) FROM s GROUP BY 1 ORDER BY 2 DESC;
\echo == drawing shape: keys of a LineTool source, count
WITH s AS (
  SELECT src FROM chart_drawings d,
    jsonb_array_elements(d.state->'charts') c,
    jsonb_array_elements(c->'panes') p,
    jsonb_array_elements(p->'sources') src
  WHERE jsonb_typeof(d.state->'charts')='array' AND src->>'type' LIKE 'LineTool%')
SELECT (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(src) k), count(*) FROM s GROUP BY 1 ORDER BY 2 DESC LIMIT 6;
\echo == point keys, count
WITH s AS (
  SELECT pt FROM chart_drawings d,
    jsonb_array_elements(d.state->'charts') c,
    jsonb_array_elements(c->'panes') p,
    jsonb_array_elements(p->'sources') src,
    jsonb_array_elements(src->'points') pt
  WHERE jsonb_typeof(d.state->'charts')='array' AND src->>'type' LIKE 'LineTool%' AND jsonb_typeof(src->'points')='array')
SELECT (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(pt) k), count(*) FROM s GROUP BY 1 ORDER BY 2 DESC LIMIT 6;
