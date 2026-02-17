//! Self-hosting HTTP server for Ether.
//!
//! Serves both the SPA (`dist/`) and the `@ether/` filesystem on a single port.
//!
//! Routing:
//! 1. `/**/...` → strip `/**/` prefix, resolve against `ether_root`
//!    - File → raw content with MIME type
//!    - Directory → JSON listing
//!    - Not found → 404
//! 2. `/assets/...`, known static extensions → serve from `dist_root`
//! 3. Everything else → `dist_root/index.html` (SPA fallback)

use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

/// Start the self-hosting HTTP server.
pub fn serve(ether_root: PathBuf, dist_root: PathBuf, port: u16) {
    let addr = format!("0.0.0.0:{}", port);
    let server = tiny_http::Server::http(&addr).unwrap_or_else(|e| {
        eprintln!("Failed to bind to {}: {}", addr, e);
        std::process::exit(1);
    });
    eprintln!("Ether server listening on http://0.0.0.0:{}", port);
    eprintln!("  Ether root: {}", ether_root.display());
    eprintln!("  Dist root:  {}", dist_root.display());

    for request in server.incoming_requests() {
        let url = request.url().to_string();
        let response = handle_request(&url, &ether_root, &dist_root);
        let _ = request.respond(response);
    }
}

fn handle_request(
    url: &str,
    ether_root: &Path,
    dist_root: &Path,
) -> tiny_http::Response<Cursor<Vec<u8>>> {
    // Strip query string
    let path = url.split('?').next().unwrap_or(url);

    // 1. /**/ filesystem routes
    if let Some(rest) = path.strip_prefix("/**/") {
        return handle_ether_path(rest, ether_root);
    }

    // 2. Static assets from dist/
    let dist_path = dist_root.join(path.trim_start_matches('/'));
    if dist_path.is_file() {
        return serve_file(&dist_path);
    }

    // 3. SPA fallback
    let index = dist_root.join("index.html");
    if index.is_file() {
        return serve_file(&index);
    }

    response_text(404, "Not Found")
}

fn handle_ether_path(
    relative: &str,
    ether_root: &Path,
) -> tiny_http::Response<Cursor<Vec<u8>>> {
    // Path traversal protection
    for segment in relative.split('/') {
        if segment == ".." {
            return response_text(403, "Path traversal not allowed");
        }
    }

    let target = ether_root.join(relative);

    // Canonicalize to prevent symlink escapes
    if let Ok(canon_root) = ether_root.canonicalize() {
        if let Ok(canon_target) = target.canonicalize() {
            if !canon_target.starts_with(&canon_root) {
                return response_text(403, "Path escapes root");
            }
        }
    }

    if target.is_file() {
        serve_file(&target)
    } else if target.is_dir() {
        serve_dir_json(&target)
    } else {
        response_text(404, "Not Found")
    }
}

fn make_response(
    status: u16,
    content_type: &str,
    data: Vec<u8>,
) -> tiny_http::Response<Cursor<Vec<u8>>> {
    let len = data.len();
    tiny_http::Response::new(
        tiny_http::StatusCode(status),
        vec![
            tiny_http::Header::from_bytes("Content-Type", content_type).unwrap(),
            tiny_http::Header::from_bytes("Content-Length", len.to_string()).unwrap(),
            tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap(),
        ],
        Cursor::new(data),
        Some(len),
        None,
    )
}

fn serve_file(path: &Path) -> tiny_http::Response<Cursor<Vec<u8>>> {
    match fs::read(path) {
        Ok(data) => make_response(200, mime_for_path(path), data),
        Err(_) => response_text(500, "Failed to read file"),
    }
}

fn serve_dir_json(path: &Path) -> tiny_http::Response<Cursor<Vec<u8>>> {
    let read_dir = match fs::read_dir(path) {
        Ok(rd) => rd,
        Err(_) => return response_text(500, "Failed to read directory"),
    };

    let mut entries: Vec<serde_json::Value> = Vec::new();
    for entry in read_dir.flatten() {
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let mut obj = serde_json::Map::new();
        obj.insert(
            "name".into(),
            serde_json::Value::String(entry.file_name().to_string_lossy().into_owned()),
        );
        obj.insert("isDirectory".into(), serde_json::Value::Bool(meta.is_dir()));
        if meta.is_file() {
            obj.insert(
                "size".into(),
                serde_json::Value::Number(meta.len().into()),
            );
        }
        entries.push(serde_json::Value::Object(obj));
    }

    // Sort by name
    entries.sort_by(|a, b| {
        let na = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let nb = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        na.cmp(nb)
    });

    let json = serde_json::to_string(&entries).unwrap_or_else(|_| "[]".into());
    make_response(200, "application/json", json.into_bytes())
}

fn response_text(status: u16, body: &str) -> tiny_http::Response<Cursor<Vec<u8>>> {
    make_response(status, "text/plain", body.as_bytes().to_vec())
}

fn mime_for_path(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js" | "mjs") => "application/javascript; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        Some("wasm") => "application/wasm",
        Some("txt" | "md" | "ray" | "ts" | "rs" | "py" | "sh" | "toml" | "yaml" | "yml" | "log") => {
            "text/plain; charset=utf-8"
        }
        _ => "application/octet-stream",
    }
}
