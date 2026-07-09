use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

mod proxy;
mod config;

pub use config::{AppConfig, ProviderConfig, ModelInfo};
pub use proxy::ProxyServer;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ModelsDevProvider {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub api: Option<String>,
    #[serde(default)]
    pub env: Vec<String>,
    #[serde(default)]
    pub models: serde_json::Value,
}

pub struct ProvidersCache {
    pub data: Vec<ModelsDevProvider>,
    pub fetched_at: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct DuplicateEntry {
    #[serde(rename = "providerId")]
    pub provider_id: String,
    #[serde(rename = "providerName")]
    pub provider_name: String,
    #[serde(rename = "fullId")]
    pub full_id: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct DuplicateModel {
    #[serde(rename = "shortId")]
    pub short_id: String,
    pub providers: Vec<DuplicateEntry>,
}

pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub server: Mutex<Option<ProxyServer>>,
    pub providers_cache: Mutex<Option<ProvidersCache>>,
}

#[tauri::command]
fn load_config(state: State<AppState>) -> Result<AppConfig, String> {
    let cfg = config::load();
    *state.config.lock().unwrap() = cfg.clone();
    Ok(cfg)
}

#[tauri::command]
fn save_config(state: State<AppState>, config: AppConfig) -> Result<(), String> {
    config::save(&config)?;
    *state.config.lock().unwrap() = config;
    Ok(())
}

#[tauri::command]
fn start_server(state: State<AppState>, port: u16) -> Result<String, String> {
    let cfg = state.config.lock().unwrap().clone();
    let mut server_guard = state.server.lock().unwrap();

    if server_guard.is_some() {
        return Err("Server already running".into());
    }

    let server = ProxyServer::start(port, cfg)?;
    let msg = format!("Proxy listening on localhost:{}", port);
    *server_guard = Some(server);
    Ok(msg)
}

#[tauri::command]
fn stop_server(state: State<AppState>) -> Result<(), String> {
    let mut server_guard = state.server.lock().unwrap();
    if let Some(server) = server_guard.take() {
        server.stop();
    }
    Ok(())
}

#[tauri::command]
fn is_server_running(state: State<AppState>) -> bool {
    state.server.lock().unwrap().is_some()
}

#[tauri::command]
async fn fetch_models_dev_providers(
    state: State<'_, AppState>,
    force: Option<bool>,
) -> Result<Vec<ModelsDevProvider>, String> {
    if force != Some(true) {
        let cache = state.providers_cache.lock().unwrap();
        if let Some(ref c) = *cache {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            if now - c.fetched_at < 86400 {
                return Ok(c.data.clone());
            }
        }
    }

    let client = reqwest::Client::new();
    let resp = client
        .get("https://models.dev/api.json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch models.dev: {}", e))?;

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse models.dev: {}", e))?;

    let providers: Vec<ModelsDevProvider> = data
        .as_object()
        .map(|obj| {
            obj.iter()
                .filter_map(|(key, val)| {
                    let p = val.as_object()?;
                    let name = p.get("name")?.as_str()?.to_string();
                    let api = p.get("api").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let env: Vec<String> = p
                        .get("env")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|e| e.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default();
                    Some(ModelsDevProvider {
                        id: key.clone(),
                        name,
                        api,
                        env,
                        models: p.get("models").cloned().unwrap_or(serde_json::Value::Null),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    *state.providers_cache.lock().unwrap() = Some(ProvidersCache {
        data: providers.clone(),
        fetched_at: now,
    });

    Ok(providers)
}

#[tauri::command]
fn find_duplicates(state: State<AppState>) -> Vec<DuplicateModel> {
    let cfg = state.config.lock().unwrap();
    let mut short_to_providers: HashMap<String, Vec<DuplicateEntry>> = HashMap::new();

    for p in &cfg.providers {
        if !p.enabled {
            continue;
        }
        for model_id in &p.selected_models {
            let short = model_id.split('/').last().unwrap_or(model_id).to_string();
            short_to_providers
                .entry(short)
                .or_default()
                .push(DuplicateEntry {
                    provider_id: p.provider_id.clone(),
                    provider_name: p.name.clone(),
                    full_id: model_id.clone(),
                });
        }
    }

    short_to_providers
        .into_iter()
        .filter(|(_, entries)| entries.len() > 1)
        .filter(|(short, _)| !cfg.model_priorities.contains_key(short))
        .map(|(short_id, providers)| DuplicateModel { short_id, providers })
        .collect()
}

#[tauri::command]
fn reset_api_key(state: State<AppState>) -> Result<String, String> {
    let new_key = config::generate_key();
    let mut cfg = state.config.lock().unwrap();
    cfg.proxy_api_key = new_key.clone();
    config::save(&cfg)?;
    Ok(new_key)
}

#[tauri::command]
async fn fetch_available_models(state: State<'_, AppState>) -> Result<Vec<ModelInfo>, String> {
    let cfg = state.config.lock().unwrap().clone();
    let mut all_models = Vec::new();

    for provider in &cfg.providers {
        if !provider.enabled || provider.api_key.is_empty() {
            continue;
        }

        let models = proxy::fetch_models(provider).await.unwrap_or_default();
        all_models.extend(models);
    }

    Ok(all_models)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        config: Mutex::new(AppConfig::default()),
        server: Mutex::new(None),
        providers_cache: Mutex::new(None),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            start_server,
            stop_server,
            is_server_running,
            fetch_available_models,
            fetch_models_dev_providers,
            reset_api_key,
            find_duplicates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
