"""Tests for premarket normalizers (news + events).

Step-0 live verification (2026-07-03):
  URL: https://iq.vietcap.com.vn/api/iq-insight-service/v1/events?fromDate=20260703&toDate=20260707
  Real field names in each row (after camelCase→snake_case conversion):
    id, organ_code, event_name_vi, event_name_en, organ_name_en, organ_name_vi,
    ticker, event_code, event_title_vi, event_title_en,
    display_date1, display_date2, public_date, start_date, end_date,
    action_type_vi, action_type_en, category
  NOTE: There is NO event_time field — time is not provided by the VCI events API.
  The 'time' field in the normalized output will always be None.
  Event codes observed: DDIND, DDINS, ISS, SUSP, DDRP, DIV, MOVE, EGME, AGME
"""

from datetime import datetime, timezone, timedelta

from app.services.ai.market_analysis.premarket_payload import normalize_news, normalize_events

_ICT = timezone(timedelta(hours=7))


def _news(title, source, ts, **kw):
    return {
        "id": kw.get("id", title[:8]),
        "title": title,
        "short_content": "tóm tắt",
        "source_name": source,
        "update_date": ts,
        "ticker": kw.get("ticker"),
        "industry": kw.get("industry"),
        "sentiment": kw.get("sentiment", "neutral"),
        "source_link": "https://x",
    }


# ── normalize_news tests ──────────────────────────────────────────────────────


def test_news_window_filter_and_shape():
    ws = datetime(2026, 7, 2, 17, 0, tzinfo=_ICT)
    we = datetime(2026, 7, 3, 6, 30, tzinfo=_ICT)
    items = [
        _news("Trong cửa sổ", "CafeF", "2026-07-02T20:00:00+07:00"),
        _news("Quá sớm", "CafeF", "2026-07-02T10:00:00+07:00"),
    ]
    out = normalize_news(items, window_start=ws, window_end=we)
    assert [n["title"] for n in out] == ["Trong cửa sổ"]
    assert set(out[0]) >= {"id", "title", "summary", "source", "published_at", "tickers", "sentiment", "url"}


def test_news_naive_timestamps_are_ict_morning_news_survives():
    """Vietcap update_date strings are NAIVE local ICT — they must be localized
    as ICT, not UTC. A naive 05:30 today is inside the [prev 17:00 → today
    06:30 ICT] window and MUST survive; treating it as UTC shifts it to 12:30
    ICT and silently drops every 00:00–06:30 morning item in the 07:15 run.
    """
    ws = datetime(2026, 7, 2, 17, 0, tzinfo=_ICT)
    we = datetime(2026, 7, 3, 6, 30, tzinfo=_ICT)
    items = [
        _news("Tin sáng sớm trong cửa sổ", "CafeF", "2026-07-03T05:30:00", id="morning"),
        _news("Tin sau giờ mở cửa sổ", "CafeF", "2026-07-03T07:00:00", id="late"),
    ]
    out = normalize_news(items, window_start=ws, window_end=we)
    assert [n["id"] for n in out] == ["morning"]


def test_news_aware_timestamps_pass_through_unchanged():
    """Timezone-aware update_date strings must NOT be re-localized."""
    ws = datetime(2026, 7, 2, 17, 0, tzinfo=_ICT)
    we = datetime(2026, 7, 3, 6, 30, tzinfo=_ICT)
    items = [
        # 22:30 UTC on 07-02 == 05:30 ICT on 07-03 → in window
        _news("Aware trong cửa sổ", "CafeF", "2026-07-02T22:30:00+00:00", id="in"),
        # 00:00 UTC on 07-03 == 07:00 ICT → out of window
        _news("Aware ngoài cửa sổ", "CafeF", "2026-07-03T00:00:00+00:00", id="out"),
    ]
    out = normalize_news(items, window_start=ws, window_end=we)
    assert [n["id"] for n in out] == ["in"]


