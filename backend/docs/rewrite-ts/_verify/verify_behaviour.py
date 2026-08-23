"""Kiểm chứng các KHẲNG ĐỊNH VỀ HÀNH VI trong tài liệu bằng cách gọi thật vào app.

Mỗi assert dưới đây tương ứng một câu khẳng định trong ch02/ch03/ch04/ch20.
Chạy: .venv/bin/python docs/rewrite-ts/_verify/verify_behaviour.py
"""
from __future__ import annotations
import os, sys, json
ROOT = "/Users/danhtrongit/Projects/IQX/backend"
sys.path.insert(0, ROOT)
os.environ.setdefault("APP_ENV", "development")

from fastapi.testclient import TestClient   # noqa: E402
from app.main import app                    # noqa: E402

c = TestClient(app, raise_server_exceptions=False)
OK = FAIL = 0
def chk(claim, cond, got=""):
    global OK, FAIL
    if cond: OK += 1; print(f"  ✅ {claim}")
    else:    FAIL += 1; print(f"  ❌ {claim}\n       thực tế: {got}")

print("── ch02: X-Request-ID ─────────────────────────────")
r = c.get("/api/v1/health")
chk("mọi response echo header X-Request-ID", "x-request-id" in r.headers, dict(r.headers))
chk("thiếu header thì server tự sinh UUID4 (36 ký tự)",
    len(r.headers.get("x-request-id", "")) == 36, r.headers.get("x-request-id"))
mine = "11111111-2222-3333-4444-555555555555"
r2 = c.get("/api/v1/health", headers={"X-Request-ID": mine})
chk("client gửi X-Request-ID thì echo lại nguyên vẹn",
    r2.headers.get("x-request-id") == mine, r2.headers.get("x-request-id"))

print("── ch04: envelope lỗi AppException ────────────────")
r = c.get("/api/v1/users/me")          # không token
chk("thiếu Authorization -> 401 (không phải 403)", r.status_code == 401, r.status_code)
b = r.json()
chk("body có đúng 2 khoá {detail, code}", set(b) == {"detail", "code"}, b)
chk("code == 'UNAUTHORIZED'", b.get("code") == "UNAUTHORIZED", b.get("code"))
chk("detail == 'Yêu cầu xác thực'", b.get("detail") == "Yêu cầu xác thực", b.get("detail"))
# Bug cũ (handler nuốt exc.headers) ĐÃ SỬA 2026-08-18 -> header phải có mặt.
chk("401 có header WWW-Authenticate: Bearer (bug đã sửa)",
    r.headers.get("www-authenticate") == "Bearer", r.headers.get("www-authenticate"))
chk("KHÔNG có field 'errors' (dù ErrorResponse khai báo)", "errors" not in b, b)

print("── ch04: 422 của Pydantic ─────────────────────────")
r = c.post("/api/v1/auth/login", json={})
chk("thiếu field bắt buộc -> 422", r.status_code == 422, r.status_code)
b = r.json()
chk("422 có khoá 'detail' là LIST (khác envelope lỗi thường)",
    isinstance(b.get("detail"), list), type(b.get("detail")).__name__)
if isinstance(b.get("detail"), list) and b["detail"]:
    it = b["detail"][0]
    chk("mỗi item 422 có type/loc/msg", {"type","loc","msg"} <= set(it), sorted(it))
    chk("422 KHÔNG có field 'code'", "code" not in b, sorted(b))

print("── ch04: 404 / 405 mặc định Starlette ─────────────")
r = c.get("/api/v1/khong-ton-tai")
chk("route lạ -> 404 {'detail': 'Not Found'}",
    r.status_code == 404 and r.json() == {"detail": "Not Found"}, (r.status_code, r.text[:80]))
r = c.delete("/api/v1/health")
chk("method sai -> 405", r.status_code == 405, r.status_code)

print("── ch02: trailing slash của /users/ ───────────────")
r = c.get("/api/v1/users/", follow_redirects=False)
chk("/api/v1/users/ (CÓ slash) không redirect", r.status_code != 307, r.status_code)
r = c.get("/api/v1/users", follow_redirects=False)
chk("/api/v1/users (KHÔNG slash) -> 307 redirect", r.status_code == 307, r.status_code)

print("── ch20: 2 route ẩn khỏi OpenAPI ──────────────────")
r = c.get("/api/v1/auth/verify-email", params={"token": "rac"})
chk("verify-email token sai -> 400", r.status_code == 400, r.status_code)
chk("verify-email trả text/html (không JSON)",
    "text/html" in r.headers.get("content-type", ""), r.headers.get("content-type"))
chk("verify-email HTML chứa đúng câu lỗi tài liệu ghi",
    "Liên kết xác thực không hợp lệ hoặc đã hết hạn." in r.text, r.text[:120])
r = c.get("/api/v1/auth/verify-email")
chk("verify-email THIẾU token -> 422 JSON (không phải HTML)",
    r.status_code == 422 and "application/json" in r.headers.get("content-type",""), r.status_code)
r = c.get("/api/v1/auth/reset-password", params={"token": "abc"})
chk("reset-password form LUÔN 200 kể cả token rác", r.status_code == 200, r.status_code)
chk("reset-password form escape token vào input hidden",
    'id="token"' in r.text, r.text[:120])
_xss = '"><script>alert(1)</script>'
r = c.get("/api/v1/auth/reset-password", params={"token": _xss})
chk("reset-password ESCAPE token (chống XSS phản chiếu)",
    _xss not in r.text and "&lt;script&gt;" in r.text,
    "payload phản chiếu nguyên văn!" if _xss in r.text else "không thấy dạng đã escape")

print("── ch05: docs bật ở dev ───────────────────────────")
chk("/openapi.json phục vụ ở dev", c.get("/openapi.json").status_code == 200)
chk("/docs phục vụ ở dev", c.get("/docs").status_code == 200)

print("── ch03: forgot-password không lộ email tồn tại ───")
a = c.post("/api/v1/auth/forgot-password", json={"email": "khongtontai@iqx.vn"})
chk("forgot-password email lạ vẫn 200", a.status_code == 200, a.status_code)
chk("thông điệp trung lập (không tiết lộ email có tồn tại)",
    "Nếu email tồn tại" in a.json().get("message", ""), a.json())

print("\n" + "=" * 60)
print(f"ĐẠT {OK} | HỎNG {FAIL}")
sys.exit(1 if FAIL else 0)
