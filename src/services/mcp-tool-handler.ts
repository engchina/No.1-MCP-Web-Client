import { useMCPServerStore } from '../stores';

export interface MCPToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface MCPToolResult {
  toolCallId: string;
  result: any;
  error?: string;
}

// MCP Tool Handler for processing tool calls in chat
export class MCPToolHandler {
  private static instance: MCPToolHandler;
  
  static getInstance(): MCPToolHandler {
    if (!MCPToolHandler.instance) {
      MCPToolHandler.instance = new MCPToolHandler();
    }
    return MCPToolHandler.instance;
  }

  async getAvailableTools(): Promise<any[]> {
    const { servers, activeServers, getConnection } = useMCPServerStore.getState();
    const availableTools: any[] = [];

    const activeMCPServers = servers.filter(server => 
      activeServers.includes(server.id) && server.status === 'connected'
    );

    for (const server of activeMCPServers) {
      const connection = getConnection(server.id);
      if (connection) {
        try {
          const tools = await connection.listTools();
          availableTools.push(...tools.map(tool => ({
            ...tool,
            serverId: server.id,
            serverName: server.name,
            // Convert to OpenAI function format
            type: 'function',
            function: {
              name: `${server.name}_${tool.name}`,
              description: tool.description,
              parameters: tool.inputSchema || {
                type: 'object',
                properties: {},
              },
            },
          })));
        } catch (error) {
          console.warn(`Failed to get tools from ${server.name}:`, error);
        }
      }
    }

    return availableTools;
  }

  async executeTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    try {
      const { servers, getConnection } = useMCPServerStore.getState();
      const functionName = toolCall.function.name;
      
      // Parse server name and tool name from function name
      const parts = functionName.split('_');
      if (parts.length < 2) {
        throw new Error(`Invalid tool name format: ${functionName}`);
      }
      
      const serverName = parts[0];
      const toolName = parts.slice(1).join('_');
      
      // Find the server
      const server = servers.find(s => s.name === serverName);
      if (!server) {
        throw new Error(`Server not found: ${serverName}`);
      }
      
      // Get connection
      const connection = getConnection(server.id);
      if (!connection) {
        throw new Error(`No connection to server: ${serverName}`);
      }
      
      // Parse arguments
      let args = {};
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (error) {
        throw new Error(`Invalid arguments format: ${toolCall.function.arguments}`);
      }
      
      // Execute tool
      const result = await connection.callTool(toolName, args);
      
      return {
        toolCallId: toolCall.id,
        result,
      };
    } catch (error) {
      console.error('Tool execution failed:', error);
      return {
        toolCallId: toolCall.id,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async executeMultipleTools(toolCalls: MCPToolCall[]): Promise<MCPToolResult[]> {
    const results = await Promise.allSettled(
      toolCalls.map(toolCall => this.executeTool(toolCall))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
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

  formatToolResultsForChat(results: MCPToolResult[]): string {
    return results.map(result => {
      if (result.error) {
        return `Tool ${result.toolCallId} failed: ${result.error}`;
      }
      
      let content = '';
      if (result.result?.content) {
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