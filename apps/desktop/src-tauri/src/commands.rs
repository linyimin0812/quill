use std::fs;

#[tauri::command]
pub async fn open_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn select_directory() -> Result<String, String> {
    Err("Use tauri-plugin-dialog for directory selection".to_string())
}
