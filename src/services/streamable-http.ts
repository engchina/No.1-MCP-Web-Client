import { MCPServer } from '../types';

// Streamable HTTP connection types
export type StreamableTransport = 'streamable-http';

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
  protected requestId: number = 1;
  protected sessionId?: string;
  protected messageHandlers: Map<string | number, (response: MCPResponse) => void> = new Map();
  protected notificationHandlers: Map<string, (params: any) => void> = new Map();

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

// Streamable HTTP implementation for MCP
export class StreamableHTTPConnection extends StreamableHttpConnection {
  private abortController?: AbortController;

  constructor(server: MCPServer, config: StreamableHttpConfig) {
    super(server, config);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.abortController = new AbortController();
      fetch(this.config.endpoint, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: {
              name: 'mcp-web-client',
              version: '1.0.0'
            }
          },
          id: 1
        }),
        signal: this.abortController.signal,
      })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        this.sessionId = response.headers.get('Mcp-Session-Id') || undefined;
        if (!this.sessionId) {
          throw new Error('Session ID not found in response headers');
        }

        const initialMessage: MCPMessage = await response.json();
        this.handleMessage(initialMessage);

        this.isConnected = true;
        resolve();
      })
      .catch(error => {
        if ((error as any)?.name !== 'AbortError') {
          reject(error);
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
    this.isConnected = false;
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Connection not established');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...this.config.headers,
    };

    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      mode: 'cors',
      headers,
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }

    const responseMessage: MCPMessage = await response.json();
    this.handleMessage(responseMessage);
  }
}

// Factory function to create appropriate connection
export function createStreamableConnection(
  server: MCPServer
): StreamableHttpConnection {
  const config: StreamableHttpConfig = {
    transport: 'streamable-http',
    endpoint: '/mcp',
    headers: server.config?.headers,
  };

  return new StreamableHTTPConnection(server, config);
}

// MCP Connection Test Function following 2025-06-18 specification
export async function testMCPConnection(): Promise<{ sessionId: string | null }> {
  console.log('Starting MCP connection test following 2025-06-18 specification...');
  
  let sessionId: string | undefined;
  
  try {
    // Step 1: POST /mcp - Initialize request
    console.log('Step 1: Sending initialize request (POST /mcp)');
    // Ensure correct endpoint without double /mcp
    const endpoint = '/mcp';
    const initResponse = await fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream, */*'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {
            roots: { listChanged: true },
            sampling: {}
          },
          clientInfo: {
            name: 'mcp-web-client',
            version: '1.0.0'
          }
        }
      })
    });
    
    if (!initResponse.ok) {
      throw new Error(`Initialize failed: ${initResponse.status} ${initResponse.statusText}`);
    }
    
    // Extract session ID from response headers
    sessionId = initResponse.headers.get('Mcp-Session-Id') || undefined;
    console.log('Initialize response received, session ID:', sessionId);
    
    // The initialize response body may be empty, so we don't parse it as JSON.
    // We just need to check if the response was successful.
    
    // Step 2: GET /mcp - Establish SSE connection
    console.log('Step 2: Establishing SSE connection (GET /mcp)');
    const sseHeaders: Record<string, string> = {};
    
    if (sessionId) {
      sseHeaders['Mcp-Session-Id'] = sessionId;
    }
    
    const sseResponse = await fetch(endpoint, {
      method: 'GET',
      mode: 'cors',
      headers: {
        ...sseHeaders,
        'Accept': 'application/json, text/event-stream, */*',
      }
    });
    
    if (!sseResponse.ok) {
      throw new Error(`SSE connection failed: ${sseResponse.status} ${sseResponse.statusText}`);
    }
    
    console.log('SSE connection established');
    
    // Wait a bit for the connection to be fully established before sending requests
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Helper function for POST requests with session ID
    const sendRequest = async (method: string, params?: any, id: number = Date.now()) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream, */*'
      };
      
      if (sessionId) {
        headers['Mcp-Session-Id'] = sessionId;
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params
        })
      });
      
      if (!response.ok) {
        throw new Error(`${method} failed: ${response.status} ${response.statusText}`);
      }
      
      // In a streamable HTTP connection, the response to a POST request
      // is empty. The actual result will be sent as a notification
      // over the SSE stream.
      return;
    };
    
    // Step 3: POST /mcp - ListToolsRequest
    console.log('Step 3: Sending ListToolsRequest (POST /mcp)');
    const toolsResult = await sendRequest('tools/list', {}, 2);
    console.log('Tools list result:', toolsResult);
    
    // Step 4: POST /mcp - ListResourcesRequest
    console.log('Step 4: Sending ListResourcesRequest (POST /mcp)');
    const resourcesResult = await sendRequest('resources/list', {}, 3);
    console.log('Resources list result:', resourcesResult);
    
    // Step 5: POST /mcp - ListResourceTemplatesRequest
    console.log('Step 5: Sending ListResourceTemplatesRequest (POST /mcp)');
    const templatesResult = await sendRequest('resources/templates/list', {}, 4);
    console.log('Resource templates list result:', templatesResult);
    
    console.log('MCP connection test completed successfully!');
    return { sessionId: sessionId || null };
    
  } catch (error) {
    console.error('MCP connection test failed:', error);
    
    // Enhanced CORS error handling for test function
    if (error instanceof Error) {
      if (error.message.includes('CORS') || error.message.includes('Access-Control-Allow-Origin')) {
        throw new Error(`CORS错误：无法连接到MCP服务器。请确保服务器已正确配置CORS策略，允许来自当前域的请求。`);
      } else if (error.message.includes('Failed to fetch')) {
        throw new Error(`网络错误：无法连接到MCP服务器。请检查服务器地址是否正确且服务器正在运行。`);
      }
    }
    
    throw error;
  }
}

// Enhanced MCP Server Service with streamable-http support
export class StreamableMCPServerService {
  private connection: StreamableHttpConnection;
  private server: MCPServer;

  constructor(server: MCPServer) {
    this.server = server;
    this.connection = createStreamableConnection(server);
  }

  async connect(): Promise<boolean> {
    try {
      // The connection.connect() method now handles the initialize request
      await this.connection.connect();
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