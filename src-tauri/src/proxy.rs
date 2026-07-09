use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response, Method, StatusCode};
use hyper_util::rt::TokioIo;
use serde_json::Value;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::watch;

use crate::config::{AppConfig, ModelInfo, ProviderConfig};

pub struct ProxyServer {
    shutdown_tx: watch::Sender<bool>,
    handle: std::thread::JoinHandle<()>,
}

impl ProxyServer {
    pub fn start(port: u16, config: AppConfig) -> Result<Self, String> {
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let config = Arc::new(config);

        let handle = std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .unwrap();
            rt.block_on(async move {
                if let Err(e) = run_server(port, config, shutdown_rx).await {
                    eprintln!("Server error: {}", e);
                }
            });
        });

        Ok(ProxyServer { shutdown_tx, handle })
    }

    pub fn stop(self) {
        let _ = self.shutdown_tx.send(true);
        let _ = self.handle.join();
    }
}

async fn run_server(
    port: u16,
    config: Arc<AppConfig>,
    mut shutdown_rx: watch::Receiver<bool>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = TcpListener::bind(addr).await?;
    println!("Proxy listening on {}", addr);

    loop {
        tokio::select! {
            result = listener.accept() => {
                let (stream, _) = result?;
                let config = config.clone();
                let mut rx = shutdown_rx.clone();
                tokio::spawn(async move {
                    let io = TokioIo::new(stream);
                    let service = service_fn(move |req| {
                        let config = config.clone();
                        handle_request(req, config)
                    });
                    let conn = http1::Builder::new().serve_connection(io, service);
                    tokio::pin!(conn);
                    tokio::select! {
                        result = conn.as_mut() => {
                            if let Err(e) = result {
                                eprintln!("Connection error: {}", e);
                            }
                        }
                        _ = rx.changed() => {
                            conn.as_mut().graceful_shutdown();
                        }
                    }
                });
            }
            _ = shutdown_rx.changed() => {
                println!("Shutting down proxy server");
                break;
            }
        }
    }
    Ok(())
}

async fn handle_request(
    req: Request<Incoming>,
    config: Arc<AppConfig>,
) -> Result<Response<Full<Bytes>>, hyper::Error> {
    let method = req.method().clone();
    let uri = req.uri().path().to_string();

    if method == Method::OPTIONS {
        return Ok(cors(Response::new(Full::new(Bytes::new()))));
    }

    if uri == "/" || uri == "/health" {
        let body = serde_json::json!({ "status": "ok", "port": config.proxy_port });
        return Ok(cors(Response::builder()
            .header("content-type", "application/json")
            .body(Full::new(Bytes::from(body.to_string())))
            .unwrap()));
    }

    eprintln!("[proxy] {} {}", method, uri);

    if !config.proxy_api_key.is_empty() && uri != "/v1/models" {
        let authed = req
            .headers()
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .map(|v| v.strip_prefix("Bearer ").unwrap_or(v) == config.proxy_api_key.as_str())
            .unwrap_or(false);
        if !authed {
            return Ok(cors(err(StatusCode::UNAUTHORIZED, "invalid or missing API key")));
        }
    }

    if uri == "/v1/models" && method == Method::GET {
        return Ok(cors(models_list(&config)));
    }

    if uri == "/v1/chat/completions" && method == Method::POST {
        let body = req.collect().await?.to_bytes();
        return match forward(body, &config).await {
            Ok(r) => Ok(r),
            Err(e) => Ok(cors(err(StatusCode::BAD_GATEWAY, &e))),
        };
    }

    Ok(cors(err(StatusCode::NOT_FOUND, "Not found")))
}

fn cors<T>(mut resp: Response<T>) -> Response<T> {
    let h = resp.headers_mut();
    h.insert("access-control-allow-origin", "*".parse().unwrap());
    h.insert("access-control-allow-methods", "GET, POST, OPTIONS".parse().unwrap());
    h.insert("access-control-allow-headers", "Content-Type, Authorization".parse().unwrap());
    resp
}

