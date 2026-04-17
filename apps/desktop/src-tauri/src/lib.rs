mod commands;

use std::path::Path;
use std::process::Command;
use tauri::Manager;

/// Try to find `node` on the current PATH.
fn which_node_from_path() -> Option<String> {
    let path_var = std::env::var("PATH").ok()?;
    for dir in path_var.split(':') {
        let candidate = Path::new(dir).join("node");
        if candidate.exists() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

/// Resolve the default nvm node binary from ~/.nvm.
fn resolve_nvm_node() -> Option<String> {
    let home = std::env::var("HOME").ok()?;
    let nvm_dir = Path::new(&home).join(".nvm").join("versions").join("node");
    if !nvm_dir.exists() {
        return None;
    }
    // Find the latest installed node version
    let mut versions: Vec<_> = std::fs::read_dir(&nvm_dir).ok()?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    versions.sort();
    let latest = versions.last()?;
    let node_bin = nvm_dir.join(latest).join("bin").join("node");
    if node_bin.exists() {
        Some(node_bin.to_string_lossy().to_string())
    } else {
        None
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Open DevTools for debugging
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            // Locate quill-api-bundle:
            // 1. Production: next to the executable (Contents/MacOS/quill-api-bundle/)
            // 2. Development: in src-tauri/binaries/quill-api-bundle/
            let exe_path = std::env::current_exe()
                .expect("failed to get current exe path");
            let exe_dir = exe_path.parent()
                .expect("failed to get exe directory");

            let bundle_dir = {
                let prod_dir = exe_dir.join("quill-api-bundle");
                if prod_dir.join("dist").join("index.js").exists() {
                    prod_dir
                } else {
                    // Dev fallback: walk up from target/debug/ to src-tauri/binaries/
                    exe_dir.join("..").join("..").join("binaries").join("quill-api-bundle")
                }
            };
            let main_js = bundle_dir.join("dist").join("index.js");

            if !main_js.exists() {
                eprintln!("[Quill] Sidecar not found at {:?}. Running without backend.", main_js);
                return Ok(());
            }

            println!("[Quill] Starting NestJS sidecar from: {:?}", main_js);

            // Resolve the full path to `node`.
            // When launched from Finder, PATH may not include nvm/homebrew paths,
            // so we check common locations as fallback.
            let node_bin = {
                let candidates = [
                    std::env::var("NODE_PATH_OVERRIDE").ok(),
                    which_node_from_path(),
                    Some("/usr/local/bin/node".to_string()),
                    Some("/opt/homebrew/bin/node".to_string()),
                    resolve_nvm_node(),
                ];
                candidates.into_iter()
                    .flatten()
                    .find(|p| Path::new(p).exists())
                    .unwrap_or_else(|| "node".to_string())
            };

            println!("[Quill] Using node binary: {}", node_bin);

            // Spawn Node.js process to run the NestJS API
            let child = Command::new(&node_bin)
                .arg(&main_js)
                .current_dir(&bundle_dir)
                .spawn();

            match child {
                Ok(child) => {
                    println!("[Quill] NestJS sidecar started (pid: {})", child.id());
                    std::mem::forget(child);
                }
                Err(err) => {
                    eprintln!("[Quill] Failed to start sidecar: {}. App will run without backend.", err);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_file,
            commands::save_file,
            commands::select_directory,
            commands::check_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
