"""Đối chiếu bộ tài liệu docs/rewrite-ts/ với source Python thật.

Tất định, không dùng LLM. Chạy:  .venv/bin/python docs/rewrite-ts/_verify/verify_docs.py
Thoát 0 nếu không có lỗi CRITICAL.
"""
from __future__ import annotations
import json
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
DOCS = ROOT / "docs" / "rewrite-ts"
sys.path.insert(0, str(ROOT))
os.environ.setdefault("APP_ENV", "development")

FAIL: list[tuple[str, str, str]] = []   # (severity, check, detail)
def bad(sev, check, detail): FAIL.append((sev, check, detail))

def md_files():
    return sorted(DOCS.glob("*.md"))

# ── nguồn sự thật: app đang chạy ────────────────────────────────
from app.main import app                      # noqa: E402
from app.core.config import Settings          # noqa: E402
from app.core import exceptions as exc_mod    # noqa: E402
import app.models as _models                  # noqa: E402,F401
from app.core.database import Base            # noqa: E402

spec = app.openapi()
ROUTES = {(m.upper(), p) for p, ops in spec["paths"].items()
          for m in ops if m in ("get", "post", "put", "patch", "delete")}
HIDDEN_PATHS = ["/api/v1/auth/verify-email", "/api/v1/auth/reset-password"]
ALL_PATHS = list(spec["paths"]) + HIDDEN_PATHS
PATH_RE = [(p, re.compile("^" + re.sub(r"\{[^}]+\}", r"[^/]+", p) + "$")) for p in ALL_PATHS]

# ══ 1. ĐỘ PHỦ ENDPOINT ═══════════════════════════════════════════
man = json.load((DOCS / "types" / "endpoint-manifest.json").open())
by_ch: dict[str, list[tuple[str, str]]] = {}
for op in man["operations"]:
    by_ch.setdefault(op["chapter"], []).append((op["method"], op["path"]))

covered = 0
for ch, want in sorted(by_ch.items()):
    p = DOCS / ch
    if not p.exists():
        bad("CRITICAL", "coverage", f"thiếu file {ch} ({len(want)} endpoint)"); continue
    heads = re.findall(r"^###\s+(.*)$", p.read_text(), re.M)
    for m, path in want:
        if any(m in h and path in h for h in heads): covered += 1
        else: bad("CRITICAL", "coverage", f"{ch}: thiếu mục ### cho {m} {path}")
print(f"[1] Độ phủ endpoint      : {covered}/{len(man['operations'])}")

# ══ 2. CURL TRỎ TỚI ROUTE CÓ THẬT ═══════════════════════════════
curl_n = curl_bad = 0
for p in md_files():
    txt = p.read_text()
    for m in re.finditer(r"curl[^\n]*(?:\\\n[^\n]*)*", txt):
        block = m.group(0)
        um = re.search(r"['\"]https?://([^/'\"]+)(/[^'\"\s]*)['\"]", block)
        if not um: continue
        host, url = um.group(1), um.group(2).split("?")[0]
        # ch07 đặc tả API của nhà cung cấp NGOÀI -> không phải route IQX
        if not re.search(r"(^|\.)iqx\.vn$|^localhost", host): continue
        if url != "/" : url = url  # GIỮ trailing slash: /api/v1/users/ khác /api/v1/users
        if url.startswith("/media") or url in ("/docs", "/openapi.json", "/redoc"): continue
        meth = (re.search(r"-X\s+([A-Z]+)", block) or [None, "GET"])[1]
        curl_n += 1
        # bỏ placeholder $VAR, thay giá trị thật -> khớp template
        if not any(rx.match(url) for _, rx in PATH_RE):
            curl_bad += 1
            bad("MAJOR", "curl", f"{os.path.basename(p)}: URL không khớp route nào: {meth} {url}")
print(f"[2] curl khớp route      : {curl_n - curl_bad}/{curl_n}")

