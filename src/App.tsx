import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ServerPage } from "./pages/ServerPage";
import { ProvidersPage } from "./pages/ProvidersPage";
import { AppConfig, DEFAULT_CONFIG } from "./types";

type Page = "server" | "providers";

function TitleBar() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setMaximized);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [win]);

  const minimize = () => win.minimize();
  const toggleMaximize = () => win.toggleMaximize();
  const close = () => win.close();

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).hasAttribute("data-tauri-drag-region")) {
          win.startDragging();
        }
      }}
      className="flex items-center justify-between h-9 px-3 bg-zinc-950 border-b border-zinc-800/60 select-none shrink-0"
    >
      <span data-tauri-drag-region className="text-[11px] font-medium text-zinc-400 tracking-wide cursor-grab active:cursor-grabbing">
        ProxyRouter
      </span>
      <div className="flex items-center gap-0.5" onMouseDown={(e) => e.stopPropagation()}>
        <button
          onClick={minimize}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-800 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="2" y="5.5" width="8" height="1" rx="0.5" fill="currentColor" className="text-zinc-400" />
          </svg>
        </button>
        <button
          onClick={toggleMaximize}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-800 transition-colors"
        >
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1" className="text-zinc-400" />
              <path d="M4 3V2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H9" stroke="currentColor" strokeWidth="1" className="text-zinc-400" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1" className="text-zinc-400" />
            </svg>
          )}
        </button>
        <button
          onClick={close}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/80 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-zinc-400" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("server");
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    invoke<AppConfig>("load_config").then(setConfig).catch(() => {});
  }, []);

  const saveConfig = async (next: AppConfig) => {
    setConfig(next);
    await invoke("save_config", { config: next });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      <TitleBar />

      <div className="flex flex-1 min-h-0">
        <nav className="w-32 flex-shrink-0 bg-zinc-900/50 border-r border-zinc-800/60 flex flex-col py-3 gap-0.5">
          {([
            { id: "server" as const, label: "Server", icon: "M4 12h8M6 8l-2 4 2 4M18 12h-8M18 8l2 4-2 4" },
            { id: "providers" as const, label: "Providers", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
          ]).map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={`mx-2 px-3 py-2 rounded-md text-left text-xs font-medium transition-colors flex items-center gap-2 ${
                page === id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={icon} />
              </svg>
              {label}
            </button>
          ))}
        </nav>

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {page === "server" && <ServerPage config={config} setConfig={saveConfig} />}
          {page === "providers" && <ProvidersPage config={config} setConfig={saveConfig} />}
        </main>
      </div>
    </div>
  );
}
