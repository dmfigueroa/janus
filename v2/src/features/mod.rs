pub mod smoke;

pub mod search;
pub mod watchlists;

/// `aria-current` values for the shared bottom navigation.
#[derive(Clone, Copy)]
pub struct PrimaryNav {
    pub lists: &'static str,
    pub search: &'static str,
}

impl PrimaryNav {
    pub fn lists() -> Self {
        Self {
            lists: "page",
            search: "false",
        }
    }

    pub fn search() -> Self {
        Self {
            lists: "false",
            search: "page",
        }
    }
}