# ══ 3. BIẾN ENV ═════════════════════════════════════════════════
real_env = {n for n in Settings.model_fields if n.isupper()}
doc_txt = (DOCS / "05-cau-hinh-env.md").read_text()
doc_env = set(re.findall(r"\b([A-Z][A-Z0-9_]{3,})\b", doc_txt))
missing_env = sorted(real_env - doc_env)
# "biến ma" = tên xuất hiện Ở CỘT ĐẦU của bảng tham chiếu env, hoặc là KHOÁ trong
# khối dotenv (`KEY=value`). Loại trừ: giá trị placeholder, mức log, hằng số nội bộ.
_tbl = set(re.findall(r"^\|\s*`([A-Z][A-Z0-9_]{3,})`\s*\|", doc_txt, re.M))
_dot = set(re.findall(r"^([A-Z][A-Z0-9_]{3,})=", doc_txt, re.M))
_IGNORE = {"CHANGE_ME", "CHANGE_ME_TO_A_RANDOM_SECRET_KEY", "WARNING", "INFO", "DEBUG",
           "ERROR", "CRITICAL", "TESTING"}
ghost_env = sorted((_tbl | _dot) - real_env - _IGNORE)
print(f"[3] Biến env             : {len(real_env - set(missing_env))}/{len(real_env)} có mặt"
      f"{'' if not ghost_env else f'; {len(ghost_env)} biến ma'}")

# ══ 4. MÃ LỖI ═══════════════════════════════════════════════════
real_codes = set()
for name in dir(exc_mod):
    cls = getattr(exc_mod, name)
    if isinstance(cls, type) and issubclass(cls, exc_mod.AppException) and cls is not exc_mod.AppException:
        try: real_codes.add(cls().code)
        except Exception: pass
doc4 = (DOCS / "04-loi-va-ma-loi.md").read_text()
miss_codes = sorted(c for c in real_codes if c and c not in doc4)
for c in miss_codes: bad("MAJOR", "errcode", f"ch04 thiếu mã lỗi: {c}")
print(f"[4] Mã lỗi               : {len(real_codes) - len(miss_codes)}/{len(real_codes)}")

# ══ 5. BẢNG CSDL ════════════════════════════════════════════════
real_tables = set(Base.metadata.tables)
db_txt = "".join(
    (DOCS / filename).read_text()
    for filename in (
        "06a-csdl-nguoi-dung-thanh-toan.md",
        "06b-csdl-giao-dich-canh-bao.md",
        "06c-csdl-cap-va-phan-tich.md",
    )
)
miss_tbl = sorted(t for t in real_tables if t not in db_txt)
for t in miss_tbl: bad("CRITICAL", "table", f"ch06* thiếu bảng: {t}")
print(f"[5] Bảng CSDL            : {len(real_tables) - len(miss_tbl)}/{len(real_tables)}")

# ══ 6. LINK NỘI BỘ ══════════════════════════════════════════════
dead = 0
for p in md_files():
    _t = p.read_text()
    _t = re.sub(r"^(?:```|~~~).*?^(?:```|~~~)\s*$", "", _t, flags=re.M | re.S)   # bỏ code block
    _t = re.sub(r"`[^`\n]*`", "", _t)                                            # bỏ inline code
    for l in re.findall(r"\]\(([^)#][^)]*)\)", _t):
        if l.startswith(("http", "mailto")): continue
        tgt = DOCS / l.split("#")[0]
        if not os.path.exists(tgt):
            dead += 1; bad("MINOR", "link", f"{os.path.basename(p)}: link chết -> {l}")
print(f"[6] Link nội bộ          : {'OK' if not dead else f'{dead} link chết'}")

# ══ 7. FENCE CÂN BẰNG ═══════════════════════════════════════════
odd = 0
for p in md_files():
    L = p.read_text().split("\n")
    if len([1 for x in L if x.startswith("~~~")]) % 2 or len([1 for x in L if x.startswith("```")]) % 2:
        odd += 1; bad("MAJOR", "fence", f"{os.path.basename(p)}: code fence lệch")
print(f"[7] Code fence           : {'OK' if not odd else f'{odd} file lệch'}")

# ══ 8. ROUTE THẬT vs MANIFEST (bắt route include_in_schema=False) ═══
from fastapi.routing import APIRoute, APIWebSocketRoute   # noqa: E402
real_routes = set()
for r in app.routes:
    if isinstance(r, APIRoute):
        for m in r.methods:
            if m not in ("HEAD", "OPTIONS"): real_routes.add((m, r.path))