fn models_list(config: &AppConfig) -> Response<Full<Bytes>> {
    let models: Vec<Value> = config
        .providers
        .iter()
        .filter(|p| p.enabled)
        .flat_map(|p| {
            p.selected_models.iter().map(move |id| {
                serde_json::json!({ "id": id, "object": "model", "created": 0, "owned_by": p.name.to_lowercase() })
            })
        })
        .collect();

    let body = serde_json::json!({ "object": "list", "data": models });
    cors(Response::builder()
        .header("content-type", "application/json")
        .body(Full::new(Bytes::from(body.to_string())))
        .unwrap())
}

async fn forward(body: Bytes, config: &AppConfig) -> Result<Response<Full<Bytes>>, String> {
    let mut req: Value = serde_json::from_slice(&body).map_err(|e| e.to_string())?;
    let model = req.get("model").and_then(|v| v.as_str()).ok_or("missing model")?;

    eprintln!("[proxy] incoming model: {}", model);

    let short = model.split('/').last().unwrap_or(model);
    let priority_provider = config.model_priorities.get(short);

    let candidates: Vec<_> = config
        .providers
        .iter()
        .filter(|p| p.enabled)
        .filter_map(|p| {
            p.selected_models.iter().find_map(|m| {
                if m == model || m.split('/').last() == Some(model) {
                    Some((p, m.clone()))
                } else {
                    None
                }
            })
        })
        .collect();

    let (provider, full_model_id) = if candidates.len() == 1 {
        candidates.into_iter().next().unwrap()
    } else {
        let chosen_idx = if let Some(ppid) = priority_provider {
            candidates.iter().position(|(p, _)| &p.provider_id == ppid)
        } else {
            None
        };
        let idx = chosen_idx.or(Some(0));
        candidates.into_iter().nth(idx.unwrap())
            .ok_or(format!("no provider for '{}'", model))?
    };

    eprintln!("[proxy] matched provider: {} -> {}", provider.name, full_model_id);

    req["model"] = serde_json::json!(full_model_id);

    let url = format!("{}/chat/completions", provider.base_url.trim_end_matches('/'));
    eprintln!("[proxy] forwarding to: {}", url);

    let resp = reqwest::Client::new()
        .post(&url)
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {}", provider.api_key))
        .body(serde_json::to_vec(&req).map_err(|e| e.to_string())?)
        .send()
        .await
        .map_err(|e| format!("upstream: {}", e))?;

    let status = resp.status().as_u16();
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    let r = Response::builder()
        .status(status)
        .header("content-type", content_type)
        .body(Full::new(Bytes::from(bytes.to_vec())))
        .map_err(|e| e.to_string())?;
    Ok(cors(r))
}

fn err(status: StatusCode, msg: &str) -> Response<Full<Bytes>> {
    let body = serde_json::json!({ "error": { "message": msg, "type": "proxy_error" } });
    cors(Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Full::new(Bytes::from(body.to_string())))
        .unwrap())
}

pub async fn fetch_models(provider: &ProviderConfig) -> Result<Vec<ModelInfo>, String> {
    if provider.api_key.is_empty() {
        return Ok(vec![]);
    }
    let url = format!("{}/models", provider.base_url.trim_end_matches('/'));
    let data: Value = reqwest::Client::new()
        .get(&url)
        .header("authorization", format!("Bearer {}", provider.api_key))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(data
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let id = m.get("id")?.as_str()?;
                    Some(ModelInfo {
                        id: format!("{}/{}", provider.provider_id, id),
                        name: id.to_string(),
                        provider: provider.name.clone(),
                        selected: provider.selected_models.iter().any(|m| m == id || m.ends_with(&format!("/{}", id))),
                    })
                })
                .collect()
        })
        .unwrap_or_default())
}
