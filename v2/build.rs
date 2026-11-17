//! Derive the stylesheet URL version from the stylesheet bytes at build time.

use sha2::{Digest, Sha256};
use std::{fmt::Write as _, fs, path::Path};

fn main() {
    let stylesheet = Path::new("static/app.css");
    println!("cargo:rerun-if-changed={}", stylesheet.display());
    let bytes = fs::read(stylesheet).expect("v2 stylesheet must be readable");
    let digest = Sha256::digest(&bytes);
    let mut version = String::with_capacity(digest.len() * 2);
    for byte in digest {
        write!(version, "{byte:02x}").expect("writing to a String cannot fail");
    }
    println!("cargo:rustc-env=JANUS_APP_CSS_VERSION={version}");
}
