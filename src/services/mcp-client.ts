import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCPServer } from '../types';

/**
 * Official MCP Client Service using StreamableHTTPClientTransport
 * Replaces the custom streamable-http.ts implementation
 */
export class MCPClientService {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private server: MCPServer;
  private onStatusChange?: (status: MCPServer['status']) => void;
  private isConnected: boolean = false;

  constructor(server: MCPServer, onStatusChange?: (status: MCPServer['status']) => void) {
    this.server = server;
    this.onStatusChange = onStatusChange;
    
    // Create client with proper configuration
    this.client = new Client(
      {
        name: 'mcp-web-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          roots: { listChanged: true },
          sampling: {},
        },
      }
    );

    // Create StreamableHTTPClientTransport
    const endpoint = new URL(server.config?.endpoint || '/mcp', window.location.origin);
    this.transport = new StreamableHTTPClientTransport(endpoint);
  }

  async connect(): Promise<boolean> {
    try {
      // Notify connecting status
      this.onStatusChange?.('connecting');
      
      // Connect using official SDK
      await this.client.connect(this.transport);
      
      this.isConnected = true;
      
      // Notify connected status
      this.onStatusChange?.('connected');
      return true;
    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
      
      // Enhanced error handling
      if (error instanceof Error) {
        if (error.message.includes('CORS') || error.message.includes('Access-Control-Allow-Origin')) {
          console.error('CORS错误：无法连接到MCP服务器。请确保服务器已正确配置CORS策略。');
        } else if (error.message.includes('Failed to fetch')) {
          console.error('网络错误：无法连接到MCP服务器。请检查服务器地址是否正确且服务器正在运行。');
        }
      }
      
      // Notify error status
      this.onStatusChange?.('error');
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.close();
      this.isConnected = false;
    } catch (error) {
      console.error('Failed to disconnect from MCP server:', error);
    }
  }

  async listTools(): Promise<any[]> {
    try {
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }
      
      const result = await this.client.listTools();
      return result.tools || [];
    } catch (error) {
      console.error('Failed to list tools:', error);
      return [];
    }
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    try {
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }
      
      return await this.client.callTool({
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
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }
      
      const result = await this.client.listResources();
      return result.resources || [];
    } catch (error) {
      console.error('Failed to list resources:', error);
      return [];
    }
  }

  async readResource(uri: string): Promise<any> {
    try {
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }
      
      return await this.client.readResource({ uri });
    } catch (error) {
      console.error('Failed to read resource:', error);
      throw error;
    }
  }

  async listPrompts(): Promise<any[]> {
    try {
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }
      
      const result = await this.client.listPrompts();
      return result.prompts || [];
    } catch (error) {
      console.error('Failed to list prompts:', error);
      return [];
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get serverInfo(): MCPServer {
    return this.server;
  }
}

/**
 * Test MCP connection using official SDK
 */
export async function testMCPConnectionWithSDK(endpoint: string = '/mcp'): Promise<{ sessionId: string | null; tools: any[]; resources: any[]; prompts: any[] }> {
  console.log('Testing MCP connection with official SDK...');
  
  const client = new Client(
    {
      name: 'mcp-web-client-test',
      version: '1.0.0',
    },
    {
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
    }
  );

  const endpointUrl = new URL(endpoint, window.location.origin);
  const transport = new StreamableHTTPClientTransport(endpointUrl);

  try {
    // Connect to the server
    await client.connect(transport);
    console.log('Connected successfully!');

    // List tools
    const toolsResult = await client.listTools();
    console.log('Tools:', toolsResult.tools);

    // List resources
    const resourcesResult = await client.listResources();
    console.log('Resources:', resourcesResult.resources);

    // List prompts
    const promptsResult = await client.listPrompts();
    console.log('Prompts:', promptsResult.prompts);

    // Close connection
    await client.close();

    return {
      sessionId: null, // SDK handles session internally
      tools: toolsResult.tools || [],
      resources: resourcesResult.resources || [],
      prompts: promptsResult.prompts || []
    };
  } catch (error) {
    console.error('MCP connection test failed:', error);
    
    // Enhanced error handling
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