// @ts-nocheck
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MCPServer, ChatSession, ChatMessage, LLMProvider, UIState, AppSettings, Notification } from '../types';
import { generateId, fileService } from '../utils';
import { StreamableMCPServerService, StreamableTransport } from '../services/streamable-http';

// MCP Servers Store
interface MCPServerStore {
  servers: MCPServer[];
  activeServers: string[];
  connections: Map<string, StreamableMCPServerService>;
  addServer: (server: Omit<MCPServer, 'id' | 'status'>) => void;
  updateServer: (id: string, updates: Partial<MCPServer>) => void;
  removeServer: (id: string) => void;
  toggleServerActive: (id: string) => void;
  setServerStatus: (id: string, status: MCPServer['status']) => void;
  connectServer: (id: string, transport?: StreamableTransport) => Promise<boolean>;
  disconnectServer: (id: string) => Promise<void>;
  getConnection: (id: string) => StreamableMCPServerService | undefined;
}

export const useMCPServerStore = create<MCPServerStore>()(persist(
  (set, get) => ({
    servers: [],
    activeServers: [],
    connections: new Map(),
    
    addServer: (server) => {
      const newServer: MCPServer = {
        ...server,
        id: generateId(),
        status: 'disconnected',
      };
      set((state) => {
        const servers = [...state.servers, newServer];
        // Persist to JSON file
        const json = {
          mcpServers: servers.reduce((acc, s) => {
            acc[s.name] = { type: s.type, url: s.url };
            return acc;
          }, {} as Record<string, { type: 'streamable-http' | 'sse'; url: string }>)
        };
        fileService.saveMCPServers(json);
        return { servers };
      });
    },
    
    updateServer: (id, updates) => {
      set((state) => {
        const servers = state.servers.map((server) =>
          server.id === id ? { ...server, ...updates } : server
        );
        const json = {
          mcpServers: servers.reduce((acc, s) => {
            acc[s.name] = { type: s.type, url: s.url };
            return acc;
          }, {} as Record<string, { type: 'streamable-http' | 'sse'; url: string }>)
        };
        fileService.saveMCPServers(json);
        return { servers };
      });
    },
    
    removeServer: (id) => {
      set((state) => {
        const servers = state.servers.filter((server) => server.id !== id);
        const json = {
          mcpServers: servers.reduce((acc, s) => {
            acc[s.name] = { type: s.type, url: s.url };
            return acc;
          }, {} as Record<string, { type: 'streamable-http' | 'sse'; url: string }>)
        };
        fileService.saveMCPServers(json);
        return {
          servers,
          activeServers: state.activeServers.filter((serverId) => serverId !== id),
        };
      });
    },
    
    toggleServerActive: (id) => {
      set((state) => {
        const isActive = state.activeServers.includes(id);
        return {
          activeServers: isActive
            ? state.activeServers.filter((serverId) => serverId !== id)
            : [...state.activeServers, id],
        };
      });
    },
    
    setServerStatus: (id, status) => {
      set((state) => ({
        servers: state.servers.map((server) =>
          server.id === id ? { ...server, status } : server
        ),
      }));
    },

    connectServer: async (id, transport = 'sse') => {
      const { servers, connections, setServerStatus } = get();
      const server = servers.find(s => s.id === id);
      if (!server) return false;

      try {
        // Create status callback function
        const onStatusChange = (status: MCPServer['status']) => {
          setServerStatus(id, status);
        };

        // Use the custom streamable HTTP service with status callback
        const service = new StreamableMCPServerService(server, onStatusChange);
        const connected = await service.connect();
        
        if (connected) {
          connections.set(id, service);
          set((state) => ({
            connections: new Map(connections),
          }));
          return true;
        } else {
          return false;
        }
      } catch (error) {
        console.error('Failed to connect server:', error);
        setServerStatus(id, 'error');
        return false;
      }
    },

    disconnectServer: async (id) => {
      const { connections } = get();
      
      const connection = connections.get(id);
      if (connection) {
        await connection.disconnect();
        connections.delete(id);
      }
      
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id ? { ...s, status: 'disconnected' } : s
        ),
        connections: new Map(connections),
      }));
    },

    getConnection: (id) => {
      return get().connections.get(id);
    }
  }),
  {
    name: 'mcp-servers',
    // Disable default localStorage persist, we'll manage persistence manually via fileService
    skipHydration: true,
    partialize: (state) => ({ servers: state.servers, activeServers: state.activeServers }),
    onRehydrateStorage: () => (state) => {
      // Load from JSON file on hydration
      fileService.loadMCPServers().then((config) => {
        if (config && state) {
          const servers: MCPServer[] = Object.entries(config.mcpServers || {}).map(([name, conf]) => ({
            id: generateId(),
            name,
            url: (conf as any).url || (conf as any).serverUrl || '',
            type: (conf as any).type === 'sse' ? 'sse' : 'streamable-http',
            status: 'disconnected',
          }));
          state.servers = servers;
        }
      }).catch((e) => console.warn('Failed to load MCP servers config:', e));
    }
  }
));

