use chrono::NaiveDate;

/// Accepts v1's stored shapes: a four-digit year, or a real calendar `YYYY-MM-DD`.
pub fn validate(value: &str) -> Result<(), &'static str> {
    if value.len() == 4 {
        return if value.bytes().all(|byte| byte.is_ascii_digit()) {
            Ok(())
        } else {
            Err("Release date must be YYYY or YYYY-MM-DD.")
        };
    }
    if !is_year_month_day_shape(value) {
        return if value.len() == 10 {
            Err("Release date must be YYYY-MM-DD.")
        } else {
            Err("Release date must be YYYY or YYYY-MM-DD.")
        };
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| "Release date must be a valid calendar date.")
}

fn is_year_month_day_shape(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && value[..4].bytes().all(|byte| byte.is_ascii_digit())
        && value[5..7].bytes().all(|byte| byte.is_ascii_digit())
        && value[8..10].bytes().all(|byte| byte.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_year_and_calendar_dates() {
        assert!(validate("2025").is_ok());
        assert!(validate("2025-02-03").is_ok());
        assert!(validate("20x5").is_err());
        assert!(validate("2025-02-29").is_err());
    }
}
