# Flashback voice lines

Generated offline with VieNeu-TTS v3 Turbo (Apache-2.0, https://github.com/pnnbao97/VieNeu-TTS,
codec MOSS-Audio-Tokenizer-Nano, Apache-2.0), preset voice "Adam bựa", temperature 1.0.
Post-processing: ffmpeg trim silence, atempo=1.08, loudnorm I=-16, mono 44.1 kHz 64 kbps MP3.

| file | text |
|---|---|
| left-5m | Còn năm phút nữa nhé! |
| left-4m | Còn bốn phút! |
| left-3m | Còn ba phút, tăng tốc nào! |
| left-2m | Chỉ còn hai phút thôi! |
| left-1m | Một phút cuối! Nhanh tay lên nào! |
| left-30s | Ba mươi giây cuối cùng! |
| count-5..count-1 | Năm! Bốn! Ba! Hai! Một! |
| time-up | Hết giờ rồi! |
| start | Bắt đầu nào! |
| win | [cười] Chúc mừng! Bạn thắng rồi! |
| finish | Ván đấu kết thúc rồi! Cùng xem kết quả nào! |
| buy / sell | Mua vào! / Bán ra! |
| take-profit | [cười] Chốt lời! Tuyệt vời! |
| cut-loss | [thở dài] Cắt lỗ rồi, bình tĩnh nhé! |

Regenerate: `uv sync` in a VieNeu-TTS checkout, then `Vieneu().infer(text, voice="Adam bựa", temperature=1.0)`.
