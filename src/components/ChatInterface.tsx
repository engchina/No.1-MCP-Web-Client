import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Wrench } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { useChatStore, useSettingsStore, useMCPServerStore, useUIStore } from '../stores';
import { LLMService, OracleAIService } from '../services/api';
import { mcpToolHandler, MCPToolCall } from '../services/mcp-tool-handler';
import { formatDate, formatRelativeTime, parseErrorMessage } from '../utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const ChatInterface: React.FC = () => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { 
    getCurrentSession, 
    addMessage, 
    updateMessage, 
    createSession, 
    currentSessionId 
  } = useChatStore();
  const { settings } = useSettingsStore();
  const { servers, activeServers, getConnection } = useMCPServerStore();
  
  const currentSession = getCurrentSession();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  // Focus input when session changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [currentSessionId]);

  // Create initial session if none exists
  useEffect(() => {
    if (!currentSession && !currentSessionId) {
      createSession();
    }
  }, [currentSession, currentSessionId, createSession]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || !currentSession) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      // Add user message
      addMessage(currentSession.id, {
        role: 'user',
        content: userMessage,
      });

      // Get available tools from MCP servers
      const availableTools = await mcpToolHandler.getAvailableTools();

      // Validate provider configuration
      if (settings.providerType === 'openai' && (!settings.openaiApiKey || !settings.openaiModelName)) {
        throw new Error('请在设置中配置OpenAI API密钥和模型名称');
      }
      if (settings.providerType === 'ocigenai' && !settings.ocigenaiModelName) {
        throw new Error('请在设置中配置OCI GenAI模型名称');
      }

      // Create assistant message placeholder
      const assistantMessageId = Date.now().toString();
      addMessage(currentSession.id, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
      });

      // Prepare messages for API
      const messages = [
        ...currentSession.messages,
        { role: 'user', content: userMessage }
      ].slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      if (settings.providerType === 'openai') {
        const providerConfig = {
          type: 'openai' as const,
          name: 'OpenAI',
          baseUrl: settings.openaiBaseUrl || 'https://api.openai.com/v1',
          apiKey: settings.openaiApiKey!,
          models: [{ id: settings.openaiModelName!, name: settings.openaiModelName! }]
        };
        const llmService = new LLMService(providerConfig);
        
        const requestOptions = {
          max_tokens: settings.maxTokens,
          temperature: settings.temperature,
          tools: availableTools.length > 0 ? availableTools.map(tool => ({
            type: 'function',
            function: tool.function,
          })) : undefined,
        };

        if (settings.streamResponse) {
          // Streaming response with tool support
          const stream = llmService.chatStream(messages, settings.openaiModelName!, requestOptions);

          let fullContent = '';
          let toolCalls: MCPToolCall[] = [];
          
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta;
            
            if (delta?.content) {
              fullContent += delta.content;
              updateMessage(currentSession.id, assistantMessageId, { content: fullContent });
            }
            
            if (delta?.tool_calls) {
              // Handle tool calls in streaming
              for (const toolCall of delta.tool_calls) {
                if (toolCall.function?.name) {
                  toolCalls.push(toolCall as MCPToolCall);
                }
              }
            }
          }
          
          // Execute tool calls if any
          if (toolCalls.length > 0) {
            await handleToolCalls(toolCalls, currentSession.id);
          }
        } else {
          // Non-streaming response
          const response = await llmService.chat(messages, settings.openaiModelName!, requestOptions);
          const choice = response.choices?.[0];
          
          if (choice?.message?.tool_calls) {
            // Handle tool calls
            const toolCalls = choice.message.tool_calls as MCPToolCall[];
            await handleToolCalls(toolCalls, currentSession.id);
          } else {
            const content = choice?.message?.content || '抱歉，我无法生成回复。';
            updateMessage(currentSession.id, assistantMessageId, { content });
          }
        }
      } else if (settings.providerType === 'ocigenai') {
        const oracleService = new OracleAIService('');
        const response = await oracleService.chat(messages, {
          maxTokens: settings.maxTokens,
          temperature: settings.temperature,
          model: settings.ocigenaiModelName!,
        });

        const assistantContent = response.chatResponse?.choices?.[0]?.message?.content || '抱歉，我无法生成回复。';
        updateMessage(currentSession.id, assistantMessageId, { content: assistantContent });
      }
    } catch (error) {
      console.error('Chat error:', error);
      addMessage(currentSession.id, {
        role: 'assistant',
        content: `错误: ${parseErrorMessage(error)}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToolCalls = async (toolCalls: MCPToolCall[], sessionId: string) => {
    // Add tool call message
    addMessage(sessionId, {
      role: 'assistant',
      content: `🔧 正在执行 ${toolCalls.length} 个工具调用...`,
      metadata: { toolCalls },
    });

    try {
      // Execute tools
      const results = await mcpToolHandler.executeMultipleTools(toolCalls);
      
      // Format and add tool results
      const resultContent = mcpToolHandler.formatToolResultsForChat(results);
      addMessage(sessionId, {
        role: 'tool',
        content: resultContent,
        metadata: { toolResults: results },
      });

      // Get follow-up response from LLM with tool results
      if (settings.providerType === 'openai' && settings.openaiApiKey && settings.openaiModelName) {
        const providerConfig = {
          type: 'openai' as const,
          name: 'OpenAI',
          baseUrl: settings.openaiBaseUrl || 'https://api.openai.com/v1',
          apiKey: settings.openaiApiKey,
          models: [{ id: settings.openaiModelName, name: settings.openaiModelName }]
        };
        const llmService = new LLMService(providerConfig);
        const currentSession = getCurrentSession();
        
        if (currentSession) {
          const messages = currentSession.messages.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.content
          }));
          const response = await llmService.chat(messages, settings.openaiModelName, {
            max_tokens: settings.maxTokens,
            temperature: settings.temperature,
          });

          const content = response.choices?.[0]?.message?.content || '抱歉，我无法生成回复。';
          addMessage(sessionId, {
            role: 'assistant',
            content,
          });
        }
      }
    } catch (error) {
      console.error('Tool execution error:', error);
      addMessage(sessionId, {
        role: 'assistant',
        content: `❌ 工具执行失败: ${error instanceof Error ? error.message : '未知错误'}`,
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!currentSession) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">欢迎使用 MCP Web Client</h3>
          <p className="text-muted-foreground">开始新的对话</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {currentSession.messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">开始对话</h3>
              <p className="text-muted-foreground">输入消息开始与AI助手对话</p>
            </div>
          </div>
        ) : (
          currentSession.messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <Card className={`max-w-[80%] ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                <div className="p-4">
                  <div className="flex items-start space-x-2">
                      <div className="flex-shrink-0">
                        {message.role === 'user' ? (
                          <User className="h-5 w-5" />
                        ) : message.role === 'tool' ? (
                          <Wrench className="h-5 w-5" />
                        ) : (
                          <Bot className="h-5 w-5" />
                        )}
                      </div>
                    <div className="flex-1 min-w-0">
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <div className={message.role === 'tool' ? 'bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg font-mono text-sm' : ''}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ node, inline, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline && match ? (
                                  <SyntaxHighlighter
                                    style={oneDark}
                                    language={match[1]}
                                    PreTag="div"
                                    {...props}
                                  >
                                    {String(children).replace(/\n$/, '')}
                                  </SyntaxHighlighter>
                                ) : (
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                );
                              },
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                        {message.metadata?.toolCalls && (
                          <div className="mt-2 text-xs text-gray-500">
                            工具调用: {message.metadata.toolCalls.map((call: any) => call.function.name).join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 text-xs opacity-70">
                        {formatRelativeTime(new Date(message.timestamp))}
                        {message.metadata?.model && (
                          <span className="ml-2">• {message.metadata.model}</span>
                        )}
                        {message.metadata?.tokens && (
                          <span className="ml-2">• {message.metadata.tokens} tokens</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="flex justify-start">
            <Card className="bg-muted">
              <div className="p-4">
                <div className="flex items-center space-x-2">
                  <Bot className="h-5 w-5" />
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">AI正在思考...</span>
                </div>
              </div>
            </Card>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-border p-4">
        <div className="flex space-x-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入消息..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        
        {/* Active MCP Servers Indicator */}
        {activeServers.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            活跃的MCP服务器: {activeServers.map(serverId => {
              const server = servers.find(s => s.id === serverId);
              return server?.name;
            }).filter(Boolean).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatInterface;