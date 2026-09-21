"""Cấp 2 «Kỷ luật» API — progress, enter, task, kế hoạch, kết sổ, điểm kỷ
luật, graduate.

Cấp 2 is **ĐÚNG MỘT nhiệm vụ**: ① «10 lệnh Thực chiến có đặt cắt lỗ / chốt
lời». Tốt nghiệp là 1/1 (mockup ``iqx-cap2-hanhtrinh.html``: ``CẤP 2 · 0/1``).

★ Nhiệm vụ ② «Thực hiện đúng khi giá chạm mốc» đã bỏ hẳn cùng cột
``task_2_done_at`` (migration ``9c3f7ad10b52``). Ba con số 🛑/🎯/✅
(``so_lan_cat_lo_dung``/``so_lan_chot_loi_dung``/``so_lan_thuc_hien_dung``) vẫn
nằm trên ``GET /cap2/progress`` nhưng chỉ để «Phân tích danh mục» khối ④ vẽ —
chúng không phải nhiệm vụ và không mở cổng tốt nghiệp nào.

Cap 2 is FREE: all endpoints use ``CurrentUser`` (authenticated), NOT ``PremiumUser``.

``GET /cap2/diem-ky-luat`` is no longer part of Cấp 2's own journey (the
mockups drop điểm kỷ luật from Hành trình and Phân tích danh mục) but is kept
mounted: Cấp 3 depends on the same computation server-side, and the Cấp 6/7
trading pages still read this endpoint.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DBSession
from app.schemas.cap1 import TradeHistoryOut
from app.schemas.cap2 import (
    Cap2AnalysisOut,
    Cap2ProgressOut,
    DiemKyLuatHistoryOut,
    DiemKyLuatOut,
    KehoachRequest,
    KetsoRequest,
    OrderKehoachOut,
    OrderKetsoOut,
    TaskRequest,
    TradeHistoryListOut,
)
from app.schemas.cap2_alert import (
    Cap2ActiveAlertsOut,
    Cap2AlertActionOut,
    Cap2AlertActionRequest,
    Cap2AlertOut,
    Cap2PreBuyAlertOut,
    Cap2PreBuyAlertRequest,
)
from app.services.cap2.alerts import Cap2AlertService, current_session_date
from app.services.cap2.service import Cap2Service

router = APIRouter(prefix="/cap2", tags=["Cấp 2"])


@router.get("/progress", response_model=Cap2ProgressOut | None)
async def get_progress(user: CurrentUser, db: DBSession) -> Cap2ProgressOut | None:
    """Trả về tiến trình Cấp 2 của người dùng hiện tại (hoặc null nếu chưa vào)."""
    svc = Cap2Service(db)
    return await svc.get_progress(user.id)


@router.post("/enter", response_model=Cap2ProgressOut)
async def enter(user: CurrentUser, db: DBSession) -> Cap2ProgressOut:
    """Vào Cấp 2 (idempotent) — yêu cầu đã tốt nghiệp Cấp 1."""
    svc = Cap2Service(db)
    return await svc.enter(user.id)


@router.patch("/task", response_model=Cap2ProgressOut)
async def mark_task(body: TaskRequest, user: CurrentUser, db: DBSession) -> Cap2ProgressOut:
    """Nhiệm vụ ① được suy ra từ kế hoạch/kết sổ — gọi endpoint này chỉ kích
    hoạt tính lại (idempotent, không tự đặt). ``task_no`` hợp lệ duy nhất là 1."""
    svc = Cap2Service(db)
    return await svc.mark_task(user.id, body.task_no)


@router.post("/kehoach", response_model=OrderKehoachOut)
async def record_kehoach(
    body: KehoachRequest, user: CurrentUser, db: DBSession
) -> OrderKehoachOut:
    """Ghi cắt lỗ/chốt lời (2 cách chọn 1) vào kế hoạch đã có của Cấp 1."""
    svc = Cap2Service(db)
    return await svc.record_kehoach(
        user.id,
        body.order_id,
        phuong_phap_sl_tp=body.phuong_phap_sl_tp,
        cat_lo=body.cat_lo,
        chot_loi=body.chot_loi,
    )


@router.post("/ketso", response_model=OrderKetsoOut)
async def record_ketso(body: KetsoRequest, user: CurrentUser, db: DBSession) -> OrderKetsoOut:
    """Ghi 4 hành vi vi phạm kỷ luật (+ 3 đo lường) cho 1 lệnh đã kết sổ Cấp 1,
    rồi tính lại nhiệm vụ ① và 3 con số 🛑/🎯/✅ của «Phân tích danh mục»."""
    svc = Cap2Service(db)
    return await svc.record_ketso(
        user.id,
        body.order_id,
        cham_sl_cuoi_phien=body.cham_SL_cuoi_phien,
        cham_sl_cat_dung_phien_ke=body.cham_SL_cat_dung_phien_ke,
        cham_sl_khong_cat=body.cham_SL_khong_cat,
        giu_cham_sl_bao_nhieu_phien=body.giu_cham_SL_bao_nhieu_phien,
        cham_tp_giu_lam_hut=body.cham_TP_giu_lam_hut,
        ban_som_khi_lo_nhe=body.ban_som_khi_lo_nhe,
        nhoi_lenh_khi_lo=body.nhoi_lenh_khi_lo,
        ghi_chu_nhin_lai=body.ghi_chu_nhin_lai,
    )


@router.get("/diem-ky-luat", response_model=DiemKyLuatOut)
async def get_diem_ky_luat(
    user: CurrentUser,
    db: DBSession,
    ngay: date | None = Query(default=None, description="Ngày cần chấm (mặc định hôm nay)"),
) -> DiemKyLuatOut:
    """Điểm kỷ luật 0-100 của 1 ngày + breakdown "số đến từ đâu" (spec §C12c)."""
    svc = Cap2Service(db)
    result = await svc.diem_ky_luat(user.id, ngay)
    return DiemKyLuatOut(**result)


@router.get("/diem-ky-luat/history", response_model=DiemKyLuatHistoryOut)
async def get_diem_ky_luat_history(
    user: CurrentUser,
    db: DBSession,
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
) -> DiemKyLuatHistoryOut:
    end = to_date or date.today()
    start = from_date or (end - timedelta(days=29))
    rows = await Cap2Service(db).diem_ky_luat_history(user.id, start, end)
    return DiemKyLuatHistoryOut(
        scores=[DiemKyLuatOut(**row) for row in rows], from_date=start, to_date=end
    )


@router.get("/trades", response_model=TradeHistoryListOut)
async def list_trades(user: CurrentUser, db: DBSession) -> TradeHistoryListOut:
    rows = await Cap2Service(db).list_trade_history(user.id)
    trades = [TradeHistoryOut.model_validate(row) for row in rows]
    return TradeHistoryListOut(trades=trades, total=len(trades))


@router.get("/analysis", response_model=Cap2AnalysisOut)
async def get_analysis(user: CurrentUser, db: DBSession) -> Cap2AnalysisOut:
    """Nguồn dữ liệu bền vững cho các khối Phân tích danh mục Cấp 2 (§12)."""
    return Cap2AnalysisOut.model_validate(await Cap2Service(db).analysis(user.id))


@router.post("/graduate", response_model=Cap2ProgressOut)
async def graduate(user: CurrentUser, db: DBSession) -> Cap2ProgressOut:
    """Tốt nghiệp Cấp 2 — chỉ khi xong 1/1 nhiệm vụ (①)."""
    svc = Cap2Service(db)
    return await svc.graduate(user.id)


@router.post("/alerts/pre-buy", response_model=Cap2PreBuyAlertOut)
async def evaluate_pre_buy_alert(
    body: Cap2PreBuyAlertRequest, user: CurrentUser, db: DBSession
) -> Cap2PreBuyAlertOut:
    """Check the current same-symbol position before a new BUY.

    The server resolves the quote; callers cannot supply a price. Reusing the
    same idempotency key returns the same trigger without consuming a second
    alert impression.
    """
    result = await Cap2AlertService(db).evaluate_pre_buy(
        user.id,
        symbol=body.symbol,
        idempotency_key=body.idempotency_key,
        quantity=body.quantity,
        order_type=body.order_type,
        limit_price_vnd=body.limit_price_vnd,
    )
    return Cap2PreBuyAlertOut(
        data_status=result["data_status"],
        triggered=result["triggered"],
        reason=result["reason"],
        alert=(
            Cap2AlertOut.model_validate(result["alert"])
            if result["alert"] is not None
            else None
        ),
    )


@router.get("/alerts/active", response_model=Cap2ActiveAlertsOut)
async def get_active_alerts(
    user: CurrentUser,
    db: DBSession,
    session_date: date | None = Query(
        default=None, description="Phiên hiển thị (mặc định hôm nay, giờ Việt Nam)"
    ),
) -> Cap2ActiveAlertsOut:
    """Present eligible alerts in priority order and persist impressions."""
    effective_date = session_date or current_session_date()
    alerts = await Cap2AlertService(db).active_alerts(
        user.id, session_date=effective_date
    )
    return Cap2ActiveAlertsOut(
        session_date=effective_date,
        alerts=[Cap2AlertOut.model_validate(row) for row in alerts],
    )


@router.post("/alerts/{alert_id}/action", response_model=Cap2AlertActionOut)
async def act_on_alert(
    alert_id: uuid.UUID,
    body: Cap2AlertActionRequest,
    user: CurrentUser,
    db: DBSession,
) -> Cap2AlertActionOut:
    """Record the immutable user action for a displayed or muted alert."""
    event, next_step = await Cap2AlertService(db).act(
        user.id,
        alert_id,
        action=body.action,
        confirmation_phrase=body.confirmation_phrase,
    )
    return Cap2AlertActionOut(
        alert=Cap2AlertOut.model_validate(event),
        next_step=next_step,
    )
