import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AppConfig,
  ProviderConfig,
  ModelsDevProvider,
} from "../types";

interface Props {
  config: AppConfig;
  setConfig: (c: AppConfig) => Promise<void>;
}

export function ProvidersPage({ config, setConfig }: Props) {
  const [allProviders, setAllProviders] = useState<ModelsDevProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ProviderConfig | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchProviders = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const providers = await invoke<ModelsDevProvider[]>("fetch_models_dev_providers", { force });
      setAllProviders(providers);
    } catch (e) {
      console.error("Failed to fetch providers:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const filtered = allProviders.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase())
  );

  const addedIds = new Set(config.providers.map((p) => p.providerId));

  const addProvider = (dev: ModelsDevProvider) => {
    setEditing({
      id: crypto.randomUUID(),
      name: dev.name,
      providerId: dev.id,
      apiKey: "",
      baseUrl: dev.api || "",
      enabled: true,
      selectedModels: [],
    });
  };

  const saveProvider = async (p: ProviderConfig) => {
    const exists = config.providers.findIndex((x) => x.id === p.id);
    const next = { ...config };
    if (exists >= 0) next.providers[exists] = p;
    else next.providers.push(p);
    await setConfig(next);
    setEditing(null);
  };

  const removeProvider = async (id: string) => {
    await setConfig({
      ...config,
      providers: config.providers.filter((p) => p.id !== id),
    });
  };

  const copyKey = async () => {
    await navigator.clipboard.writeText(config.proxyApiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const resetKey = async () => {
    const newKey = await invoke<string>("reset_api_key");
    await setConfig({ ...config, proxyApiKey: newKey });
  };

  return (
    <div className="flex flex-col h-full p-3 gap-2">
      {/* API Key */}
      <div className="space-y-1 shrink-0">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">API Key</span>
        <div className="flex items-center gap-1">
          <div className="flex-1 bg-zinc-800/60 border border-zinc-700/40 rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 truncate select-all">
            {config.proxyApiKey || "none"}
          </div>
          <button
            onClick={copyKey}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded bg-zinc-800/60 border border-zinc-700/40 hover:bg-zinc-700/60 transition-colors"
            title="Copy"
          >
            {copied ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1" className="text-zinc-400" />
                <path d="M8 4V2.5A1.5 1.5 0 006.5 1h-4A1.5 1.5 0 001 2.5v4A1.5 1.5 0 002.5 8H4" stroke="currentColor" strokeWidth="1" className="text-zinc-400" />
              </svg>
            )}
          </button>
          <button
            onClick={resetKey}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded bg-zinc-800/60 border border-zinc-700/40 hover:bg-zinc-700/60 transition-colors"
            title="Reset key"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M10 6a4 4 0 11-1-2.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="text-zinc-400" />
              <path d="M10 1v2.5H7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400" />
            </svg>
          </button>
        </div>
      </div>

      {/* Active providers */}
      <div className="space-y-1.5 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Active Providers</h2>
          <span className="text-[10px] text-zinc-600">{config.providers.length} added</span>
        </div>

        {config.providers.length === 0 && (
          <p className="text-[11px] text-zinc-600 py-2 text-center">None configured</p>
        )}

        {config.providers.map((p) => (
          <div
            key={p.id}
            className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg px-2.5 py-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-300">{p.name}</span>
                <span className="text-[9px] text-zinc-600">{p.selectedModels.length} models</span>
              </div>
              <div className="flex gap-0.5">
                <button
                  onClick={() => setEditing(p)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded hover:bg-zinc-800"
                >
                  edit
                </button>
                <button
                  onClick={() => removeProvider(p.id)}
                  className="text-[10px] text-zinc-600 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-zinc-800"
                >
                  rm
                </button>
              </div>
            </div>
            {p.selectedModels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {p.selectedModels.slice(0, 6).map((m) => (
                  <span
                    key={m}
                    className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded"
                  >
                    {m.split("/").pop()}
                  </span>
                ))}
                {p.selectedModels.length > 6 && (
                  <span className="text-[9px] text-zinc-600">+{p.selectedModels.length - 6}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Available providers from models.dev */}
      <div className="flex-1 min-h-0 flex flex-col gap-1.5">
        <div className="border-t border-zinc-800/50 pt-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-medium text-zinc-500">All Providers</h3>
            <button
              onClick={() => fetchProviders(true)}
              disabled={loading}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 disabled:opacity-40"
            >
              {loading ? "..." : "refresh"}
            </button>
          </div>
          <input
            className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded px-2.5 py-1.5 text-[11px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
            placeholder="Search providers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
          {filtered.map((p) => {
            const added = addedIds.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => !added && addProvider(p)}
                disabled={added}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors ${
                  added
                    ? "opacity-40 cursor-default"
                    : "hover:bg-zinc-800/40 cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] text-zinc-300 truncate">{p.name}</span>
                  <span className="text-[9px] text-zinc-600 shrink-0">
                    {Object.keys(p.models || {}).length || p.modelCount} models
                  </span>
                </div>
                {added ? (
                  <span className="text-[9px] text-emerald-500/60 shrink-0">added</span>
                ) : (
                  <span className="text-[10px] text-zinc-600 shrink-0">+ add</span>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && !loading && (
            <p className="text-[11px] text-zinc-600 py-4 text-center">No providers found</p>
          )}
        </div>
      </div>

      {editing && (
        <ProviderEditor
          provider={editing}
          modelsDev={allProviders.find((p) => p.id === editing.providerId)}
          onSave={saveProvider}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ProviderEditor({
  provider,
  modelsDev,
  onSave,
  onCancel,
}: {
  provider: ProviderConfig;
  modelsDev?: ModelsDevProvider;
  onSave: (p: ProviderConfig) => void;
  onCancel: () => void;
}) {
  const [p, setP] = useState(provider);
  const devModels = modelsDev
    ? Object.entries(modelsDev.models || {}).map(([id, info]: [string, any]) => ({
        id,
        name: info.name || id,
      }))
    : [];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 w-80 max-h-[80vh] flex flex-col shadow-2xl">
        <h3 className="text-xs font-semibold text-zinc-200 mb-3 shrink-0">
          Add {p.name}
        </h3>

        <div className="space-y-2.5 shrink-0">
          <input
            className="w-full bg-zinc-800/80 border border-zinc-700/60 rounded-md px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            placeholder="API Key"
            value={p.apiKey}
            onChange={(e) => setP({ ...p, apiKey: e.target.value })}
            type="password"
            autoFocus
          />
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            placeholder="Base URL"
            value={p.baseUrl}
            onChange={(e) => setP({ ...p, baseUrl: e.target.value })}
          />
          <label className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={p.enabled}
              onChange={(e) => setP({ ...p, enabled: e.target.checked })}
              className="accent-emerald-500 scale-90"
            />
            Enabled
          </label>
        </div>

        {devModels.length > 0 && (
          <div className="mt-3 flex-1 min-h-0 flex flex-col">
            <span className="text-[10px] text-zinc-500 mb-1.5">
              Select models ({p.selectedModels.length}/{devModels.length})
            </span>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 max-h-36 border border-zinc-800/40 rounded-md p-1.5">
              {devModels.map((m) => {
                const selected = p.selectedModels.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-800/40 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        setP({
                          ...p,
                          selectedModels: selected
                            ? p.selectedModels.filter((x) => x !== m.id)
                            : [...p.selectedModels, m.id],
                        });
                      }}
                      className="accent-emerald-500 scale-90"
                    />
                    <span className="text-[11px] text-zinc-300 truncate">{m.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-3 shrink-0">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(p)}
            className="px-3 py-1.5 text-[11px] bg-zinc-700 text-zinc-200 rounded hover:bg-zinc-600 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
