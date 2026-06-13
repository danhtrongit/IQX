"""Minimal, branded HTML (+ plaintext) for IQX transactional emails, plus the
small backend HTML pages the email links land on.

Email clients require inline styles, so everything here is intentionally inline
and dependency-free (no Jinja). Copy is in Vietnamese to match the product.
"""

from __future__ import annotations

import html as _html

_BRAND = "IQX"
_PRIMARY = "#2563eb"
_BG = "#f4f5f7"
_CARD = "#ffffff"
_TEXT = "#1f2937"
_MUTED = "#6b7280"


# ── Emails ────────────────────────────────────────────────────────────────


def _email_layout(
    *,
    title: str,
    greeting: str,
    intro: str,
    button_label: str,
    button_url: str,
    outro: str,
) -> tuple[str, str]:
    """Return ``(html, text)`` for a minimal branded email."""
    safe_url = _html.escape(button_url, quote=True)
    shown_url = _html.escape(button_url)
    html_body = f"""\
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:{_BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_BG};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:{_CARD};border-radius:12px;overflow:hidden;
                    border:1px solid #e5e7eb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding:28px 32px 0;">
          <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:{_PRIMARY};">{_BRAND}</span>
        </td></tr>
        <tr><td style="padding:20px 32px 0;">
          <h1 style="margin:0 0 8px;font-size:18px;color:{_TEXT};">{_html.escape(title)}</h1>
          <p style="margin:0 0 6px;font-size:14px;color:{_TEXT};">{_html.escape(greeting)}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:{_TEXT};">{_html.escape(intro)}</p>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;">
          <a href="{safe_url}"
             style="display:inline-block;background:{_PRIMARY};color:#ffffff;text-decoration:none;
                    font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;">{_html.escape(button_label)}</a>
        </td></tr>
        <tr><td style="padding:0 32px;">
          <p style="font-size:12px;color:{_MUTED};line-height:1.6;margin:12px 0 0;">
            Nếu nút trên không hoạt động, hãy sao chép liên kết sau vào trình duyệt:<br>
            <a href="{safe_url}" style="color:{_PRIMARY};word-break:break-all;">{shown_url}</a>
          </p>
          <p style="font-size:13px;color:{_TEXT};line-height:1.6;margin:18px 0 0;">{_html.escape(outro)}</p>
        </td></tr>
        <tr><td style="padding:24px 32px 28px;">
          <hr style="border:none;border-top:1px solid #eef0f2;margin:0 0 12px;">
          <p style="font-size:12px;color:{_MUTED};margin:0;">— Đội ngũ {_BRAND}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
    text_body = (
        f"{title}\n\n"
        f"{greeting}\n{intro}\n\n"
        f"{button_label}: {button_url}\n\n"
        f"{outro}\n\n"
        f"— Đội ngũ {_BRAND}\n"
    )
    return html_body, text_body


def render_verification_email(*, full_name: str | None, verify_url: str) -> tuple[str, str]:
    name = (full_name or "").strip() or "bạn"
    return _email_layout(
        title="Xác thực địa chỉ email",
        greeting=f"Xin chào {name},",
        intro="Cảm ơn bạn đã đăng ký IQX. Vui lòng xác thực địa chỉ email của bạn bằng cách nhấn nút bên dưới.",
        button_label="Xác thực email",
        button_url=verify_url,
        outro="Nếu bạn không tạo tài khoản này, bạn có thể bỏ qua email này. Liên kết sẽ tự hết hạn.",
    )


def render_password_reset_email(*, full_name: str | None, reset_url: str) -> tuple[str, str]:
    name = (full_name or "").strip() or "bạn"
    return _email_layout(
        title="Đặt lại mật khẩu",
        greeting=f"Xin chào {name},",
        intro="Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản IQX của bạn. Nhấn nút bên dưới để chọn mật khẩu mới.",
        button_label="Đặt lại mật khẩu",
        button_url=reset_url,
        outro="Nếu bạn không yêu cầu việc này, hãy bỏ qua email — mật khẩu của bạn vẫn được giữ nguyên. Liên kết sẽ hết hạn sau ít giờ.",
    )


# ── Backend landing pages ─────────────────────────────────────────────────


def _page(*, title: str, heading: str, body_html: str, ok: bool) -> str:
    accent = "#16a34a" if ok else "#dc2626"
    return f"""\
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{_html.escape(title)} · {_BRAND}</title>
</head>
<body style="margin:0;background:{_BG};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:{_TEXT};">
  <div style="max-width:440px;margin:64px auto;padding:0 16px;">
    <div style="background:{_CARD};border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:{_PRIMARY};margin-bottom:20px;">{_BRAND}</div>
      <h1 style="font-size:18px;margin:0 0 8px;color:{accent};">{_html.escape(heading)}</h1>
      {body_html}
    </div>
  </div>
