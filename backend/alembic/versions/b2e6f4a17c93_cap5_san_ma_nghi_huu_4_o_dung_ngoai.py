"""cap5 — «Săn mã» thay «4 ô + đứng ngoài»; 2 nhiệm vụ song song

Revision ID: b2e6f4a17c93
Revises: a3f7c1d9e2b8
Create Date: 2026-08-19 12:00:00.000000

Bộ spec bàn giao đợt 6 định nghĩa lại TOÀN BỘ Cấp 5: từ «Lão luyện — phân loại
4 ô + đứng ngoài có chủ đích» thành «Lão luyện — Săn mã». Hình dạng LIVE mới
(mockup ``iqx-cap5-hanhtrinh.html``: ``0/2``, "Hai nhiệm vụ làm song song"):

  ① «Săn 10 mã vào Watchlist» → ``so_ma_da_san >= 10``
  ② «Mua 5 mã từ Watchlist»   → ``so_ma_mua_tu_watchlist >= 5``

CÁI RA ĐI (Cấp 5 cũ, nghỉ hưu hoàn toàn — spec §11 đẩy "biết khi nào KHÔNG mua"
sang Cấp 6+):

  · bảng ``standby_decision`` — nhật ký "đứng ngoài có chủ đích" + chấm né
    đúng/né hụt sau 5 phiên;
  · 5 cột trên ``order_ketso``: ``verdict_he`` / ``verdict_user`` /
    ``verdict_provenance`` / ``o_4`` / ``ly_do_sua`` — bước "phân loại 4 ô";
  · 4 cột trên ``cap5_progress``: ``task_3_done_at``, ``so_lenh_phan_loai``,
    ``so_lan_dung_ngoai_da_cham``, ``ty_le_quyet_dinh_dung``.

★ **``cap5_progress`` GIỮ NGUYÊN TÊN BẢNG và cột ``graduated_at``.**
``app.services.cap6.service`` gác ``POST /cap6/enter`` trên đúng
``cap5_progress.graduated_at``; đổi tên bảng hay đụng cột đó sẽ nhốt vĩnh viễn
mọi user ở cửa Cấp 6. Chỉ các cột NHIỆM VỤ bị thay.

★ **HAI Ô NHIỆM VỤ BỊ TRẢ VỀ NULL, KHÔNG ÁNH XẠ.** Đây là điểm dễ sai nhất.
Nhiệm vụ cũ ① là "lệnh đầu tiên đã phân loại 4 ô", ② là "ghi nước đứng ngoài
đầu tiên" — KHÔNG cái nào bao hàm "săn 10 mã vào Watchlist" hay "mua 5 mã từ
Watchlist". Giữ lại mốc cũ trong ô mới là ghi công việc user chưa từng làm, và
``Cap5Service.graduate`` mới chỉ nhìn đúng hai ô đó ⇒ tốt nghiệp gian lận. Vì
thế cả ``task_1_done_at`` lẫn ``task_2_done_at`` bị set NULL. Ai đã thật sự săn
mã sẽ được ``_recompute_progress`` đóng dấu lại ở lần ``GET /cap5/progress``
đầu tiên (nó đếm lại từ ``cap5_hunt_log``/``order_kehoach`` ở MỌI lần đọc).

★ **``so_lenh_phan_loai``/``so_lan_dung_ngoai_da_cham``/``ty_le_quyet_dinh_dung``
bị XOÁ, không chuyển sang nullable** — chúng chỉ nuôi Thách thức Lão luyện đã
đi cùng bài học cũ. ``ty_le_quyet_dinh_dung`` còn là ``FLOAT NOT NULL DEFAULT
0``: nó trả lời "0%" cho câu hỏi "chưa phân loại lệnh nào" (số bịa).

★ **Cột số MỚI**: ``so_ma_da_san``/``so_ma_mua_tu_watchlist`` là ``INTEGER NOT
NULL DEFAULT 0`` — 0 ở đây là số THẬT (đếm hàng trong bảng ta sở hữu, tính lại
mọi lần đọc). Ngược lại ``best_filter`` (khối ⑫) là **nullable**: NULL = "chưa
đủ lệnh để kết luận bộ lọc nào hợp nhất", không được hiện thành một bộ lọc bất
kỳ. Cùng lý do, 4 cột điểm đồng thuận trên ``watchlist_items``
(``consensus_today``/``consensus_prev``/``consensus_da_cham``/``consensus_at``/
``status``) đều nullable: hệ chưa chấm được 5 lớp cho mã đó thì để trống, KHÔNG
ghi 0/5. ``consensus_da_cham`` tồn tại chính vì nguồn hiện tại KHÔNG chấm được
lớp 💎 Định giá — thiếu nó thì "3/5" không phân biệt nổi với "3 ủng hộ, 1 chưa
biết".

★ ``order_kehoach.from_watchlist`` là **BOOLEAN NULLABLE (ba trạng thái)**:
True = đặt từ mã trong Watchlist, False = server đã kiểm và không phải, NULL =
lệnh Cấp 1-4 cũ chưa ai kiểm. Nếu để NOT NULL DEFAULT false thì mọi lệnh cũ tự
nhiên khẳng định "không đến từ săn mã" — một câu bịa về hàng triệu dòng lịch sử.

★ ``cap5_hunt_log`` (bảng MỚI) là nguồn sự thật của "số mã đã săn". Nó KHÔNG
đếm trên ``watchlist_items`` vì user xoá mã khỏi Watchlist bất cứ lúc nào (trần
50 mã) — nhiệm vụ đã đạt không được tụt lại sau một cú xoá.

★ PROD kỳ vọng **0 dòng** ``cap5_progress`` và **0 dòng** ``standby_decision``
(trần cấp ``CAP_MAX_ENABLED`` mới lên 4, chưa ai vào được Cấp 5; local
``iqx_dev`` cũng 0/0 và ``order_ketso.o_4 IS NOT NULL`` = 0). "Kỳ vọng" không
phải "chứng minh" ⇒ ``tests/test_cap5.py`` vẫn seed hàng kiểu-prod theo DDL của
revision ``c81a4d5e93f2`` (kể cả một dòng ``standby_decision`` và một
``order_ketso`` đã phân loại 4 ô) rồi chạy migration lên/xuống 2 vòng.

DOWNGRADE LÀ LOSSY — nói thẳng:
  · Mọi dòng ``standby_decision`` bị xoá cùng bảng và KHÔNG dựng lại được.
  · Dữ liệu 5 cột 4-ô trên ``order_ketso`` mất hẳn (bảng được dựng lại cột
    rỗng). Service Cấp 5 cũ tính lại ``verdict_he``/``o_4`` từ dữ liệu quy
    trình khi user kết sổ lại, nhưng ``verdict_user``/``ly_do_sua`` (chốt của
    chính user) thì không ai tính lại được.
  · ``so_lenh_phan_loai``/``so_lan_dung_ngoai_da_cham``/
    ``ty_le_quyet_dinh_dung`` quay lại ở 0.
  · ``task_1_done_at``/``task_2_done_at`` mang nghĩa MỚI ("săn 10 mã"/"mua 5
    mã"); downgrade trả chúng về NULL chứ không đổi nghĩa tại chỗ — dưới luật
    cũ hai ô đó nói chuyện khác hẳn, giữ lại là gán bừa.
  · ``cap5_hunt_log`` + các cột săn/đồng thuận trên ``watchlist_items`` +
    ``order_kehoach.from_watchlist``/``hunt_filter`` bị xoá cùng dữ liệu.
Nhờ vậy upgrade → downgrade → upgrade là BẤT ĐỘNG: mọi ô hai chiều đều về NULL
hoặc 0 xác định, không trôi thêm ở vòng thứ hai.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2e6f4a17c93"
down_revision: Union[str, None] = "a3f7c1d9e2b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Nghỉ hưu "đứng ngoài có chủ đích" ────────────────────────
    op.drop_index("ix_standby_decision_user_decided", table_name="standby_decision")
    op.drop_index(op.f("ix_standby_decision_user_id"), table_name="standby_decision")
    op.drop_table("standby_decision")

    # ── 2. Nghỉ hưu "phân loại 4 ô" trên order_ketso ────────────────
    op.drop_column("order_ketso", "ly_do_sua")
    op.drop_column("order_ketso", "o_4")
    op.drop_column("order_ketso", "verdict_provenance")
    op.drop_column("order_ketso", "verdict_user")
    op.drop_column("order_ketso", "verdict_he")

    # ── 3. cap5_progress: 3 nhiệm vụ cũ → 2 nhiệm vụ săn mã ─────────
    # Hai ô nhiệm vụ nói chuyện KHÁC HẲN dưới luật mới ⇒ xoá mốc cũ.
    op.execute("UPDATE cap5_progress SET task_1_done_at = NULL, task_2_done_at = NULL")

    op.drop_column("cap5_progress", "task_3_done_at")
    op.drop_column("cap5_progress", "so_lenh_phan_loai")
    op.drop_column("cap5_progress", "so_lan_dung_ngoai_da_cham")
    op.drop_column("cap5_progress", "ty_le_quyet_dinh_dung")

    op.add_column(
        "cap5_progress",
        sa.Column("so_ma_da_san", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "cap5_progress",
        sa.Column(
            "so_ma_mua_tu_watchlist", sa.Integer(), server_default="0", nullable=False
        ),
    )
    op.add_column(
        "cap5_progress",
        sa.Column(
            "da_xem_tour_sanma", sa.Boolean(), server_default="false", nullable=False
        ),
    )
    # Nullable: "chưa đủ lệnh để kết luận" ≠ một bộ lọc nào đó.
    op.add_column("cap5_progress", sa.Column("best_filter", sa.String(length=16), nullable=True))

    # ── 4. Sổ săn mã (nguồn sự thật của "số mã đã săn") ─────────────
    op.create_table(
        "cap5_hunt_log",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("hunt_filter", sa.String(length=16), nullable=False),
        sa.Column("hunt_signal", sa.String(length=200), nullable=True),
        sa.Column("first_hunted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_hunted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cap5_hunt_log")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_cap5_hunt_log_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", "symbol", name="uq_cap5_hunt_log_user_symbol"),
    )
    op.create_index(
        op.f("ix_cap5_hunt_log_user_id"), "cap5_hunt_log", ["user_id"], unique=False
    )

    # ── 5. Watchlist nâng cấp (§6/§10) ──────────────────────────────
    op.add_column("watchlist_items", sa.Column("hunt_filter", sa.String(length=16), nullable=True))
    op.add_column("watchlist_items", sa.Column("hunt_signal", sa.String(length=200), nullable=True))
    op.add_column(
        "watchlist_items", sa.Column("hunt_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("watchlist_items", sa.Column("consensus_today", sa.Integer(), nullable=True))
    op.add_column("watchlist_items", sa.Column("consensus_prev", sa.Integer(), nullable=True))
    op.add_column("watchlist_items", sa.Column("consensus_da_cham", sa.Integer(), nullable=True))
    op.add_column(
        "watchlist_items", sa.Column("consensus_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("watchlist_items", sa.Column("status", sa.String(length=16), nullable=True))

    # ── 6. order_kehoach: mã đến từ săn hay user tự nhập ────────────
    op.add_column("order_kehoach", sa.Column("from_watchlist", sa.Boolean(), nullable=True))
    op.add_column("order_kehoach", sa.Column("hunt_filter", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("order_kehoach", "hunt_filter")
    op.drop_column("order_kehoach", "from_watchlist")

    op.drop_column("watchlist_items", "status")
    op.drop_column("watchlist_items", "consensus_at")
    op.drop_column("watchlist_items", "consensus_da_cham")
    op.drop_column("watchlist_items", "consensus_prev")
    op.drop_column("watchlist_items", "consensus_today")
    op.drop_column("watchlist_items", "hunt_at")
    op.drop_column("watchlist_items", "hunt_signal")
    op.drop_column("watchlist_items", "hunt_filter")

    op.drop_index(op.f("ix_cap5_hunt_log_user_id"), table_name="cap5_hunt_log")
    op.drop_table("cap5_hunt_log")

    op.drop_column("cap5_progress", "best_filter")
    op.drop_column("cap5_progress", "da_xem_tour_sanma")
    op.drop_column("cap5_progress", "so_ma_mua_tu_watchlist")
    op.drop_column("cap5_progress", "so_ma_da_san")

    op.add_column(
        "cap5_progress", sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "cap5_progress",
        sa.Column("so_lenh_phan_loai", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "cap5_progress",
        sa.Column(
            "so_lan_dung_ngoai_da_cham", sa.Integer(), server_default="0", nullable=False
        ),
    )
    op.add_column(
        "cap5_progress",
        sa.Column("ty_le_quyet_dinh_dung", sa.Float(), server_default="0", nullable=False),
    )
    # Hai ô nhiệm vụ mang nghĩa MỚI — dưới luật cũ chúng nói chuyện khác, nên
    # trả về NULL thay vì gán bừa. Service Cấp 5 cũ tự đóng dấu lại ở lần đọc
    # kế tiếp (nó cũng tính lại từ order_ketso/standby_decision).
    op.execute("UPDATE cap5_progress SET task_1_done_at = NULL, task_2_done_at = NULL")

    op.add_column("order_ketso", sa.Column("verdict_he", sa.String(length=8), nullable=True))
    op.add_column("order_ketso", sa.Column("verdict_user", sa.String(length=8), nullable=True))
    op.add_column("order_ketso", sa.Column("verdict_provenance", sa.JSON(), nullable=True))
    op.add_column("order_ketso", sa.Column("o_4", sa.String(length=16), nullable=True))
    op.add_column("order_ketso", sa.Column("ly_do_sua", sa.Text(), nullable=True))

    op.create_table(
        "standby_decision",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.Column("gia_luc_dung_ngoai", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("cham_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("gia_sau_5_phien", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("ket_qua", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_standby_decision")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_standby_decision_user_id_users"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("ix_standby_decision_user_id"), "standby_decision", ["user_id"], unique=False
    )
    op.create_index(
        "ix_standby_decision_user_decided",
        "standby_decision",
        ["user_id", "decided_at"],
        unique=False,
    )