# ══ 9. DANH MỤC ENDPOINT vs MANIFEST/ROUTE THẬT ════════════════════
index_txt = (DOCS / "90-danh-muc-endpoint.md").read_text()
index_rows = {
    (method, path)
    for method, path in re.findall(
        r"\|\s*`(GET|POST|PUT|PATCH|DELETE)`\s*\|\s*`([^`]+)`\s*\|",
        index_txt,
    )
}
manifest_rows = {(operation["method"], operation["path"]) for operation in man["operations"]}
index_count_match = re.search(r"^# Danh mục đầy đủ (\d+) endpoint$", index_txt, re.M)
index_count = int(index_count_match.group(1)) if index_count_match else None
if index_count != len(manifest_rows):
    bad("CRITICAL", "endpoint-index", "tổng endpoint trong ch90 lệch manifest")
if index_rows != manifest_rows:
    bad("CRITICAL", "endpoint-index", "method/path trong ch90 lệch manifest")
if index_rows != real_routes:
    bad("CRITICAL", "endpoint-index", "method/path trong ch90 lệch route thật")
chapter_counts = {
    chapter: len(operations)
    for chapter, operations in by_ch.items()
}
for chapter, count in chapter_counts.items():
    section = re.search(
        rf"^## \[{re.escape(chapter)}\]\([^)]+\)\n\n(\d+) endpoint\.",
        index_txt,
        re.M,
    )
    if section is None or int(section.group(1)) != count:
        bad("CRITICAL", "endpoint-index", f"ch90 lệch số endpoint {chapter}")
print(
    f"[9] Danh mục endpoint   : {len(index_rows)}/{len(manifest_rows)} "
    f"method/path khớp manifest và route"
)
man_routes = {(o["method"], o["path"]) for o in man["operations"]}
for m, pth in sorted(real_routes - man_routes):
    bad("CRITICAL", "route", f"route CÓ THẬT nhưng thiếu trong manifest: {m} {pth}")
for m, pth in sorted(man_routes - real_routes):
    bad("CRITICAL", "route", f"manifest có route KHÔNG tồn tại trong app: {m} {pth}")
ws_routes = [r.path for r in app.routes if isinstance(r, APIWebSocketRoute)]
print(f"[8] Route thật vs manifest: {len(real_routes & man_routes)}/{len(real_routes)}"
      f" (+{len(ws_routes)} WebSocket)")

# ══ 10. TỔNG SỐ HỢP ĐỒNG ĐƯỢC QUẢNG BÁ ════════════════════════════
openapi_operations = [
    operation
    for path_item in spec["paths"].values()
    for method, operation in path_item.items()
    if method in ("get", "post", "put", "patch", "delete")
]
openapi_count = len(openapi_operations)
openapi_paths = len(spec["paths"])
schema_count = len(spec.get("components", {}).get("schemas", {}))
secure_count = sum(bool(operation.get("security")) for operation in openapi_operations)
public_count = openapi_count - secure_count
status_counts = {
    status: sum(status in operation.get("responses", {}) for operation in openapi_operations)
    for status in ("200", "201", "202", "204", "422")
}
advertised = {
    "00-README.md": (
        f"**{len(real_routes)}** ({openapi_count} trong OpenAPI + **{len(real_routes) - openapi_count} route ẩn**)",
        f"| Schema request/response | {schema_count} |",
    ),
    "01-kien-truc-va-framework.md": (
        f"**{len(real_routes)}** ({openapi_count} hiện trong OpenAPI + {len(real_routes) - openapi_count} route HTML ẩn)",
        f"| Đường dẫn (path) khác nhau | {len({path for _, path in real_routes})} ({openapi_paths} hiện trong OpenAPI) |",
        f"| Schema OpenAPI (request/response model) | {schema_count} |",
        f"tự sinh** {openapi_paths} path + {schema_count} schema",
    ),
    "02-quy-uoc-api.md": (
        f"cả {len(real_routes)} endpoint",
        f"{secure_count} endpoint có security, {status_counts['422']} khai báo 422",
        f"**{openapi_count} operation hiện trong OpenAPI**",
        f"Trong {openapi_count} operation: **{secure_count}** operation",
        f"**{status_counts['422']} / {openapi_count} operation**",
        f"Đếm từ OpenAPI ({openapi_count} operation): `200` × {status_counts['200']}, `201` × {status_counts['201']}, `202` × {status_counts['202']}, `204` × {status_counts['204']}, `422` × {status_counts['422']}.",
        f"với {secure_count}/{openapi_count} operation",
    ),
}
for filename, claims in advertised.items():
    text = (DOCS / filename).read_text()
    for claim in claims:
        if claim not in text:
            bad("CRITICAL", "advertised-totals", f"{filename}: thiếu/sai {claim}")
