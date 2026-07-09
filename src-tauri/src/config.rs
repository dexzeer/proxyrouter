use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub providers: Vec<ProviderConfig>,
    #[serde(rename = "proxyPort", default = "default_port")]
    pub proxy_port: u16,
    #[serde(rename = "proxyApiKey", default)]
    pub proxy_api_key: String,
    /// Maps short model name -> provider id that should handle it
    #[serde(rename = "modelPriorities", default)]
    pub model_priorities: std::collections::HashMap<String, String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            providers: Vec::new(),
            proxy_port: default_port(),
            proxy_api_key: generate_key(),
            model_priorities: std::collections::HashMap::new(),
        }
    }
}

fn default_port() -> u16 {
    7144
}

pub fn generate_key() -> String {
    use std::fmt::Write;
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("failed to generate random bytes");
    let mut s = String::with_capacity(64);
    for b in bytes {
        write!(&mut s, "{:02x}", b).unwrap();
    }
    format!("sk-{}", s)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    #[serde(rename = "providerId")]
    pub provider_id: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    pub enabled: bool,
    #[serde(rename = "selectedModels", default)]
    pub selected_models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    #[serde(default)]
    pub selected: bool,
}

fn config_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".ai-gateway")
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn load() -> AppConfig {
    let path = config_path();
    if path.exists() {
        let data = std::fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        AppConfig::default()
    }
}

pub fn save(config: &AppConfig) -> Result<(), String> {
    let dir = config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(config_path(), json).map_err(|e| e.to_string())?;
    Ok(())
}
