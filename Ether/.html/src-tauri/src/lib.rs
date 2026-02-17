use serde::Serialize;
use std::path::{Path, PathBuf};

/// Resolve the Ether/ root directory.
/// - Desktop: ETHER_ROOT env var, or the parent of the `.html/` directory
/// - Android: Tauri resource dir + "Ether"
fn ether_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 1. Explicit env var
    if let Ok(root) = std::env::var("ETHER_ROOT") {
        let p = PathBuf::from(root);
        if p.is_dir() {
            return Ok(p);
        }
    }

    // 2. Relative to the executable: exe is in src-tauri/target/*/ether,
    //    Ether/ root is ../../.. (i.e. the Ether/ directory itself).
    //    In dev, exe dir is src-tauri/target/debug/, Ether is ../../../
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // Walk up looking for an Ether/ directory marker (.ray/ or library/)
            let mut candidate = dir.to_path_buf();
            for _ in 0..6 {
                if candidate.join(".ray").is_dir() || candidate.join("library").is_dir() {
                    return Ok(candidate);
                }
                if !candidate.pop() {
                    break;
                }
            }
        }
    }

    // 3. Tauri resource directory (Android bundled assets)
    let _ = app; // use app handle for resource resolution in the future

    Err("Could not determine Ether root directory. Set ETHER_ROOT env var.".into())
}

/// Validate and resolve a relative path against the Ether root.
/// Rejects path traversal attempts (.. segments).
fn resolve_safe(root: &Path, relative: &str) -> Result<PathBuf, String> {
    // Reject .. segments
    for segment in relative.split('/') {
        if segment == ".." {
            return Err("Path traversal not allowed".into());
        }
    }
    let target = root.join(relative);
    // Canonicalize both to ensure the resolved path is under root
    let canon_root = root
        .canonicalize()
        .map_err(|e| format!("Cannot canonicalize root: {}", e))?;
    let canon_target = target
        .canonicalize()
        .map_err(|e| format!("Path not found: {}", e))?;
    if !canon_target.starts_with(&canon_root) {
        return Err("Path escapes Ether root".into());
    }
    Ok(canon_target)
}

#[derive(Serialize)]
struct DirEntry {
    name: String,
    is_directory: bool,
    size: Option<u64>,
}

#[tauri::command]
fn list_directory(app: tauri::AppHandle, path: String) -> Result<Vec<DirEntry>, String> {
    let root = ether_root(&app)?;
    let target = if path.is_empty() {
        root.canonicalize().map_err(|e| format!("Cannot canonicalize root: {}", e))?
    } else {
        resolve_safe(&root, &path)?
    };

    if !target.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(&target).map_err(|e| format!("Cannot read directory: {}", e))?;
    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Error reading entry: {}", e))?;
        let metadata = entry.metadata().map_err(|e| format!("Error reading metadata: {}", e))?;
        entries.push(DirEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_directory: metadata.is_dir(),
            size: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
        });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

#[tauri::command]
fn read_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let root = ether_root(&app)?;
    let target = resolve_safe(&root, &path)?;

    if !target.is_file() {
        return Err(format!("Not a file: {}", path));
    }

    std::fs::read_to_string(&target).map_err(|e| format!("Cannot read file: {}", e))
}

#[tauri::command]
fn file_exists(app: tauri::AppHandle, path: String) -> bool {
    let root = match ether_root(&app) {
        Ok(r) => r,
        Err(_) => return false,
    };
    if path.is_empty() {
        return root.is_dir();
    }
    match resolve_safe(&root, &path) {
        Ok(target) => target.exists(),
        Err(_) => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_directory,
            read_file,
            file_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
