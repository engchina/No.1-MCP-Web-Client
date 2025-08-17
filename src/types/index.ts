// MCP Server Types
export interface MCPServer {
  id: string;
  name: string;
  url: string;
  type: 'streamable-http' | 'websocket' | 'stdio';
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  description?: string;
  capabilities?: string[];
  lastConnected?: Date;
  config?: Record<string, any>;
}

export interface MCPServerConfig {
  name: string;
  url: string;
  type: 'streamable-http' | 'websocket' | 'stdio';
  headers?: Record<string, string>;
  timeout?: number;
  retryAttempts?: number;
}

// Chat Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    model?: string;
    tokens?: number;
    cost?: number;
    mcpServer?: string;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  model: string;
  mcpServers: string[];
}

// LLM Provider Types
export interface LLMProvider {
  id: string;
  name: string;
  type: 'openai' | 'oracle';
  apiKey: string;
  baseUrl?: string;
  models: LLMModel[];
}

export interface LLMModel {
  id: string;
  name: string;
  displayName: string;
  maxTokens: number;
  costPer1kTokens?: {
    input: number;
    output: number;
  };
}

// API Response Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface StreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }[];
}

// UI State Types
export interface UIState {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  activeTab: 'chat' | 'servers' | 'settings';
  isLoading: boolean;
  notifications: Notification[];
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  timestamp: Date;
}

// Settings Types
export interface AppSettings {
  maxTokens: number;
  temperature: number;
  streamResponse: boolean;
  autoSave: boolean;
  theme: 'light' | 'dark' | 'system';
  // Provider type selection
  providerType: 'openai' | 'ocigenai';
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiModelName?: string;
  ocigenaiModelName?: string;
  llmProviders: LLMProvider[];
}