// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod server;

fn main() {
    let mut args = std::env::args().skip(1);
    match args.next().as_deref() {
        Some("version" | "%") => {
            #[cfg(windows)]
            {
                extern "system" { fn AttachConsole(id: u32) -> i32; }
                unsafe { AttachConsole(u32::MAX); }
            }
            println!("Ether {}", env!("CARGO_PKG_VERSION"));
        }
        Some("serve") => {
            let port: u16 = args
                .next()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8421);

            // Ether root: ETHER_ROOT env, or walk up from exe to find it
            let ether_root = std::env::var("ETHER_ROOT")
                .map(std::path::PathBuf::from)
                .ok()
                .or_else(|| {
                    let exe = std::env::current_exe().ok()?;
                    let mut dir = exe.parent()?.to_path_buf();
                    for _ in 0..6 {
                        if dir.join(".ray").is_dir() || dir.join("library").is_dir() {
                            return Some(dir);
                        }
                        dir.pop();
                    }
                    None
                })
                .unwrap_or_else(|| {
                    eprintln!("Cannot determine Ether root. Set ETHER_ROOT env var.");
                    std::process::exit(1);
                });

            // Dist root: next to the exe, or ETHER_DIST env
            let dist_root = std::env::var("ETHER_DIST")
                .map(std::path::PathBuf::from)
                .ok()
                .or_else(|| {
                    let exe = std::env::current_exe().ok()?;
                    let dir = exe.parent()?;
                    let candidate = dir.join("dist");
                    if candidate.is_dir() {
                        return Some(candidate);
                    }
                    // Also check ../dist (common in dev)
                    let candidate = dir.parent()?.join("dist");
                    if candidate.is_dir() {
                        return Some(candidate);
                    }
                    None
                })
                .unwrap_or_else(|| std::path::PathBuf::from("dist"));

            server::serve(ether_root, dist_root, port);
        }
        _ => ether_lib::run(),
    }
}
