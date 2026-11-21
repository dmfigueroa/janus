//! Embed static assets and derive their URL versions from their bytes at build time.

use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    env,
    fmt::Write as _,
    fs,
    path::{Path, PathBuf},
};

fn main() {
    let static_dir = Path::new("static");
    println!("cargo:rerun-if-changed={}", static_dir.display());

    let assets = embedded_assets(static_dir);
    let manifest = render_manifest(&assets);
    let output =
        PathBuf::from(env::var("OUT_DIR").expect("Cargo sets OUT_DIR")).join("static_assets.rs");
    fs::write(output, manifest).expect("static asset manifest must be writable");
}

struct Asset {
    path: String,
    version: String,
    content_type: &'static str,
    source: PathBuf,
}

impl Asset {
    fn url(&self) -> String {
        format!("/v2/static/{}?v={}", self.path, self.version)
    }
}

/// Static files with a known browser content type, keyed by their URL path.
fn embedded_assets(root: &Path) -> Vec<Asset> {
    let mut sources = BTreeMap::new();
    collect_sources(root, root, &mut sources);
    sources
        .into_iter()
        .filter_map(|(path, source)| {
            let content_type = content_type(&path)?;
            let bytes = fs::read(&source).expect("static asset must be readable");
            Some(Asset {
                version: sha256_hex(&bytes),
                path,
                content_type,
                source,
            })
        })
        .collect()
}

fn collect_sources(root: &Path, directory: &Path, sources: &mut BTreeMap<String, PathBuf>) {
    let entries = fs::read_dir(directory).expect("static asset directory must be readable");
    for entry in entries {
        let entry = entry.expect("static asset entry must be readable");
        let path = entry.path();
        if path.is_dir() {
            collect_sources(root, &path, sources);
        } else if path.is_file()
            && let Some(relative) = relative_path(root, &path)
        {
            let source = fs::canonicalize(&path).expect("static asset must resolve");
            sources.insert(relative, source);
        }
    }
}

fn relative_path(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    Some(
        relative
            .components()
            .map(|component| component.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/"),
    )
}

/// Browser content type for an embedded asset, or `None` when it must stay private.
fn content_type(path: &str) -> Option<&'static str> {
    match Path::new(path).extension()?.to_str()? {
        "css" => Some("text/css"),
        "js" => Some("text/javascript"),
        "json" => Some("application/json"),
        "svg" => Some("image/svg+xml"),
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "ico" => Some("image/x-icon"),
        "woff2" => Some("font/woff2"),
        _ => None,
    }
}

fn render_manifest(assets: &[Asset]) -> String {
    let mut code = String::new();
    code.push_str("pub static EMBEDDED_ASSETS: &[EmbeddedAsset] = &[\n");
    for asset in assets {
        let source = asset
            .source
            .to_str()
            .expect("static asset paths must be UTF-8");
        writeln!(
            code,
            "    EmbeddedAsset {{ path: {:?}, version: {:?}, url: {:?}, content_type: {:?}, bytes: include_bytes!({source:?}) }},",
            asset.path,
            asset.version,
            asset.url(),
            asset.content_type,
        )
        .expect("writing to a String cannot fail");
    }
    code.push_str("];\n\n");

    let mut names = HashMap::new();
    for asset in assets {
        let name = constant_name(&asset.path);
        if let Some(previous) = names.insert(name.clone(), asset.path.clone()) {
            panic!(
                "static assets {previous:?} and {:?} share the generated constant {name}",
                asset.path
            );
        }
        writeln!(
            code,
            "/// Versioned URL for `{}`.\npub const {name}: &str = {:?};",
            asset.path,
            asset.url()
        )
        .expect("writing to a String cannot fail");
    }
    code
}

/// `app.css` becomes `APP_CSS_URL`, so templates can reference embedded assets.
fn constant_name(path: &str) -> String {
    let mut name = String::with_capacity(path.len() + 4);
    for character in path.chars() {
        name.push(if character.is_ascii_alphanumeric() {
            character.to_ascii_uppercase()
        } else {
            '_'
        });
    }
    name.push_str("_URL");
    name
}

/// Lowercase hexadecimal SHA-256 digest of `bytes`.
fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut version = String::with_capacity(digest.len() * 2);
    for byte in digest {
        write!(version, "{byte:02x}").expect("writing to a String cannot fail");
    }
    version
}
