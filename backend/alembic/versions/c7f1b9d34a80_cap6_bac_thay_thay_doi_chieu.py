"""cap6 — «Bậc thầy» (bảng mâu thuẫn + nhận định 4 mức) thay «Đối chiếu»

Revision ID: c7f1b9d34a80
Revises: b2e6f4a17c93
Create Date: 2026-08-23 14:00:00.000000

Bộ spec bàn giao đợt 7 (``demo-trading/LEVEL 6/IQX-Cap6-Spec.md``) định nghĩa
lại TOÀN BỘ Cấp 6: từ «Đối chiếu — gợi ý lớp ưu tiên theo 6 kiểu cổ phiếu»
thành «Bậc thầy — xử lý mâu thuẫn giữa 5 lớp». Hình dạng LIVE mới (mockup
``iqx-cap6-hanhtrinh.html``: ``0/1``, "một nhiệm vụ thuần hành vi"):

  ① «Xử lý mâu thuẫn nhất quán» →
       ``so_lan_xu_ly_nhat_quan >= 3`` VÀ ``so_lan_xu_ly_veto_nhat_quan >= 2``

CÁI RA ĐI (Cấp 6 cũ, nghỉ hưu hoàn toàn):

  · 6 cột trên ``order_kehoach``: ``kieu_co_phieu`` / ``lop_mau_thuan`` /
    ``trong_so_goi_y`` / ``lop_quyet_dinh`` / ``khop_goi_y`` /
    ``ly_do_doi_chieu`` — bước "Đối chiếu" + bảng trọng số gợi ý;
  · 7 cột nhiệm vụ trên ``cap6_progress``: ``task_1_done_at`` /
    ``task_2_done_at`` / ``task_3_done_at`` / ``so_lenh_doi_chieu`` /
    ``so_kieu_da_gap`` / ``ty_le_thang_khop`` / ``ty_le_thang_lech``.

★ **XOÁ HẲN, KHÔNG ÁNH XẠ, KHÔNG ĐỂ LẠI CỘT MỒ CÔI.** Không ô cũ nào bao hàm ô
mới: "đã đối chiếu 20 lệnh theo bảng trọng số" không nói gì về "đọc mâu thuẫn
đúng mức rồi hành động tương xứng". Giữ lại một cột không ai đọc còn nguy hiểm
hơn: repo này từng ship một dòng đọc cột đã chết và in số bịa suốt cả đợt
deploy. ``Cap6Service`` mới KHÔNG tham chiếu bất kỳ tên nào ở trên.

★ **``cap6_progress`` GIỮ NGUYÊN TÊN BẢNG và cột ``graduated_at``.**
``app.services.cap7.service`` gác ``POST /cap7/enter`` trên đúng
``cap6_progress.graduated_at``; đổi tên bảng hay đụng cột đó sẽ nhốt vĩnh viễn
mọi user ở cửa Cấp 7. Dữ liệu ``graduated_at`` cũng được GIỮ NGUYÊN (cùng lựa
chọn với ``b2e6f4a17c93`` cho ``cap5_progress``): ai đã qua cửa rồi thì không bị
đá ngược về. Khác Cấp 5, ở đây không còn ô ``task_*_done_at`` nào để mang nghĩa
mới, nên không có mốc cũ nào cần trả về NULL — hai bộ đếm mới được
``_recompute_progress`` tính lại từ ``order_kehoach``/``cap6_skip`` ở MỌI lần
đọc.

★★ **``tong_lai_lenh_cap6_pct`` là FLOAT NULLABLE, KHÔNG server_default.**
NULL = "chưa có lệnh Cấp-6 nào đóng"; ``0`` là một câu KHÁC HẲN ("đã đóng lệnh,
hoà vốn"). Đây đúng là lớp lỗi mà revision ``7b3c1e5a9d24`` phải ra đời để vá
(``ty_le_thang_khop`` ``NOT NULL DEFAULT 0`` khiến user ngày đầu đọc "0%" ngay
dưới thẻ nói "chưa có dữ liệu"). Ngược lại ``so_lan_xu_ly_nhat_quan`` /
``so_lan_xu_ly_veto_nhat_quan`` là ``INTEGER NOT NULL DEFAULT 0`` — 0 ở đó là số
THẬT (đếm hàng trong bảng ta sở hữu), không phải "chưa biết".

★ ``order_kehoach.had_conflict`` / ``had_veto`` / ``veto_layers`` là **NULLABLE
BA TRẠNG THÁI**: True/False = server đã kiểm · NULL = lệnh Cấp 1-5 (hoặc lệnh
Cấp 6 mà mã chưa có bản AI Insight còn hiệu lực) nên chưa ai kiểm. ``NOT NULL
DEFAULT false`` sẽ khiến mọi lệnh cũ tự khẳng định "không có mâu thuẫn" — một
câu bịa về toàn bộ lịch sử. Ba cột này do SERVER suy lại từ ``ai_insight_history``
ở mọi lần ghi; chỉ ``conflict_level`` đến từ client.

★ ``cap6_skip`` (bảng MỚI) — nút «Không mua lần này» (spec §7). Cố ý KHÔNG
unique theo ``(user_id, symbol)``: đứng ngoài cùng một mã ở hai phiên là HAI
quyết định, và khối ⑮ đếm "N lần đứng ngoài" chứ không đếm "N mã". Không có cột
kết quả và không có cron chấm "né đúng/né hụt" — spec §7/§13 xếp việc theo dõi
giá sau khi không mua ra NGOÀI phạm vi Cấp 6.

★ PROD kỳ vọng **0 dòng** ``cap6_progress`` (trần cấp ``CAP_MAX_ENABLED`` chưa
mở tới Cấp 6) và **0 dòng** ``order_kehoach`` có ``lop_quyet_dinh IS NOT NULL``.
"Kỳ vọng" không phải "chứng minh" ⇒ ``tests/test_cap6.py`` vẫn seed hàng
kiểu-prod theo DDL của revision ``1df8155bcd7c`` (một ``cap6_progress`` đã tốt
nghiệp + một ``order_kehoach`` đã đối chiếu) rồi chạy migration lên/xuống 2 vòng
và SO SNAPSHOT CỘT THẬT của cả 3 bảng.

DOWNGRADE LÀ LOSSY — nói thẳng:
  · Mọi dòng ``cap6_skip`` bị xoá cùng bảng và KHÔNG dựng lại được.
  · ``had_conflict``/``conflict_level``/``had_veto``/``veto_layers`` trên
    ``order_kehoach`` mất hẳn. ``conflict_level`` là NHẬN ĐỊNH CỦA CHÍNH USER —
    không ai tính lại được nó.
  · 6 cột «Đối chiếu» quay lại RỖNG (toàn NULL): chúng được dựng lại như cột,
    không như dữ liệu. Service Cấp 6 cũ suy lại ``kieu_co_phieu``/
    ``trong_so_goi_y``/``khop_goi_y`` khi user đối chiếu lại, nhưng
    ``lop_quyet_dinh``/``ly_do_doi_chieu`` (chốt của chính user) thì không.
  · 7 ô nhiệm vụ cũ quay lại ở 0/NULL; ``Cap6Service`` cũ tự đóng dấu lại ở lần
    đọc kế tiếp (nó cũng tính lại từ ``order_kehoach``/``order_ketso``).
  · ``so_lan_xu_ly_nhat_quan``/``so_lan_xu_ly_veto_nhat_quan``/
    ``tong_lai_lenh_cap6_pct``/``da_xem_tour_mauthuan`` bị xoá cùng dữ liệu.
Nhờ vậy upgrade → downgrade → upgrade là BẤT ĐỘNG: mọi ô hai chiều đều về NULL
hoặc 0 xác định, không trôi thêm ở vòng thứ hai.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7f1b9d34a80"
down_revision: Union[str, None] = "b2e6f4a17c93"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Nghỉ hưu bước «Đối chiếu» trên order_kehoach ─────────────
    op.drop_column("order_kehoach", "ly_do_doi_chieu")
    op.drop_column("order_kehoach", "khop_goi_y")
    op.drop_column("order_kehoach", "lop_quyet_dinh")
    op.drop_column("order_kehoach", "trong_so_goi_y")
    op.drop_column("order_kehoach", "lop_mau_thuan")
    op.drop_column("order_kehoach", "kieu_co_phieu")

    # ── 2. Khối Cấp 6 MỚI trên order_kehoach (spec §11) ─────────────
    # Cả 4 đều nullable: lệnh Cấp 1-5 không đi qua bảng mâu thuẫn nào.
    op.add_column("order_kehoach", sa.Column("had_conflict", sa.Boolean(), nullable=True))
    op.add_column(
        "order_kehoach", sa.Column("conflict_level", sa.String(length=8), nullable=True)
    )
    op.add_column("order_kehoach", sa.Column("had_veto", sa.Boolean(), nullable=True))
    op.add_column("order_kehoach", sa.Column("veto_layers", sa.JSON(), nullable=True))

    # ── 3. cap6_progress: 3 nhiệm vụ «Đối chiếu» → 1 nhiệm vụ hành vi
    op.drop_column("cap6_progress", "task_1_done_at")
    op.drop_column("cap6_progress", "task_2_done_at")
    op.drop_column("cap6_progress", "task_3_done_at")
    op.drop_column("cap6_progress", "so_lenh_doi_chieu")
    op.drop_column("cap6_progress", "so_kieu_da_gap")
    op.drop_column("cap6_progress", "ty_le_thang_khop")
    op.drop_column("cap6_progress", "ty_le_thang_lech")

    # 0 ở hai ô này là số THẬT (đếm hàng trong bảng ta sở hữu) ⇒ NOT NULL.
    op.add_column(
        "cap6_progress",
        sa.Column(
            "so_lan_xu_ly_nhat_quan", sa.Integer(), server_default="0", nullable=False
        ),
    )
    op.add_column(
        "cap6_progress",
        sa.Column(
            "so_lan_xu_ly_veto_nhat_quan",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )
    # ★ NULLABLE, không server_default: NULL = "chưa có lệnh Cấp-6 nào đóng",
    # KHÔNG phải "hoà vốn 0%".
    op.add_column(
        "cap6_progress", sa.Column("tong_lai_lenh_cap6_pct", sa.Float(), nullable=True)
    )
    op.add_column(
        "cap6_progress",
        sa.Column(
            "da_xem_tour_mauthuan",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
    )

    # ── 4. «Không mua lần này» — quyết định đứng ngoài (spec §7) ────
    op.create_table(
        "cap6_skip",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("conflict_level", sa.String(length=8), nullable=False),
        # ★★ ``had_conflict`` KHÔNG có trong danh sách cột của spec §11 — nhưng
        # luật đếm ở chính §11 đòi nó ("+1 khi một lệnh CÓ MÂU THUẪN mà nhận
        # định khớp hành động"). Thiếu nó thì 3 cú bấm «Không mua» trên một mã
        # chỉ có tin xấu mà KHÔNG mâu thuẫn cũng mở được cổng tốt nghiệp.
        sa.Column("had_conflict", sa.Boolean(), nullable=True),
        # ★ Ba trạng thái: NULL = chưa chấm được mã lúc bấm (≠ "không phủ quyết").
        sa.Column("had_veto", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cap6_skip")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_cap6_skip_user_id_users"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(op.f("ix_cap6_skip_user_id"), "cap6_skip", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_cap6_skip_user_id"), table_name="cap6_skip")
    op.drop_table("cap6_skip")

    op.drop_column("cap6_progress", "da_xem_tour_mauthuan")
    op.drop_column("cap6_progress", "tong_lai_lenh_cap6_pct")
    op.drop_column("cap6_progress", "so_lan_xu_ly_veto_nhat_quan")
    op.drop_column("cap6_progress", "so_lan_xu_ly_nhat_quan")

    op.add_column(
        "cap6_progress", sa.Column("task_1_done_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "cap6_progress", sa.Column("task_2_done_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "cap6_progress", sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "cap6_progress",
        sa.Column("so_lenh_doi_chieu", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "cap6_progress",
        sa.Column("so_kieu_da_gap", sa.Integer(), server_default="0", nullable=False),
    )
    # ★ Hai ô này ở head cũ là FLOAT NULLABLE, KHÔNG server_default (revision
    # ``7b3c1e5a9d24`` đã gỡ ``NOT NULL DEFAULT 0`` chính vì "chưa có lệnh đã
    # đóng" ≠ "thắng 0%"). Dựng lại đúng hình dạng đó, không lùi về bản trước nó.
    op.add_column("cap6_progress", sa.Column("ty_le_thang_khop", sa.Float(), nullable=True))
    op.add_column("cap6_progress", sa.Column("ty_le_thang_lech", sa.Float(), nullable=True))

    op.drop_column("order_kehoach", "veto_layers")
    op.drop_column("order_kehoach", "had_veto")
    op.drop_column("order_kehoach", "conflict_level")
    op.drop_column("order_kehoach", "had_conflict")

    op.add_column(
        "order_kehoach", sa.Column("kieu_co_phieu", sa.String(length=32), nullable=True)
    )
    op.add_column("order_kehoach", sa.Column("lop_mau_thuan", sa.JSON(), nullable=True))
    op.add_column("order_kehoach", sa.Column("trong_so_goi_y", sa.JSON(), nullable=True))
    op.add_column(
        "order_kehoach", sa.Column("lop_quyet_dinh", sa.String(length=32), nullable=True)
    )
    op.add_column("order_kehoach", sa.Column("khop_goi_y", sa.Boolean(), nullable=True))
    op.add_column("order_kehoach", sa.Column("ly_do_doi_chieu", sa.Text(), nullable=True))