// Chat Store
interface ChatStore {
  sessions: ChatSession[];
  currentSessionId: string | null;
  isStreaming: boolean;
  createSession: (title?: string) => string;
  deleteSession: (id: string) => void;
  setCurrentSession: (id: string) => void;
  addMessage: (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => ChatMessage;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  removeMessagesFromIndex: (sessionId: string, fromIndex: number) => void;
  clearSession: (sessionId: string) => void;
  setStreaming: (streaming: boolean) => void;
  getCurrentSession: () => ChatSession | null;
}

export const useChatStore = create<ChatStore>()(persist(
  (set, get) => ({
    sessions: [],
    currentSessionId: null,
    isStreaming: false,
    
    createSession: (title = '新对话') => {
      const newSession: ChatSession = {
        id: generateId(),
        title,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        model: 'gpt-3.5-turbo',
        mcpServers: [],
      };
      
      set((state) => ({
        sessions: [newSession, ...state.sessions],
        currentSessionId: newSession.id,
      }));
      
      return newSession.id;
    },
    
    deleteSession: (id) => {
      set((state) => {
        const newSessions = state.sessions.filter((session) => session.id !== id);
        const newCurrentSessionId = state.currentSessionId === id
          ? (newSessions.length > 0 ? newSessions[0].id : null)
          : state.currentSessionId;
        
        return {
          sessions: newSessions,
          currentSessionId: newCurrentSessionId,
        };
      });
    },
    
    setCurrentSession: (id) => {
      set({ currentSessionId: id });
    },
    
    addMessage: (sessionId, message) => {
      const newMessage: ChatMessage = {
        ...message,
        id: (message as any).id ?? generateId(),
        timestamp: new Date(),
      };
      
      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                messages: [...session.messages, newMessage],
                updatedAt: new Date(),
                title: session.messages.length === 0 && message.role === 'user' 
                  ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
                  : session.title,
              }
            : session
        ),
      }));

      return newMessage;
    },
    
    updateMessage: (sessionId, messageId, updates) => {
      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                messages: session.messages.map((message) =>
                  message.id === messageId ? { ...message, ...updates } : message
                ),
                updatedAt: new Date(),
              }
            : session
        ),
      }));
    },
    
    removeMessagesFromIndex: (sessionId, fromIndex) => {
      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                messages: session.messages.slice(0, fromIndex),
                updatedAt: new Date(),
              }
            : session
        ),
      }));
    },
    
    clearSession: (sessionId) => {
      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { ...session, messages: [], updatedAt: new Date() }
            : session
        ),
      }));
    },
    
    setStreaming: (streaming) => {
      set({ isStreaming: streaming });
    },
    
    getCurrentSession: () => {
      const state = get();
      return state.sessions.find((session) => session.id === state.currentSessionId) || null;
    },
  }),
  {
    name: 'chat-sessions',
  }
));

// Settings Store
interface SettingsStore {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  addLLMProvider: (provider: Omit<LLMProvider, 'id'>) => void;
  updateLLMProvider: (id: string, updates: Partial<LLMProvider>) => void;
  removeLLMProvider: (id: string) => void;
}

const defaultSettings: AppSettings = {
  maxTokens: 4096,
  temperature: 0.7,
  streamResponse: true,
  autoSave: true,
  theme: 'system',
  providerType: 'openai',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiApiKey: '',
  openaiModelName: 'gpt-3.5-turbo',
  ocigenaiModelName: 'meta.llama-3.1-405b-instruct',
  llmProviders: [],
};

export const useSettingsStore = create<SettingsStore>()(persist(
  (set) => ({
    settings: defaultSettings,
    
    updateSettings: (updates) => {
      set((state) => ({
        settings: { ...state.settings, ...updates },
      }));
    },
    
    addLLMProvider: (provider) => {
      const newProvider: LLMProvider = {
        ...provider,
        id: generateId(),
      };
      
      set((state) => ({
        settings: {
          ...state.settings,
          llmProviders: [...state.settings.llmProviders, newProvider],
        },
      }));
    },
    
    updateLLMProvider: (id, updates) => {
      set((state) => ({
        settings: {
          ...state.settings,
          llmProviders: state.settings.llmProviders.map((provider) =>
            provider.id === id ? { ...provider, ...updates } : provider
          ),
        },
      }));
    },
    
    removeLLMProvider: (id) => {
      set((state) => ({
        settings: {
          ...state.settings,
          llmProviders: state.settings.llmProviders.filter((provider) => provider.id !== id),
        },
      }));
    },
  }),
  {
    name: 'app-settings',
  }
));

// UI Store
interface UIStore extends UIState {
  setTheme: (theme: UIState['theme']) => void;
  toggleSidebar: () => void;
  setActiveTab: (tab: UIState['activeTab']) => void;
  setLoading: (loading: boolean) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const useUIStore = create<UIStore>()(persist(
  (set) => ({
    theme: 'system',
    sidebarCollapsed: false,
    activeTab: 'chat',
    isLoading: false,
    notifications: [],
    
    setTheme: (theme) => {
      set({ theme });
    },
    
    toggleSidebar: () => {
      set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
    },
    
    setActiveTab: (activeTab) => {
      set({ activeTab });
    },
    
    setLoading: (isLoading) => {
      set({ isLoading });
    },
    
    addNotification: (notification) => {
      const newNotification: Notification = {
        ...notification,
        id: generateId(),
        timestamp: new Date(),
      };
      
      set((state) => ({
        notifications: [newNotification, ...state.notifications],
      }));
      
      // Auto remove notification after duration
      if (notification.duration !== 0) {
        setTimeout(() => {
          set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== newNotification.id),
          }));
        }, notification.duration || 5000);
      }
    },
    
    removeNotification: (id) => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    },
    
    clearNotifications: () => {
      set({ notifications: [] });
    },
  }),
  {
    name: 'ui-state',
    partialize: (state) => ({
      theme: state.theme,
      sidebarCollapsed: state.sidebarCollapsed,
      activeTab: state.activeTab,
    }),
  }
));