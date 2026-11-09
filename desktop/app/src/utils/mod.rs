//! UI helpers: number/price/date formatting for vi-VN.

/// Placeholder for a missing value. Missing data is never shown as zero.
pub const MISSING: &str = "—";

/// `1714.32` → `1.714,32` (thousands `.`, decimals `,`).
pub fn number(value: f64, decimals: usize) -> String {
    let text = format!("{:.*}", decimals, value.abs());
    let (int_part, frac_part) = text.split_once('.').unwrap_or((&text, ""));
    let mut out = String::with_capacity(text.len() + int_part.len() / 3 + 1);
    let is_zero = text.chars().all(|c| c == '0' || c == '.');
    if value < 0.0 && !is_zero {
        out.push('-');
    }
    for (i, c) in int_part.chars().enumerate() {
        if i > 0 && (int_part.len() - i) % 3 == 0 {
            out.push('.');
        }
        out.push(c);
    }
    if !frac_part.is_empty() {
        out.push(',');
        out.push_str(frac_part);
    }
    out
}

/// Number with an explicit sign: `+1,23`, `-1,23`, `0,00`.
pub fn signed(value: f64, decimals: usize) -> String {
    let body = number(value, decimals);
    if body.starts_with('-') || body.chars().all(|c| matches!(c, '0' | ',' | '.')) {
        body
    } else {
        format!("+{body}")
    }
}

pub fn opt_number(value: Option<f64>, decimals: usize) -> String {
    value.map_or_else(|| MISSING.into(), |v| number(v, decimals))
}

pub fn opt_signed(value: Option<f64>, decimals: usize) -> String {
    value.map_or_else(|| MISSING.into(), |v| signed(v, decimals))
}

pub fn opt_percent(value: Option<f64>) -> String {
    value.map_or_else(|| MISSING.into(), |v| format!("{}%", signed(v, 2)))
}

/// VND → "tỷ" with one decimal: `7041466895450` → `7.041,5`.
pub fn billions(vnd: Option<f64>) -> String {
    vnd.map_or_else(|| MISSING.into(), |v| number(v / 1e9, 1))
}

pub fn signed_billions(vnd: Option<f64>) -> String {
    vnd.map_or_else(|| MISSING.into(), |v| signed(v / 1e9, 1))
}

/// Stock price in VND → thousand-VND board format: `234400` → `234,40`.
pub fn board_price(vnd: Option<f64>) -> String {
    vnd.map_or_else(|| MISSING.into(), |v| number(v / 1000.0, 2))
}

/// `2026-11-09T07:45:59.999Z` → `14:45:59` in Vietnam time (UTC+7).
pub fn vn_time(iso: &str) -> Option<String> {
    let time = iso.split_once('T')?.1;
    let mut parts = time.get(..8)?.split(':');
    let hour: u32 = parts.next()?.parse().ok()?;
    let minute: u32 = parts.next()?.parse().ok()?;
    let second: u32 = parts.next()?.parse().ok()?;
    Some(format!("{:02}:{minute:02}:{second:02}", (hour + 7) % 24))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_vietnamese_numbers() {
        assert_eq!(number(1714.32, 2), "1.714,32");
        assert_eq!(number(-11.039999, 2), "-11,04");
        assert_eq!(number(-0.001, 2), "0,00");
        assert_eq!(number(999.0, 0), "999");
        assert_eq!(number(1_000_000.0, 0), "1.000.000");
        assert_eq!(signed(0.64, 2), "+0,64");
        assert_eq!(signed(-0.64, 2), "-0,64");
        assert_eq!(signed(0.0, 2), "0,00");
        assert_eq!(billions(Some(7_041_466_895_450.0)), "7.041,5");
        assert_eq!(board_price(Some(234_400.0)), "234,40");
        assert_eq!(opt_percent(None), MISSING);
    }

    #[test]
    fn converts_to_vietnam_time() {
        assert_eq!(vn_time("2026-11-09T07:45:59.999Z").as_deref(), Some("14:45:59"));
        assert_eq!(vn_time("2026-11-09T20:00:00Z").as_deref(), Some("03:00:00"));
        assert_eq!(vn_time("bad"), None);
    }
}
