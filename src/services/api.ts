import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { APIResponse, StreamResponse, LLMProvider, MCPServer } from '../types';

// Base API client
class APIClient {
  private client: AxiosInstance;

  constructor(baseURL?: string) {
    this.client = axios.create({
      baseURL: baseURL || '/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config: any) => {
        // Add auth token if available
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error: any) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: any) => response,
      (error: any) => {
        console.error('API Error:', error);
        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, params?: any): Promise<APIResponse<T>> {
    const response: AxiosResponse<APIResponse<T>> = await this.client.get(url, { params });
    return response.data;
  }

  async post<T>(url: string, data?: any): Promise<APIResponse<T>> {
    const response: AxiosResponse<APIResponse<T>> = await this.client.post(url, data);
    return response.data;
  }

  async put<T>(url: string, data?: any): Promise<APIResponse<T>> {
    const response: AxiosResponse<APIResponse<T>> = await this.client.put(url, data);
    return response.data;
  }

  async delete<T>(url: string): Promise<APIResponse<T>> {
    const response: AxiosResponse<APIResponse<T>> = await this.client.delete(url);
    return response.data;
  }
}

// LLM API Service
export class LLMService {
  private client: AxiosInstance;

  constructor(provider: LLMProvider) {
    const base = provider.baseUrl || '';
    const normalizedBase = base.endsWith('/') ? base : base + '/';
    this.client = axios.create({
      baseURL: normalizedBase || '/api/',
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
    });
  }

  async chat(messages: any[], model: string, options: any = {}): Promise<any> {
    const response = await this.client.post('chat/completions', {
      model,
      messages,
      stream: false,
      ...options,
    });
    return response.data;
  }

  async *chatStream(messages: any[], model: string, options: any = {}): AsyncGenerator<StreamResponse> {
    // Use fetch in the browser to get a ReadableStream for SSE
    const base = ((this.client.defaults as any)?.baseURL || window.location.origin) as string;
    const baseNormalized = base.endsWith('/') ? base : base + '/';
    const url = new URL('chat/completions', baseNormalized);

    // Extract Authorization header from axios instance if present
    const defaultsHeaders: any = (this.client.defaults as any)?.headers || {};
    const authHeader = defaultsHeaders['Authorization'] || defaultsHeaders.common?.['Authorization'];

    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        ...options,
      }),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    }
    if (!resp.body) {
      throw new Error('ReadableStream not available on response.body');
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let buffer = '';
    let eventData = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process buffer line-by-line (SSE is line-oriented, events end with a blank line)
        let newlineIndex;
        // eslint-disable-next-line no-cond-assign
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
          buffer = buffer.slice(newlineIndex + 1);

          if (line.startsWith('data:')) {
            eventData += line.slice(5).trimStart() + '\n';
          } else if (line.trim() === '') {
            // End of one SSE event
            const data = eventData.trim();
            eventData = '';
            if (!data) continue;
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data);
              yield parsed as any;
            } catch (e) {
              console.warn('Failed to parse SSE data:', data);
            }
          }
        }
      }

      // Flush remaining data if any
      const finalData = (eventData + buffer).trim();
      if (finalData) {
        if (finalData !== '[DONE]') {
          try {
            const parsed = JSON.parse(finalData);
            yield parsed as any;
          } catch (e) {
            // ignore
          }
        }
      }
    } finally {
      try { await reader.cancel(); } catch {}
      try { reader.releaseLock(); } catch {}
    }
  }
}

// Oracle Generative AI Service
export class OracleAIService {
  private client: AxiosInstance;

  constructor(apiKey: string, region: string = 'us-ashburn-1') {
    this.client = axios.create({
      baseURL: `https://inference.generativeai.${region}.oci.oraclecloud.com`,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });
  }

  async chat(messages: any[], options: any = {}): Promise<any> {
    const response = await this.client.post('/20231130/actions/chat', {
      compartmentId: options.compartmentId,
      servingMode: {
        servingType: 'ON_DEMAND',
        modelId: options.model || 'meta.llama-4-scout-17b-16e-instruct',
      },
      chatRequest: {
        messages,
        maxTokens: options.maxTokens || 2048,
        temperature: options.temperature || 0.7,
        topP: options.topP || 0.9,
        frequencyPenalty: options.frequencyPenalty || 0,
        presencePenalty: options.presencePenalty || 0,
        isStream: false,
      },
    });
    return response.data;
  }
}

// MCP Server Service
export class MCPServerService {
  private client: AxiosInstance;

  constructor(server: MCPServer) {
    this.client = axios.create({
      baseURL: server.url,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...server.config?.headers,
      },
    });
  }

  async connect(): Promise<boolean> {
    try {
      const response = await this.client.post('/mcp/initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {},
        },
        clientInfo: {
          name: 'mcp-web-client',
          version: '1.0.0',
        },
      });
      return response.status === 200;
    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
      return false;
    }
  }

  async listTools(): Promise<any[]> {
    try {
      const response = await this.client.post('/mcp/tools/list', {});
      return response.data.tools || [];
    } catch (error) {
      console.error('Failed to list tools:', error);
      return [];
    }
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    try {
      const response = await this.client.post('/mcp/tools/call', {
        name,
        arguments: arguments_,
      });
      return response.data;
    } catch (error) {
      console.error('Failed to call tool:', error);
      throw error;
    }
  }

  async listResources(): Promise<any[]> {
    try {
      const response = await this.client.post('/mcp/resources/list', {});
      return response.data.resources || [];
    } catch (error) {
      console.error('Failed to list resources:', error);
      return [];
    }
  }

  async readResource(uri: string): Promise<any> {
    try {
      const response = await this.client.post('/mcp/resources/read', {
        uri,
      });
      return response.data;
    } catch (error) {
      console.error('Failed to read resource:', error);
      throw error;
    }
  }
}

// MCP Server Discovery Service
export class MCPDiscoveryService {
  private static readonly DISCOVERY_ENDPOINTS = [
    'https://registry.mcp.dev/api/servers',
    'https://mcp-registry.com/api/servers',
  ];

  static async discoverServers(): Promise<MCPServer[]> {
    const servers: MCPServer[] = [];

    for (const endpoint of this.DISCOVERY_ENDPOINTS) {
      try {
        const response = await axios.get(endpoint, { timeout: 10000 });
        const discoveredServers = response.data.servers || response.data;
        
        for (const server of discoveredServers) {
          servers.push({
            id: server.id || server.name,
            name: server.name,
            url: server.url,
            type: server.type || 'streamable-http',
            status: 'disconnected',
            description: server.description,
            capabilities: server.capabilities,
          });
        }
      } catch (error) {
        console.warn(`Failed to discover servers from ${endpoint}:`, error);
      }
    }

    return servers;
  }
}

// Export default API client instance
export const apiClient = new APIClient();