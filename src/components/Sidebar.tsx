import React from 'react';
import { MessageSquare, Server, Settings, Menu, Plus } from 'lucide-react';
import { Button } from './ui/Button';
import { useUIStore, useChatStore } from '../stores';
import { cn } from '../utils';

const Sidebar: React.FC = () => {
  const { activeTab, sidebarCollapsed, setActiveTab, toggleSidebar } = useUIStore();
  const { sessions, currentSessionId, createSession, setCurrentSession } = useChatStore();

  const menuItems = [
    {
      id: 'chat' as const,
      label: '聊天',
      icon: MessageSquare,
    },
    {
      id: 'servers' as const,
      label: 'MCP 服务器',
      icon: Server,
    },
    {
      id: 'settings' as const,
      label: '设置',
      icon: Settings,
    },
  ];

  const handleCreateNewChat = () => {
    createSession();
    setActiveTab('chat');
  };

  return (
    <div className="flex h-full flex-col bg-background border-r border-border">
      {/* Header */}
      <div className="flex h-14 items-center justify-between px-3 border-b border-border">
        <div className={cn('flex items-center space-x-2', sidebarCollapsed && 'justify-center')}>
          {!sidebarCollapsed && (
            <h2 className="text-lg font-semibold text-foreground">MCP Client</h2>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-8 w-8"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              variant={activeTab === item.id ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-start',
                sidebarCollapsed && 'justify-center px-2'
              )}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon className="h-4 w-4" />
              {!sidebarCollapsed && (
                <span className="ml-2">{item.label}</span>
              )}
            </Button>
          );
        })}
      </nav>

      {/* Chat Sessions (only show when chat tab is active) */}
      {activeTab === 'chat' && !sidebarCollapsed && (
        <div className="flex-1 border-t border-border">
          <div className="p-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleCreateNewChat}
            >
              <Plus className="h-4 w-4 mr-2" />
              新建对话
            </Button>
          </div>
          
          <div className="px-2 pb-2 space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
            {sessions.map((session) => (
              <Button
                key={session.id}
                variant={currentSessionId === session.id ? 'secondary' : 'ghost'}
                className="w-full justify-start text-left h-auto py-2 px-3"
                onClick={() => setCurrentSession(session.id)}
              >
                <div className="flex flex-col items-start space-y-1 w-full">
                  <span className="text-sm font-medium truncate w-full">
                    {session.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {session.messages.length} 条消息
                  </span>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-border p-2">
        {!sidebarCollapsed && (
          <div className="text-xs text-muted-foreground text-center">
            MCP Web Client v1.0.0
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;