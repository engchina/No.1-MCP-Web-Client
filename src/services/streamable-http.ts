import { MCPServer } from '../types';

// Streamable HTTP connection types
export type StreamableTransport = 'sse' | 'websocket';

export interface StreamableHttpConfig {
  transport: StreamableTransport;
  endpoint: string;
  headers?: Record<string, string>;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPRequest extends MCPMessage {
  method: string;
  params?: any;
}

export interface MCPResponse extends MCPMessage {
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// Base class for streamable HTTP connections
export abstract class StreamableHttpConnection {
  protected server: MCPServer;
  protected config: StreamableHttpConfig;
  protected isConnected: boolean = false;
  protected messageHandlers: Map<string | number, (response: MCPResponse) => void> = new Map();
  protected notificationHandlers: Map<string, (params: any) => void> = new Map();
  protected requestId: number = 1;

  constructor(server: MCPServer, config: StreamableHttpConfig) {
    this.server = server;
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(message: MCPMessage): Promise<void>;

  protected generateRequestId(): number {
    return this.requestId++;
  }

  protected handleMessage(message: MCPMessage): void {
    if (message.id && this.messageHandlers.has(message.id)) {
      const handler = this.messageHandlers.get(message.id)!;
      this.messageHandlers.delete(message.id);
      handler(message as MCPResponse);
    } else if (message.method && this.notificationHandlers.has(message.method)) {
      const handler = this.notificationHandlers.get(message.method)!;
      handler(message.params);
    }
  }

  async request(method: string, params?: any): Promise<any> {
    const id = this.generateRequestId();
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.messageHandlers.set(id, (response: MCPResponse) => {
        if (response.error) {
          reject(new Error(`${response.error.message} (${response.error.code})`));
        } else {
          resolve(response.result);
        }
      });

      this.send(request).catch(reject);
    });
  }

  onNotification(method: string, handler: (params: any) => void): void {
    this.notificationHandlers.set(method, handler);
  }

  get connected(): boolean {
    return this.isConnected;
  }
}

// Server-Sent Events implementation
export class SSEConnection extends StreamableHttpConnection {
  private eventSource?: EventSource;
  private sendEndpoint: string;

  constructor(server: MCPServer, config: StreamableHttpConfig) {
    super(server, config);
    this.sendEndpoint = config.endpoint.replace('/events', '/messages');
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.eventSource = new EventSource(this.config.endpoint);

        this.eventSource.onopen = () => {
          this.isConnected = true;
          resolve();
        };

        this.eventSource.onmessage = (event) => {
          try {
            const message: MCPMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse SSE message:', error);
          }
        };

        this.eventSource.onerror = (error) => {
          console.error('SSE connection error:', error);
          this.isConnected = false;
          if (this.eventSource?.readyState === EventSource.CLOSED) {
            reject(new Error('SSE connection failed'));
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    this.isConnected = false;
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Connection not established');
    }

    const response = await fetch(this.sendEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }
  }
}

// WebSocket implementation
export class WebSocketConnection extends StreamableHttpConnection {
  private websocket?: WebSocket;
  private reconnectAttempts: number = 0;

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.config.endpoint.replace(/^https?/, 'ws');
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.websocket.onmessage = (event) => {
          try {
            const message: MCPMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.websocket.onclose = (event) => {
          this.isConnected = false;
          if (!event.wasClean && this.shouldReconnect()) {
            this.attemptReconnect();
          }
        };

        this.websocket.onerror = (error) => {
          console.error('WebSocket connection error:', error);
          reject(new Error('WebSocket connection failed'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.websocket) {
      this.websocket.close(1000, 'Normal closure');
      this.websocket = undefined;
    }
    this.isConnected = false;
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.isConnected || !this.websocket) {
      throw new Error('Connection not established');
    }

    if (this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket is not ready');
    }
  }

  private shouldReconnect(): boolean {
    const maxAttempts = this.config.reconnectAttempts || 5;
    return this.reconnectAttempts < maxAttempts;
  }

  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;
    const delay = (this.config.reconnectDelay || 1000) * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.config.reconnectAttempts || 5}) in ${delay}ms`);
    
    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }
}

// Factory function to create appropriate connection
export function createStreamableConnection(
  server: MCPServer,
  transport: StreamableTransport = 'sse'
): StreamableHttpConnection {
  const config: StreamableHttpConfig = {
    transport,
    endpoint: server.url,
    headers: server.config?.headers,
    reconnectAttempts: 5,
    reconnectDelay: 1000,
  };

  switch (transport) {
    case 'sse':
      return new SSEConnection(server, config);
    case 'websocket':
      return new WebSocketConnection(server, config);
    default:
      throw new Error(`Unsupported transport: ${transport}`);
  }
}

// Enhanced MCP Server Service with streamable-http support
export class StreamableMCPServerService {
  private connection: StreamableHttpConnection;
  private server: MCPServer;

  constructor(server: MCPServer, transport: StreamableTransport = 'sse') {
    this.server = server;
    this.connection = createStreamableConnection(server, transport);
  }

  async connect(): Promise<boolean> {
    try {
      await this.connection.connect();
      
      // Initialize MCP protocol
      await this.connection.request('initialize', {
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

      return true;
    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();
  }

  async listTools(): Promise<any[]> {
    try {
      const result = await this.connection.request('tools/list');
      return result.tools || [];
    } catch (error) {
      console.error('Failed to list tools:', error);
      return [];
    }
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    try {
      return await this.connection.request('tools/call', {
        name,
        arguments: arguments_,
      });
    } catch (error) {
      console.error('Failed to call tool:', error);
      throw error;
    }
  }

  async listResources(): Promise<any[]> {
    try {
      const result = await this.connection.request('resources/list');
      return result.resources || [];
    } catch (error) {
      console.error('Failed to list resources:', error);
      return [];
    }
  }

  async readResource(uri: string): Promise<any> {
    try {
      return await this.connection.request('resources/read', { uri });
    } catch (error) {
      console.error('Failed to read resource:', error);
      throw error;
    }
  }

  onNotification(method: string, handler: (params: any) => void): void {
    this.connection.onNotification(method, handler);
  }

  get connected(): boolean {
    return this.connection.connected;
  }

  get serverInfo(): MCPServer {
    return this.server;
  }
}