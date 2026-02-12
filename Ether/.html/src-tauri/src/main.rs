// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    match std::env::args().nth(1).as_deref() {
        Some("version" | "%") => {
            #[cfg(windows)]
            {
                extern "system" { fn AttachConsole(id: u32) -> i32; }
                unsafe { AttachConsole(u32::MAX); }
            }
            println!("Ether {}", env!("CARGO_PKG_VERSION"));
        }
        _ => ether_lib::run(),
    }
}