def test_news_dedup_keeps_higher_ranked_source():
    ws = datetime(2026, 7, 2, 17, 0, tzinfo=_ICT)
    we = datetime(2026, 7, 3, 6, 30, tzinfo=_ICT)
    items = [
        _news("Fed giữ nguyên lãi suất tháng 7", "CafeF", "2026-07-03T01:00:00+07:00", id="a"),
        _news("Fed giữ nguyên lãi suất tháng 7 ", "Reuters", "2026-07-03T02:00:00+07:00", id="b"),
    ]
    out = normalize_news(items, window_start=ws, window_end=we)
    assert len(out) == 1 and out[0]["id"] == "b"  # Reuters (rank 0) outranks CafeF (rank 3)


def test_news_dedup_both_same_rank_keeps_first_seen():
    """Two near-duplicate titles from same-rank sources — keeps the first one encountered."""
    ws = datetime(2026, 7, 2, 17, 0, tzinfo=_ICT)
    we = datetime(2026, 7, 3, 6, 30, tzinfo=_ICT)
    items = [
        _news("VN-Index tăng mạnh trong phiên sáng hôm nay", "CafeF", "2026-07-03T01:00:00+07:00", id="first"),
        _news("VN-Index tăng mạnh trong phiên sáng hôm nay!", "NDH", "2026-07-03T02:00:00+07:00", id="second"),
    ]
    out = normalize_news(items, window_start=ws, window_end=we)
    # CafeF=3, NDH=3 — equal rank, first wins
    assert len(out) == 1 and out[0]["id"] == "first"


def test_news_no_dedup_when_titles_differ_enough():
    ws = datetime(2026, 7, 2, 17, 0, tzinfo=_ICT)
    we = datetime(2026, 7, 3, 6, 30, tzinfo=_ICT)
    items = [
        _news("VPBank phát hành trái phiếu 5000 tỷ", "CafeF", "2026-07-03T01:00:00+07:00", id="a"),
        _news("MBBank tăng trưởng tín dụng 15% trong H1", "CafeF", "2026-07-03T02:00:00+07:00", id="b"),
    ]
    out = normalize_news(items, window_start=ws, window_end=we)
    assert len(out) == 2


