import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppConfig, DuplicateModel } from "../types";

interface Props {
  config: AppConfig;
  setConfig: (c: AppConfig) => Promise<void>;
}

export function ServerPage({ config, setConfig }: Props) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicateModel[]>([]);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    invoke<boolean>("is_server_running").then(setRunning).catch(() => {});
  }, []);

  const startWithCheck = async () => {
    const dups = await invoke<DuplicateModel[]>("find_duplicates");
    if (dups.length > 0) {
      setDuplicates(dups);
      return;
    }
    const msg = await invoke<string>("start_server", { port: config.proxyPort });
    setRunning(true);
    setLog(msg);
  };

  const stop = async () => {
    await invoke("stop_server");
    setRunning(false);
    setLog("proxy shut down");
  };

  const toggle = () => (running ? stop() : startWithCheck());

  const resolvePriority = async (shortId: string, providerId: string) => {
    const newPriorities = { ...config.modelPriorities, [shortId]: providerId };
    // Always save to config so find_duplicates can see it
    await setConfig({ ...config, modelPriorities: newPriorities });

    const remaining = await invoke<DuplicateModel[]>("find_duplicates");
    if (remaining.length === 0) {
      setDuplicates([]);
      const msg = await invoke<string>("start_server", { port: config.proxyPort });
      setRunning(true);
      setLog(msg);
      // If not remembering, clear priorities after server started
      if (!remember) {
        await setConfig({ ...config, modelPriorities: {} });
      }
    } else {
      setDuplicates(remaining);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 px-6 pb-8">
      <div className="text-center">
        <h2 className="text-sm font-semibold text-zinc-200">Proxy Server</h2>
        <p className="text-[11px] text-zinc-600 mt-0.5">
          localhost:{config.proxyPort} &middot; OpenAI-compatible
        </p>
      </div>

      <button
        onClick={toggle}
        className={`
          w-32 h-32 rounded-full text-sm font-medium transition-all duration-200 flex items-center justify-center
          ${
            running
              ? "bg-red-500/15 text-red-400 border-2 border-red-500/30 hover:bg-red-500/25 hover:scale-105"
              : "bg-emerald-500/15 text-emerald-400 border-2 border-emerald-500/30 hover:bg-emerald-500/25 hover:scale-105"
          }
        `}
      >
        {running ? "Stop" : "Start"}
      </button>

      <div
        className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full ${
          running
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-zinc-800/80 text-zinc-500"
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            running ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
          }`}
        />
        {running ? "running" : "stopped"}
      </div>

      {log && (
        <p className="text-[11px] text-zinc-600 font-mono">{log}</p>
      )}

      {/* Duplicate resolution popup */}
      {duplicates.length > 0 && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 w-80 max-h-[80vh] flex flex-col shadow-2xl">
            <h3 className="text-xs font-semibold text-zinc-200 mb-1 shrink-0">
              Resolve Duplicate Models
            </h3>
            <p className="text-[10px] text-zinc-500 mb-3 shrink-0">
              Multiple providers serve the same model. Pick which one to route through.
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              {duplicates.map((dup) => (
                <div key={dup.shortId} className="space-y-1.5">
                  <span className="text-[11px] text-zinc-300 font-mono">
                    {dup.shortId}
                  </span>
                  <div className="flex flex-col gap-1">
                    {dup.providers.map((entry) => (
                      <button
                        key={entry.providerId}
                        onClick={() => resolvePriority(dup.shortId, entry.providerId)}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded bg-zinc-800/60 border border-zinc-700/40 hover:bg-zinc-700/60 hover:border-zinc-600/60 transition-colors text-left"
                      >
                        <span className="text-[11px] text-zinc-300">{entry.providerName}</span>
                        <span className="text-[9px] text-zinc-600 font-mono">{entry.fullId}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 mt-3 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="accent-emerald-500 scale-90"
              />
              <span className="text-[10px] text-zinc-500">Remember my choice</span>
            </label>
            <button
              onClick={() => setDuplicates([])}
              className="mt-2 w-full px-3 py-1.5 text-[11px] text-zinc-400 bg-zinc-800/60 border border-zinc-700/40 rounded hover:bg-zinc-700/60 hover:text-zinc-200 transition-colors shrink-0"
            >
              Exit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
