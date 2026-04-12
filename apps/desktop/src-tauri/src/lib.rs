mod commands;

use std::process::Command;
use tauri::Manager;

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
            // Locate quill-api-bundle next to the current executable
            // In .app bundle: Contents/MacOS/quill → Contents/MacOS/quill-api-bundle/
            let exe_path = std::env::current_exe()
                .expect("failed to get current exe path");
            let exe_dir = exe_path.parent()
                .expect("failed to get exe directory");
            let bundle_dir = exe_dir.join("quill-api-bundle");
            let main_js = bundle_dir.join("dist").join("main.js");

            if !main_js.exists() {
                eprintln!("[Quill] Sidecar not found at {:?}. Running without backend.", main_js);
                return Ok(());
            }

            println!("[Quill] Starting NestJS sidecar from: {:?}", main_js);

            // Spawn Node.js process to run the NestJS API
            let child = Command::new("node")
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
