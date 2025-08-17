import { useMCPServerStore } from '../stores';
import { MCPClientService } from './mcp-client';
import { MCPServer } from '../types';

// Map to store active connections
const connections = new Map<string, MCPClientService>();


export interface MCPToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: Record<string, any> | string; // 更精确的类型定义
  };
}

export interface MCPToolResult {
  toolCallId: string;
  result: any;
  error?: string;
}

export type ToolExecutionResult = {
  toolCallId: string;
  result: any;
  error?: string;
};

// MCP Tool Handler for processing tool calls in chat
export class MCPToolHandler {
  private static instance: MCPToolHandler;

  static getInstance(): MCPToolHandler {
    if (!MCPToolHandler.instance) {
      MCPToolHandler.instance = new MCPToolHandler();
    }
    return MCPToolHandler.instance;
  }

  async getAvailableTools(): Promise<Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: {
        type: 'object';
        properties: Record<string, any>;
        required: string[];
      };
    };
  }>> {
    const { servers } = useMCPServerStore.getState();
    const tools: any[] = [];

    // 只处理启用的服务器（disabled为false或undefined）
    const enabledServers = servers.filter((server: MCPServer) => !server.disabled);
    
    for (const server of enabledServers) {
      if (!server) continue;

      try {
        let connection = connections.get(server.id);
        
        if (!connection) {
          // Create new connection using official SDK
          connection = new MCPClientService(server);
          await connection.connect();
          connections.set(server.id, connection);
        }
        
        const serverTools = await connection.listTools();
        
        // Convert MCP tools to OpenAI function format
        for (const tool of serverTools) {
          tools.push({
            type: 'function',
            function: {
              name: `${server.name}__${tool.name}`,
              description: tool.description || `Tool ${tool.name} from ${server.name}`,
              parameters: tool.inputSchema || {
                type: 'object',
                properties: {},
                required: []
              }
            }
          });
        }
      } catch (error) {
        console.error(`Failed to get tools from server ${server.name}:`, error);
      }
    }

    return tools;
  }

  async executeTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    const { servers } = useMCPServerStore.getState();
    
    // Parse server name and tool name from function name
    const [serverName, ...toolNameParts] = toolCall.function.name.split('__');
    const toolName = toolNameParts.join('__');
    
    const server = servers.find((s: MCPServer) => s.name === serverName);
    if (!server) {
      return {
        toolCallId: toolCall.id,
        result: `Error: Server ${serverName} not found`,
        error: `Server ${serverName} not found`
      };
    }

    try {
      let connection = connections.get(server.id);
      
      if (!connection) {
        connection = new MCPClientService(server);
        await connection.connect();
        connections.set(server.id, connection);
      }

      const result = await connection.callTool(toolName, toolCall.function.arguments || {});
      
      return {
        toolCallId: toolCall.id,
        result: JSON.stringify(result, null, 2)
      };
    } catch (error) {
      console.error(`Error executing tool ${toolName} on ${serverName}:`, error);
      return {
        toolCallId: toolCall.id,
        result: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async executeMultipleTools(toolCalls: MCPToolCall[]): Promise<ToolExecutionResult[]> {
    const results = await Promise.allSettled(
      toolCalls.map(toolCall => this.executeTool(toolCall))
    ) as Array<{ 
      status: string; 
      value?: ToolExecutionResult; 
      reason?: { message: string }; 
    }>;

    return results.map((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      } else {
        return {
          toolCallId: toolCalls[index].id,
          result: null,
          error: result.reason?.message || 'Tool execution failed',
        };
      }
    });
  }

  formatToolResultsForChat(results: ToolExecutionResult[]): string {
    return results.map(result => {
      if (result.error) {
        return `Tool ${result.toolCallId} failed: ${result.error}`;
      }
      
      let content = '';
      if (result.result && 'content' in result.result) {
        if (Array.isArray(result.result.content)) {
          content = result.result.content
            .map((item: any) => {
              if (item.type === 'text') {
                return item.text;
              } else if (item.type === 'image') {
                return `[Image: ${item.data || item.url}]`;
              } else {
                return JSON.stringify(item);
              }
            })
            .join('\n');
        } else {
          content = String(result.result.content);
        }
      } else {
        content = JSON.stringify(result.result, null, 2);
      }
      
      return `Tool Result (${result.toolCallId}):\n${content}`;
    }).join('\n\n');
  }
}

// Export singleton instance
export const mcpToolHandler = MCPToolHandler.getInstance();