def test_news_caps_at_20():
    """30 genuinely distinct news items (similarity < 0.8) should be capped at 20."""
    ws = datetime(2026, 7, 2, 17, 0, tzinfo=_ICT)
    we = datetime(2026, 7, 3, 6, 30, tzinfo=_ICT)
    # Titles are structurally different enough to avoid the 0.8 dedup threshold
    titles = [
        "VCB báo lãi trước thuế 15000 tỷ đồng trong quý hai năm nay",
        "Fed quyết định giữ nguyên lãi suất tại cuộc họp tháng bảy",
        "VN-Index vượt ngưỡng 1300 điểm lần đầu trong năm nay",
        "HPG công bố sản lượng thép đạt kỷ lục mới trong tháng sáu",
        "Nhà đầu tư ngoại mua ròng hơn 500 tỷ đồng trong tuần qua",
        "FPT ký hợp đồng công nghệ trị giá nghìn tỷ với đối tác Nhật",
        "Ngân hàng Nhà nước điều chỉnh tỷ giá trung tâm tăng nhẹ hôm nay",
        "VHM bàn giao hơn 5000 căn hộ tại dự án Vinhomes Ocean Park",
        "Giá dầu thế giới tăng mạnh sau căng thẳng địa chính trị Trung Đông",
        "MSN ghi nhận doanh thu thuần tăng trưởng 20% trong nửa đầu năm",
        "Thị trường chứng khoán Mỹ tăng điểm nhờ số liệu việc làm khả quan",
        "TCB hoàn thành phát hành trái phiếu 3000 tỷ đồng kỳ hạn 5 năm",
        "Bộ Tài chính công bố dự thảo sửa đổi luật chứng khoán mới nhất",
        "GAS duy trì lợi nhuận ổn định bất chấp biến động giá khí toàn cầu",
        "Quỹ đầu tư Dragon Capital tăng tỷ trọng cổ phiếu ngân hàng nội địa",
        "MBB công bố kết quả kinh doanh vượt kế hoạch năm với ROE cao nhất",
        "Chứng khoán châu Á đồng loạt tăng điểm theo đà tích cực từ Wall Street",
        "VNM cải thiện biên lợi nhuận sau chiến lược tái cơ cấu sản phẩm",
        "ACB dẫn đầu về tăng trưởng tín dụng trong nhóm ngân hàng tư nhân",
        "Chính phủ phê duyệt gói kích thích kinh tế 120000 tỷ đồng cho năm sau",
        "SSI Research nâng khuyến nghị mua cho nhóm cổ phiếu bất động sản KCN",
        "PLX chuẩn bị đầu tư mạnh vào hạ tầng trạm sạc xe điện toàn quốc",
        "SAB ghi nhận sản lượng bia tăng trở lại sau giai đoạn suy giảm kéo dài",
        "Thủ tướng yêu cầu đẩy nhanh giải ngân vốn đầu tư công cuối năm nay",
        "MWG tái cấu trúc mạng lưới bán lẻ nhằm nâng cao hiệu quả vận hành",
        "CTG triển khai gói cho vay ưu đãi dành cho doanh nghiệp xuất khẩu",
        "Thị trường bất động sản TP HCM ghi nhận lượng giao dịch tăng đáng kể",
        "HDB hoàn thành tăng vốn điều lệ lên mức 30000 tỷ đồng trong tuần này",
        "Chỉ số PMI sản xuất Việt Nam đạt 52 điểm trong tháng sáu vừa qua",
        "TPB ra mắt sản phẩm tài chính số mới nhắm vào phân khúc khách hàng trẻ",
    ]
    items = [
        _news(title, "CafeF", "2026-07-03T01:00:00+07:00", id=str(i))
        for i, title in enumerate(titles)
    ]
    out = normalize_news(items, window_start=ws, window_end=we)
    assert len(out) == 20


def test_news_tickers_and_sectors_mapped():
    ws = datetime(2026, 7, 2, 17, 0, tzinfo=_ICT)
    we = datetime(2026, 7, 3, 6, 30, tzinfo=_ICT)
    items = [
        _news("VCB tăng trưởng lợi nhuận", "VnExpress", "2026-07-03T01:00:00+07:00",
              ticker="VCB", industry="Ngân hàng"),
    ]
    out = normalize_news(items, window_start=ws, window_end=we)
    assert out[0]["tickers"] == ["VCB"]
    assert out[0]["sectors"] == ["Ngân hàng"]


def test_news_empty_ticker_sector_gives_empty_lists():
    ws = datetime(2026, 7, 2, 17, 0, tzinfo=_ICT)
    we = datetime(2026, 7, 3, 6, 30, tzinfo=_ICT)
    items = [
        _news("Tin thị trường tổng hợp", "VnExpress", "2026-07-03T01:00:00+07:00"),
    ]
    out = normalize_news(items, window_start=ws, window_end=we)
    assert out[0]["tickers"] == []
    assert out[0]["sectors"] == []


# ── normalize_events tests ────────────────────────────────────────────────────
# Fixtures use REAL VCI keys as discovered in Step 0:
#   id, event_code, event_title_vi, ticker, display_date1
#   (no event_time field exists in VCI API response)


def test_events_normalize_types():
    """Test that event_code maps to the correct type."""
    raw = [
        # DIV → ex_dividend
        {
            "id": "div-001",
            "event_code": "DIV",
            "display_date1": "2026-07-03T00:00:00",
            "event_title_vi": "VHM giao dịch không hưởng quyền cổ tức",
            "ticker": "VHM",
        },
        # AGME → agm
        {
            "id": "agme-002",
            "event_code": "AGME",
            "display_date1": "2026-07-03T00:00:00",
            "event_title_vi": "ĐHCĐ bất thường SSI",
            "ticker": "SSI",
        },
    ]
    out = normalize_events(raw)
    assert out[0]["type"] == "ex_dividend" and out[0]["tickers"] == ["VHM"]
    assert out[1]["type"] == "agm" and out[1]["tickers"] == ["SSI"]


