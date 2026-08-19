"""cap4 — 1 nhiệm vụ: «Đọc và chấm đủ 5 lớp qua 20 lệnh»

Revision ID: a3f7c1d9e2b8
Revises: 9c2e4b71fa30
Create Date: 2026-08-19 09:00:00.000000

Cấp 4 goes from **3 nhiệm vụ + khối "Thách thức Thuần thục" to MỘT nhiệm vụ**
(mockup ``iqx-cap4-hanhtrinh.html``: ``ck-head`` "Trước khi lên Cấp 5 · 0/1``,
đúng một ``.task.active``):

  ① «Đọc và chấm đủ 5 lớp qua 20 lệnh» → ``so_lenh_doc_du_5lop >= 20``

Cái ra đi:

  · ① cũ «Lệnh đầu tiên đọc + chấm đủ 5 lớp» (chỉ đòi 1 lệnh);
  · ② cũ «Kết sổ lệnh đầu Cấp 4»;
  · ③ cũ «Thách thức Thuần thục» — 3 điều kiện cùng lúc: 20 lệnh + có CẢ vũ khí
    VÀ điểm mù + lệnh đồng thuận cao thắng ≥ 60%.

★ **ÁNH XẠ: nhiệm vụ mới nhận mốc của ③ CŨ, không phải của ① cũ.** Đây là điểm
dễ sai nhất của migration này. ③ cũ bao hàm điều kiện "≥ 20 lệnh đọc đủ 5 lớp",
nên một hàng có ``task_3_done_at`` chắc chắn ĐÃ vượt cổng mới tại đúng thời
điểm đó — giữ lại là trung thực. ① cũ thì ngược lại: nó đóng dấu ở lệnh THỨ
NHẤT, nên để nguyên trong ô ``task_1_done_at`` sẽ tặng không một dấu tick
"20 lệnh" cho người mới đọc 1 lệnh, và ``Cap4Service.graduate`` mới chỉ nhìn
đúng ô đó ⇒ tốt nghiệp gian lận. Vì thế ``task_1_done_at := task_3_done_at``
(ghi đè, kể cả khi nguồn là NULL).

★ **KHÔNG back-fill người đã có ≥ 20 lệnh mà chưa xong ③ cũ.** Họ trượt ③ vì
vũ khí/điểm mù/tỷ lệ — ba thứ vừa bị bỏ khỏi cổng — nên dưới luật mới họ ĐÃ
đạt, nhưng migration không có mốc thời gian thật để ghi và sẽ phải bịa một cái
(``now()`` là thời điểm deploy, không phải thời điểm họ đọc xong lệnh thứ 20).
``Cap4Service._recompute_progress`` tính lại ``so_lenh_doc_du_5lop`` từ
``order_kehoach`` ở MỌI lần đọc hàng progress, nên ``GET /cap4/progress`` đầu
tiên sau khi deploy tự đóng dấu cho họ. Để service làm, đừng đoán bằng SQL.

★ **``ty_le_thang_dong_thuan_cao`` bị XOÁ, không phải chuyển sang nullable.**
Nó là ``FLOAT NOT NULL DEFAULT 0`` và trả lời "0%" cho câu hỏi "chưa có lệnh
đồng thuận cao nào" — đúng lỗi luật 1 (số bịa). Nó chỉ nuôi điều kiện 3 của
Thách thức, mà Thách thức đã đi. Cột ``order_kehoach.so_lop_dong_thuan`` (thứ
sinh ra nó) KHÔNG bị đụng: Kết sổ + Phân tích danh mục vẫn đọc.

★ ``vu_khi_lop``/``diem_mu_lop`` GIỮ NGUYÊN (spec §7 khối ⑨ + Khối 1 màn tốt
nghiệp vẫn nêu tên hai lớp này) — chúng vốn đã nullable, tức "chưa đủ dữ liệu"
vẫn im lặng đúng cách. Chúng chỉ thôi làm cổng tốt nghiệp.

★ Migration này CỐ TÌNH không đụng ``graduated_at``. Đạt 1/1 không phải là tốt
nghiệp — tốt nghiệp là hành động của user (``POST /cap4/graduate``) với khoảnh
khắc "tốt nghiệp" riêng và ``time_to_graduate_hours`` riêng.

★ PROD kỳ vọng **0 dòng** ``cap4_progress``: trần cấp (``CAP_MAX_ENABLED``)
đang là 3, nên chưa ai vào được Cấp 4. Kỳ vọng ≠ chứng minh, nên
``tests/test_cap4.py`` vẫn seed hàng kiểu-prod theo DDL của revision
``b76c7019f77b`` và kiểm cả hai chiều ánh xạ.

DOWNGRADE LÀ LOSSY — nói thẳng. ``task_2_done_at`` và mốc của ① CŨ (lệnh đầu
tiên đọc đủ 5 lớp) bị xoá ở đây và KHÔNG dựng lại được: downgrade trả chúng về
NULL. ``ty_le_thang_dong_thuan_cao`` quay lại ở 0 (giá trị cũ mất; service tiền
nhiệm tính lại nó từ ``order_kehoach``/``order_ketso`` ở lần đọc kế tiếp, nên
một deployment bị hạ cấp sẽ tự lành con số — nhưng đúng con số cũ thì mất).
``task_3_done_at`` thì dựng lại được nguyên vẹn từ ``task_1_done_at`` (ánh xạ
ngược của upgrade), nên upgrade → downgrade → upgrade là bất động: ô nhiệm vụ
duy nhất trở về đúng giá trị cũ ở mọi vòng.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3f7c1d9e2b8"
down_revision: Union[str, None] = "9c2e4b71fa30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nhiệm vụ duy nhất nhận mốc của ③ cũ — mốc DUY NHẤT bảo chứng ≥20 lệnh.
    # Ghi đè kể cả khi nguồn NULL: mốc ① cũ (1 lệnh) không được phép sống sót
    # trong một ô mà `graduate()` mới đọc là "đã đủ 20 lệnh".
    op.execute("UPDATE cap4_progress SET task_1_done_at = task_3_done_at")

    op.drop_column("cap4_progress", "task_2_done_at")
    op.drop_column("cap4_progress", "task_3_done_at")
    # Số bịa: NOT NULL DEFAULT 0 ⇒ "chưa có lệnh đồng thuận cao" in ra "0%".
    op.drop_column("cap4_progress", "ty_le_thang_dong_thuan_cao")


def downgrade() -> None:
    op.add_column(
        "cap4_progress", sa.Column("task_2_done_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "cap4_progress", sa.Column("task_3_done_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "cap4_progress",
        sa.Column(
            "ty_le_thang_dong_thuan_cao", sa.Float(), server_default="0", nullable=False
        ),
    )

    # Ánh xạ ngược của upgrade: ③ cũ = ô nhiệm vụ duy nhất. Sau đó ô ① phải trả
    # về NULL — dưới luật CŨ nó có nghĩa "lệnh ĐẦU TIÊN đọc đủ 5 lớp", và mốc
    # 20-lệnh không phải mốc đó. Service tiền nhiệm tự đóng dấu lại ở lần đọc
    # kế tiếp (nó tính lại từ order_kehoach), nên để trống là trung thực hơn.
    op.execute("UPDATE cap4_progress SET task_3_done_at = task_1_done_at")
    op.execute("UPDATE cap4_progress SET task_1_done_at = NULL")