if public_count != sum(not bool(operation.get("security")) for operation in openapi_operations):
    bad("CRITICAL", "advertised-totals", "đếm public/security không khép kín")
print(
    f"[10] Tổng số quảng bá    : {len(real_routes)} route · {openapi_count} OpenAPI · "
    f"{openapi_paths} path · {schema_count} schema · {secure_count} secure · "
    f"{status_counts['422']} response 422"
)

# ══ 11. THAM CHIẾU ENDPOINT KHÔNG LỖI THỜI ═══════════════════════
# A retired route is only permitted where the line or its enclosing heading
# explicitly identifies the passage as historical migration/reference material.
HISTORICAL_ROUTE_CONTEXT = re.compile(
    r"\b(?:migration|migrate|historical|legacy|reference)\b|"
    r"lịch\s+sử|đã\s+(?:bỏ|xóa)|đường\s+dẫn\s+cũ",
    re.I,
)
PARAMETER_PLACEHOLDER = re.compile(r"\{[^}]+\}|:[A-Za-z_]\w*|<[A-Za-z_]\w*>|\$[A-Za-z_]\w*")
endpoint_ref = re.compile(r"/api/v1/[A-Za-z0-9_{}./:*$…-]+")

def normalize_reference_path(path: str) -> str:
    path = re.split(r"[?#<]", path, maxsplit=1)[0]
    return path.rstrip(".,;:/")

def route_reference_pattern(path: str) -> re.Pattern[str]:
    parts = PARAMETER_PLACEHOLDER.split(normalize_reference_path(path))
    return re.compile("^" + "[^/]+".join(re.escape(part) for part in parts) + "$")

reference_paths = {
    normalize_reference_path(path)
    for path in [*(path for _, path in real_routes), *ws_routes]
}
reference_patterns = [route_reference_pattern(path) for path in reference_paths]

def is_live_reference(reference: str) -> bool:
    if "/endpoints/" in reference or "/router.py" in reference:
        return True
    if reference.endswith("...") or "…" in reference:
        return True
    normalized = normalize_reference_path(reference)
    wildcard_suffix = "/**" if normalized.endswith("/**") else "/*"
    if normalized.endswith(wildcard_suffix):
        prefix = normalized[: -len(wildcard_suffix)]
        return any(path.startswith(f"{prefix}/") for path in reference_paths)
    return (
        normalized in reference_paths
        or any(path.startswith(f"{normalized}/") for path in reference_paths)
        or any(pattern.fullmatch(normalized) for pattern in reference_patterns)
    )

route_ref_count = route_ref_bad = 0
for doc_path in md_files():
    lines = doc_path.read_text().splitlines()
    heading = ""
    for line_no, line in enumerate(lines, start=1):
        if line.startswith("#"):
            heading = line
        for reference in endpoint_ref.findall(line):
            route_ref_count += 1
            if is_live_reference(reference):
                continue
            if HISTORICAL_ROUTE_CONTEXT.search(line) or HISTORICAL_ROUTE_CONTEXT.search(heading):
                continue
            route_ref_bad += 1
            bad(
                "CRITICAL",
                "route-reference",
                f"{doc_path.name}:{line_no}: endpoint không có route thật: {reference}",
            )
print(f"[11] Tham chiếu endpoint : {route_ref_count - route_ref_bad}/{route_ref_count} khớp route thật")

# ── tổng kết ────────────────────────────────────────────────────
print("\n" + "=" * 72)
crit = [f for f in FAIL if f[0] == "CRITICAL"]
majr = [f for f in FAIL if f[0] == "MAJOR"]
minr = [f for f in FAIL if f[0] == "MINOR"]
print(f"CRITICAL {len(crit)} | MAJOR {len(majr)} | MINOR {len(minr)}")
for sev, chk, d in crit + majr + minr:
    print(f"  [{sev:8}] {chk:8} {d}")
sys.exit(1 if crit else 0)
