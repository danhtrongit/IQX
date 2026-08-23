"""Đối chiếu bộ tài liệu docs/rewrite-ts/ với source Python thật.

Tất định, không dùng LLM. Chạy:  .venv/bin/python docs/rewrite-ts/_verify/verify_docs.py
Thoát 0 nếu không có lỗi CRITICAL.
"""
from __future__ import annotations
import json, os, re, sys, glob

ROOT = "/Users/danhtrongit/Projects/IQX/backend"
DOCS = f"{ROOT}/docs/rewrite-ts"
sys.path.insert(0, ROOT)
os.environ.setdefault("APP_ENV", "development")

FAIL: list[tuple[str, str, str]] = []   # (severity, check, detail)
def bad(sev, check, detail): FAIL.append((sev, check, detail))

def md_files():
    return sorted(p for p in glob.glob(f"{DOCS}/*.md"))

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
man = json.load(open(f"{DOCS}/types/endpoint-manifest.json"))
by_ch: dict[str, list[tuple[str, str]]] = {}
for op in man["operations"]:
    by_ch.setdefault(op["chapter"], []).append((op["method"], op["path"]))

covered = 0
for ch, want in sorted(by_ch.items()):
    p = f"{DOCS}/{ch}"
    if not os.path.exists(p):
        bad("CRITICAL", "coverage", f"thiếu file {ch} ({len(want)} endpoint)"); continue
    heads = re.findall(r"^###\s+(.*)$", open(p).read(), re.M)
    for m, path in want:
        if any(m in h and path in h for h in heads): covered += 1
        else: bad("CRITICAL", "coverage", f"{ch}: thiếu mục ### cho {m} {path}")
print(f"[1] Độ phủ endpoint      : {covered}/{len(man['operations'])}")

# ══ 2. CURL TRỎ TỚI ROUTE CÓ THẬT ═══════════════════════════════
curl_n = curl_bad = 0
for p in md_files():
    txt = open(p).read()
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
doc_txt = open(f"{DOCS}/05-cau-hinh-env.md").read()
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
doc4 = open(f"{DOCS}/04-loi-va-ma-loi.md").read()
miss_codes = sorted(c for c in real_codes if c and c not in doc4)
for c in miss_codes: bad("MAJOR", "errcode", f"ch04 thiếu mã lỗi: {c}")
print(f"[4] Mã lỗi               : {len(real_codes) - len(miss_codes)}/{len(real_codes)}")

# ══ 5. BẢNG CSDL ════════════════════════════════════════════════
real_tables = set(Base.metadata.tables)
db_txt = "".join(open(f"{DOCS}/{f}").read() for f in
                 ("06a-csdl-nguoi-dung-thanh-toan.md", "06b-csdl-giao-dich-canh-bao.md",
                  "06c-csdl-cap-va-phan-tich.md"))
miss_tbl = sorted(t for t in real_tables if t not in db_txt)
for t in miss_tbl: bad("CRITICAL", "table", f"ch06* thiếu bảng: {t}")
print(f"[5] Bảng CSDL            : {len(real_tables) - len(miss_tbl)}/{len(real_tables)}")

# ══ 6. LINK NỘI BỘ ══════════════════════════════════════════════
dead = 0
for p in md_files():
    _t = open(p).read()
    _t = re.sub(r"^(?:```|~~~).*?^(?:```|~~~)\s*$", "", _t, flags=re.M | re.S)   # bỏ code block
    _t = re.sub(r"`[^`\n]*`", "", _t)                                            # bỏ inline code
    for l in re.findall(r"\]\(([^)#][^)]*)\)", _t):
        if l.startswith(("http", "mailto")): continue
        tgt = os.path.normpath(os.path.join(DOCS, l.split("#")[0]))
        if not os.path.exists(tgt):
            dead += 1; bad("MINOR", "link", f"{os.path.basename(p)}: link chết -> {l}")
print(f"[6] Link nội bộ          : {'OK' if not dead else f'{dead} link chết'}")

# ══ 7. FENCE CÂN BẰNG ═══════════════════════════════════════════
odd = 0
for p in md_files():
    L = open(p).read().split("\n")
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
man_routes = {(o["method"], o["path"]) for o in man["operations"]}
for m, pth in sorted(real_routes - man_routes):
    bad("CRITICAL", "route", f"route CÓ THẬT nhưng thiếu trong manifest: {m} {pth}")
for m, pth in sorted(man_routes - real_routes):
    bad("CRITICAL", "route", f"manifest có route KHÔNG tồn tại trong app: {m} {pth}")
ws_routes = [r.path for r in app.routes if isinstance(r, APIWebSocketRoute)]
print(f"[8] Route thật vs manifest: {len(real_routes & man_routes)}/{len(real_routes)}"
      f" (+{len(ws_routes)} WebSocket)")

# ── tổng kết ────────────────────────────────────────────────────
print("\n" + "=" * 72)
crit = [f for f in FAIL if f[0] == "CRITICAL"]
majr = [f for f in FAIL if f[0] == "MAJOR"]
minr = [f for f in FAIL if f[0] == "MINOR"]
print(f"CRITICAL {len(crit)} | MAJOR {len(majr)} | MINOR {len(minr)}")
for sev, chk, d in crit + majr + minr:
    print(f"  [{sev:8}] {chk:8} {d}")
sys.exit(1 if crit else 0)
