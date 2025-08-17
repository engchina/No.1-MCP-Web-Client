import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, ToastViewport } from './components/ui/Toast';
import { useUIStore } from './stores';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import ServerManagement from './components/ServerManagement';
import Settings from './components/Settings';
import NotificationContainer from './components/NotificationContainer';
import { cn } from './utils';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  const { theme, activeTab, sidebarCollapsed } = useUIStore();

  // Apply theme to document
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  const renderMainContent = () => {
    switch (activeTab) {
      case 'chat':
        return <ChatInterface />;
      case 'servers':
        return <ServerManagement />;
      case 'settings':
        return <Settings />;
      default:
        return <ChatInterface />;
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div className="flex h-screen bg-background text-foreground">
          {/* Sidebar */}
          <div
            className={cn(
              'transition-all duration-300 ease-in-out border-r border-border',
              sidebarCollapsed ? 'w-16' : 'w-64'
            )}
          >
            <Sidebar />
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <header className="h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex h-full items-center justify-between px-4">
                <div className="flex items-center space-x-4">
                  <h1 className="text-lg font-semibold">
                    {activeTab === 'chat' && '聊天'}
                    {activeTab === 'servers' && 'MCP 服务器'}
                    {activeTab === 'settings' && '设置'}
                  </h1>
                </div>
                
                <div className="flex items-center space-x-2">
                  {/* Status indicators or actions can go here */}
                </div>
              </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto">
              {renderMainContent()}
            </main>
          </div>
        </div>

        {/* Notifications */}
        <NotificationContainer />
        
        {/* Toast Viewport */}
        <ToastViewport />
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;