use std::fs;
use serde::Serialize;
use tauri::Manager;

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
    pub error: String,
}

/// Check if a URL is reachable using the system curl command.
#[tauri::command]
pub async fn check_url(url: String) -> UrlCheckResult {
    let output = std::process::Command::new("curl")
        .args([
            "-sI",
            "--max-time", "8",
            "--location",
            "-o", "/dev/null",
            "-w", "%{http_code}",
            &url,
        ])
        .output();

    match output {
        Ok(out) => {
            let status_str = String::from_utf8_lossy(&out.stdout);
            let status: u16 = status_str.trim().parse().unwrap_or(0);
            if out.status.success() && status > 0 && status < 600 {
                UrlCheckResult { reachable: true, error: String::new() }
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                UrlCheckResult { reachable: false, error: stderr }
            }
        }
        Err(e) => UrlCheckResult { reachable: false, error: e.to_string() },
    }
}

/// Create an embedded webview in the main window from Rust side.
/// Uses initialization_script to inject JS on every page load (handles target="_blank" links).
#[tauri::command]
pub async fn create_webview(
    app: tauri::AppHandle,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    user_agent: String,
) -> Result<(), String> {
    use tauri::webview::WebviewBuilder;
    use tauri::{LogicalPosition, LogicalSize};

    let window = app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let parsed_url = url.parse::<tauri::Url>()
        .map_err(|e| format!("Invalid URL: {}", e))?;

    // JS injected on every page load — handles target="_blank" links and blank page detection
    let init_script = r#"
        (function() {
            if (window.__tauriLinkHandlerInstalled) return;
            window.__tauriLinkHandlerInstalled = true;

            // Intercept clicks on links with target="_blank" to navigate in-place
            document.addEventListener('click', function(e) {
                var el = e.target;
                while (el && el.tagName !== 'A') el = el.parentElement;
                if (!el || !el.href) return;
                if (el.target === '_blank' || el.target === '_new') {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = el.href;
                }
            }, true);

            // Detect blank pages and show a friendly message
            setTimeout(function() {
                var body = document.body;
                if (!body) return;
                var text = (body.innerText || '').trim();
                var children = body.children.length;
                if (text.length === 0 && children === 0) {
                    document.documentElement.style.background = '#1e1e2e';
                    body.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#1e1e2e;color:#cdd6f4;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
                    body.innerHTML = '<div style="text-align:center;max-width:400px;padding:20px;">'
                        + '<div style="font-size:48px;margin-bottom:16px;">🌐</div>'
                        + '<h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#cdd6f4;">页面无法显示</h2>'
                        + '<p style="margin:0;font-size:14px;color:#a6adc8;">此页面可能不支持在应用内嵌入显示。</p>'
                        + '<p style="margin:8px 0 0;font-size:12px;color:#6c7086;">请使用顶部按钮在浏览器中打开。</p>'
                        + '</div>';
                }
            }, 2000);
        })();
    "#;

    let builder = WebviewBuilder::new(&label, tauri::WebviewUrl::External(parsed_url))
        .user_agent(&user_agent)
        .auto_resize()
        .initialization_script(init_script);

    window.as_ref().window().add_child(
        builder,
        LogicalPosition::new(x, y),
        LogicalSize::new(width, height),
    ).map_err(|e| format!("Failed to create webview: {}", e))?;

    Ok(())
}

/// Navigate an embedded webview (back / forward).
#[tauri::command]
pub async fn navigate_webview(app: tauri::AppHandle, label: String, action: String) -> Result<(), String> {
    let wv = app.get_webview(&label)
        .ok_or_else(|| format!("Webview '{}' not found", label))?;
    let js = match action.as_str() {
        "back" => "history.back();",
        "forward" => "history.forward();",
        _ => return Err(format!("Unknown action: {}", action)),
    };
    wv.eval(js).map_err(|e| e.to_string())
}

/// Close an embedded webview by label.
#[tauri::command]
pub async fn close_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(wv) = app.get_webview(&label) {
        wv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Reposition an embedded webview.
#[tauri::command]
pub async fn set_webview_position(
    app: tauri::AppHandle,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::LogicalPosition;
    use tauri::LogicalSize;

    if let Some(wv) = app.get_webview(&label) {
        wv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        wv.set_size(LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    }
    Ok(())
}
