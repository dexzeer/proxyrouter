export interface ProviderConfig {
  id: string;
  name: string;
  providerId: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  selectedModels: string[];
}

export interface AppConfig {
  providers: ProviderConfig[];
  proxyPort: number;
  proxyApiKey: string;
  modelPriorities: Record<string, string>;
}

export interface DuplicateModel {
  shortId: string;
  providers: { providerId: string; providerName: string; fullId: string }[];
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  selected: boolean;
}

export interface ModelsDevProvider {
  id: string;
  name: string;
  api?: string;
  env: string[];
  models?: Record<string, { name: string; [key: string]: any }>;
  modelCount: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  providers: [],
  proxyPort: 7144,
  proxyApiKey: "",
  modelPriorities: {},
};