</body>
</html>"""


def verify_result_page(ok: bool, message: str) -> str:
    return _page(
        title="Xác thực email",
        heading="Xác thực thành công" if ok else "Xác thực không thành công",
        body_html=f'<p style="font-size:14px;line-height:1.6;color:{_TEXT};margin:0;">{_html.escape(message)}</p>',
        ok=ok,
    )


def reset_result_page(ok: bool, message: str) -> str:
    return _page(
        title="Đặt lại mật khẩu",
        heading="Đã đổi mật khẩu" if ok else "Không thể đặt lại mật khẩu",
        body_html=f'<p style="font-size:14px;line-height:1.6;color:{_TEXT};margin:0;">{_html.escape(message)}</p>',
        ok=ok,
    )


def reset_form_page(token: str) -> str:
    """A minimal self-contained 'set new password' form.

    Submits to ``POST /api/v1/auth/reset-password`` via fetch and shows the
    result inline — no external JS, no framework.
    """
    safe_token = _html.escape(token, quote=True)
    inner = f"""\
      <p style="font-size:14px;line-height:1.6;color:{_TEXT};margin:0 0 16px;">Nhập mật khẩu mới cho tài khoản của bạn.</p>
      <form id="f" onsubmit="return submitForm(event)">
        <input type="hidden" id="token" value="{safe_token}">
        <input type="password" id="pw" placeholder="Mật khẩu mới" required minlength="8"
               style="width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin:0 0 10px;">
        <input type="password" id="pw2" placeholder="Nhập lại mật khẩu mới" required minlength="8"
               style="width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin:0 0 8px;">
        <p style="font-size:12px;color:{_MUTED};line-height:1.5;margin:0 0 14px;">Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.</p>
        <button type="submit" id="btn"
                style="width:100%;background:{_PRIMARY};color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;padding:12px;cursor:pointer;">Đặt lại mật khẩu</button>
      </form>
      <p id="msg" style="font-size:13px;line-height:1.6;margin:14px 0 0;"></p>
      <script>
        async function submitForm(e) {{
          e.preventDefault();
          var msg = document.getElementById('msg');
          var btn = document.getElementById('btn');
          var pw = document.getElementById('pw').value;
          var pw2 = document.getElementById('pw2').value;
          msg.style.color = '#dc2626';
          if (pw !== pw2) {{ msg.textContent = 'Hai mật khẩu không khớp.'; return false; }}
          btn.disabled = true; btn.textContent = 'Đang xử lý...';
          try {{
            var r = await fetch('/api/v1/auth/reset-password', {{
              method: 'POST', headers: {{ 'Content-Type': 'application/json' }},
              body: JSON.stringify({{ token: document.getElementById('token').value, new_password: pw }})
            }});
            var d = await r.json().catch(function() {{ return {{}}; }});
            if (r.ok) {{
              msg.style.color = '#16a34a';
              msg.textContent = (d && d.message) || 'Mật khẩu đã được đặt lại thành công.';
              document.getElementById('f').style.display = 'none';
            }} else {{
              msg.textContent = (d && d.detail) || 'Liên kết không hợp lệ hoặc đã hết hạn.';
              btn.disabled = false; btn.textContent = 'Đặt lại mật khẩu';
            }}
          }} catch (err) {{
            msg.textContent = 'Có lỗi xảy ra. Vui lòng thử lại.';
            btn.disabled = false; btn.textContent = 'Đặt lại mật khẩu';
          }}
          return false;
        }}
      </script>"""
    return _page(title="Đặt lại mật khẩu", heading="Đặt lại mật khẩu", body_html=inner, ok=True)