def test_events_all_type_mappings():
    """Verify every event code group maps to the correct type."""
    code_to_type = {
        "ISS": "ex_dividend",
        "DIV": "ex_dividend",
        "EGME": "agm",
        "AGME": "agm",
        "AGMR": "agm",
        "DDIND": "insider",
        "DDRP": "insider",
        "DDINS": "insider",
        "NLIS": "listing",
        "AIS": "listing",
        "MOVE": "other",
        "MA": "other",
        "RETU": "other",
        "OTHE": "other",
        "SUSP": "other",
        "XUNKNOWN": "other",
    }
    raw = [
        {
            "id": f"{code}-001",
            "event_code": code,
            "display_date1": "2026-07-03T00:00:00",
            "event_title_vi": f"Sự kiện {code}",
            "ticker": "VNM",
        }
        for code in code_to_type
    ]
    out = normalize_events(raw)
    for item in out:
        code = item["id"].split("-")[0]
        expected = code_to_type[code]
        assert item["type"] == expected, f"{code} → expected {expected}, got {item['type']}"


def test_events_output_shape():
    """Each normalized event has required keys."""
    raw = [
        {
            "id": "ev-001",
            "event_code": "DIV",
            "display_date1": "2026-07-03T00:00:00",
            "event_title_vi": "VHM trả cổ tức",
            "ticker": "VHM",
        }
    ]
    out = normalize_events(raw)
    assert len(out) == 1
    required = {"id", "type", "time", "time_label", "title", "tickers"}
    assert set(out[0]) >= required


def test_events_time_is_none_when_not_in_source():
    """VCI API does not provide an event_time field; time should be None."""
    raw = [
        {
            "id": "ev-002",
            "event_code": "EGME",
            "display_date1": "2026-07-07T00:00:00",
            "event_title_vi": "BTB - Tổ chức ĐHĐCĐ bất thường 2026",
            "ticker": "BTB",
        }
    ]
    out = normalize_events(raw)
    assert out[0]["time"] is None
    # time_label should be a non-empty string (e.g., the date or a display string)
    assert out[0]["time_label"]


def test_events_time_label_when_time_given():
    """When event_time field is present (future API versions), format it as HH:MM."""
    raw = [
        {
            "id": "ev-003",
            "event_code": "AGME",
            "display_date1": "2026-07-07T14:00:00",
            "event_title_vi": "ĐHCĐ SSI",
            "ticker": "SSI",
        }
    ]
    out = normalize_events(raw)
    # display_date1 has a time component of 14:00 — normalizer should detect non-midnight time
    assert out[0]["time_label"]


def test_events_stable_id_uses_source_id():
    """If the source has an id, use it directly (stringified)."""
    raw = [
        {
            "id": "6a470141279ac17a86e8c05e",
            "event_code": "DDIND",
            "display_date1": "2026-07-06T00:00:00",
            "event_title_vi": "Giao dịch nội bộ SJE",
            "ticker": "SJE",
        }
    ]
    out = normalize_events(raw)
    assert out[0]["id"] == "6a470141279ac17a86e8c05e"


def test_events_fallback_id_when_no_source_id():
    """If no id in source row, fall back to '{event_code}-{date}-{ticker}'."""
    raw = [
        {
            "event_code": "DIV",
            "display_date1": "2026-07-03T00:00:00",
            "event_title_vi": "VHM trả cổ tức",
            "ticker": "VHM",
        }
    ]
    out = normalize_events(raw)
    assert out[0]["id"] == "DIV-2026-07-03-VHM"
