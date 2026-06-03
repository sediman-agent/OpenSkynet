#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_config_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    Ok(config_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn ensure_config_dir(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;

    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            get_config_dir,
            ensure_config_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
