import { MCPServer } from '../types';
import { StreamableMCPServerService } from './streamable-http';

export interface MCPClientConfig {
  name: string;
  version: string;
  [key: string]: unknown;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: any;
}

export interface MCPToolResult {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: any;
  }>;
  error?: boolean;
}

export class MCPClientService {
  private streamableService: StreamableMCPServerService;
  private server: MCPServer;
  private isConnected: boolean = false;
  private tools: MCPTool[] = [];

  constructor(server: MCPServer) {
    this.server = server;
    this.streamableService = new StreamableMCPServerService(server);
  }

  async connect(): Promise<boolean> {
    try {
      const result = await this.streamableService.connect();
      this.isConnected = result;

      // Load available tools
      if (this.isConnected) {
        await this.loadTools();
      }

      return this.isConnected;
    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.streamableService.disconnect();
      this.isConnected = false;
      this.tools = [];
    } catch (error) {
      console.error('Failed to disconnect from MCP server:', error);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return await this.connect();
      }
      
      // Test by listing tools
      await this.listTools();
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  private async loadTools(): Promise<void> {
    try {
      const result = await this.streamableService.listTools();
      this.tools = result.map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    } catch (error) {
      console.error('Failed to load tools:', error);
      this.tools = [];
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      await this.loadTools();
      return this.tools;
    } catch (error) {
      console.error('Failed to list tools:', error);
      return [];
    }
  }

  async callTool(name: string, arguments_: any): Promise<MCPToolResult> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const result = await this.streamableService.callTool(name, arguments_);

      return {
        content: Array.isArray(result.content) ? result.content : [],
        error: Boolean(result.isError),
      };
    } catch (error) {
      console.error('Failed to call tool:', error);
      return {
        content: [{
          type: 'text',
          text: `Error calling tool ${name}: ${error instanceof Error ? error.message : String(error)}`,
        }],
        error: true,
      };
    }
  }

  async listResources(): Promise<any[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const result = await this.streamableService.listResources();
      return result || [];
    } catch (error) {
      console.error('Failed to list resources:', error);
      return [];
    }
  }

  async readResource(uri: string): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      return await this.streamableService.readResource(uri);
    } catch (error) {
      console.error('Failed to read resource:', error);
      throw error;
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get serverInfo(): MCPServer {
    return this.server;
  }

  get availableTools(): MCPTool[] {
    return this.tools;
  }
}