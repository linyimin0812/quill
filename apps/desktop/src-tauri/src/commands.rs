use std::fs;
use serde::Serialize;

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

#[derive(Serialize)]
pub struct UrlCheckResult {
    pub reachable: bool,
    pub status: u16,
    pub x_frame_options: String,
    pub csp: String,
    pub error: String,
}

#[tauri::command]
pub async fn check_url(url: String) -> UrlCheckResult {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => return UrlCheckResult {
            reachable: false, status: 0,
            x_frame_options: String::new(), csp: String::new(),
            error: e.to_string(),
        },
    };

    match client.get(&url).send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            let xfo = res.headers()
                .get("x-frame-options")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            let csp = res.headers()
                .get("content-security-policy")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            // Drop body immediately — we only need headers
            drop(res);
            UrlCheckResult { reachable: true, status, x_frame_options: xfo, csp, error: String::new() }
        }
        Err(e) => {
            let msg = e.to_string();
            UrlCheckResult { reachable: false, status: 0, x_frame_options: String::new(), csp: String::new(), error: msg }
        }
    }
}
