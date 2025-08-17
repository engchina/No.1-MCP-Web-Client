import React, { useState, useEffect } from 'react';
import { Plus, Server, Trash2, Settings, RefreshCw, Globe, Zap, Power, PowerOff, Wifi, Radio } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/Dialog';
import { useMCPServerStore, useUIStore } from '../stores';
import { MCPServerService, MCPDiscoveryService } from '../services/api';
import { StreamableTransport } from '../services/streamable-http';
import { MCPServerConfig, MCPServer } from '../types';
import { cn, isValidUrl } from '../utils';

const ServerManagement: React.FC = () => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDiscoveryDialogOpen, setIsDiscoveryDialogOpen] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredServers, setDiscoveredServers] = useState<MCPServer[]>([]);
  const [newServerConfig, setNewServerConfig] = useState<MCPServerConfig>({
    name: '',
    url: '',
    type: 'streamable-http',
  });
  const [selectedTransport, setSelectedTransport] = useState<StreamableTransport>('sse');
  
  const { 
    servers, 
    activeServers, 
    addServer, 
    removeServer, 
    toggleServerActive, 
    setServerStatus,
    connectServer,
    disconnectServer,
    getConnection
  } = useMCPServerStore();
  const { addNotification } = useUIStore();

  const handleAddServer = async () => {
    if (!newServerConfig.name.trim() || !newServerConfig.url.trim()) {
      addNotification({
        type: 'error',
        title: '错误',
        message: '请填写服务器名称和URL',
      });
      return;
    }

    if (!isValidUrl(newServerConfig.url)) {
      addNotification({
        type: 'error',
        title: '错误',
        message: '请输入有效的URL',
      });
      return;
    }

    try {
      addServer(newServerConfig);
      setNewServerConfig({ name: '', url: '', type: 'streamable-http' });
      setIsAddDialogOpen(false);
      
      addNotification({
        type: 'success',
        title: '成功',
        message: '服务器已添加',
      });
    } catch (error) {
      addNotification({
        type: 'error',
        title: '错误',
        message: '添加服务器失败',
      });
    }
  };

  const handleRemoveServer = (serverId: string) => {
    removeServer(serverId);
    addNotification({
      type: 'success',
      title: '成功',
      message: '服务器已删除',
    });
  };

  const handleTestConnection = async (server: MCPServer) => {
    const connected = await connectServer(server.id, selectedTransport);
    
    if (connected) {
      addNotification({
        type: 'success',
        title: '连接成功',
        message: `已成功连接到 ${server.name} (${selectedTransport.toUpperCase()})`,
      });
    } else {
      addNotification({
        type: 'error',
        title: '连接失败',
        message: `无法连接到 ${server.name}`,
      });
    }
  };

  const handleDisconnectServer = async (server: MCPServer) => {
    await disconnectServer(server.id);
    addNotification({
      type: 'success',
      title: '已断开连接',
      message: `已断开与 ${server.name} 的连接`,
    });
  };

  const handleDiscoverServers = async () => {
    setIsDiscovering(true);
    
    try {
      const discovered = await MCPDiscoveryService.discoverServers();
      setDiscoveredServers(discovered);
      setIsDiscoveryDialogOpen(true);
      
      addNotification({
        type: 'success',
        title: '发现完成',
        message: `发现了 ${discovered.length} 个服务器`,
      });
    } catch (error) {
      addNotification({
        type: 'error',
        title: '发现失败',
        message: '无法获取服务器列表',
      });
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleAddDiscoveredServer = (server: MCPServer) => {
    addServer({
      name: server.name,
      url: server.url,
      type: server.type,
      description: server.description,
    });
    
    addNotification({
      type: 'success',
      title: '成功',
      message: `已添加服务器 ${server.name}`,
    });
  };

  const getStatusColor = (status: MCPServer['status']) => {
    switch (status) {
      case 'connected':
        return 'text-green-500';
      case 'connecting':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusText = (status: MCPServer['status']) => {
    switch (status) {
      case 'connected':
        return '已连接';
      case 'connecting':
        return '连接中';
      case 'error':
        return '连接失败';
      default:
        return '未连接';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">MCP 服务器管理</h2>
          <p className="text-muted-foreground">管理和配置您的 MCP 服务器连接</p>
        </div>
        
        <div className="flex space-x-2">
          <Button
            variant="outline"
            onClick={handleDiscoverServers}
            disabled={isDiscovering}
          >
            {isDiscovering ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Globe className="h-4 w-4 mr-2" />
            )}
            发现服务器
          </Button>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                添加服务器
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>添加 MCP 服务器</DialogTitle>
                <DialogDescription>
                  配置新的 MCP 服务器连接
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">服务器名称</label>
                  <Input
                    value={newServerConfig.name}
                    onChange={(e) => setNewServerConfig(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="输入服务器名称"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">服务器URL</label>
                  <Input
                    value={newServerConfig.url}
                    onChange={(e) => setNewServerConfig(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="https://example.com/mcp"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">连接类型</label>
                  <select
                    value={newServerConfig.type}
                    onChange={(e) => setNewServerConfig(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full h-10 px-3 py-2 text-sm border border-input bg-background rounded-md"
                  >
                    <option value="streamable-http">Streamable HTTP</option>
                    <option value="websocket">WebSocket</option>
                    <option value="stdio">STDIO</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-sm font-medium">传输协议</label>
                  <div className="flex space-x-2 mt-2">
                    <Button
                      type="button"
                      variant={selectedTransport === 'sse' ? 'default' : 'outline'}
                      onClick={() => setSelectedTransport('sse')}
                      className="flex items-center space-x-2"
                    >
                      <Radio className="h-4 w-4" />
                      <span>SSE</span>
                    </Button>
                    <Button
                      type="button"
                      variant={selectedTransport === 'websocket' ? 'default' : 'outline'}
                      onClick={() => setSelectedTransport('websocket')}
                      className="flex items-center space-x-2"
                    >
                      <Wifi className="h-4 w-4" />
                      <span>WebSocket</span>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedTransport === 'sse' 
                      ? 'Server-Sent Events - 单向流式通信，适合大多数场景'
                      : 'WebSocket - 双向实时通信，支持自动重连'}
                  </p>
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleAddServer}>
                  添加
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Server List */}
      <div className="grid gap-4">
        {servers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Server className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">暂无服务器</h3>
              <p className="text-muted-foreground text-center mb-4">
                添加您的第一个 MCP 服务器开始使用
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                添加服务器
              </Button>
            </CardContent>
          </Card>
        ) : (
          servers.map((server) => (
            <Card key={server.id} className={cn(
              'transition-all duration-200',
              activeServers.includes(server.id) && 'ring-2 ring-primary'
            )}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={cn(
                      'w-3 h-3 rounded-full',
                      server.status === 'connected' && 'bg-green-500',
                      server.status === 'connecting' && 'bg-yellow-500 animate-pulse',
                      server.status === 'error' && 'bg-red-500',
                      server.status === 'disconnected' && 'bg-gray-400'
                    )} />
                    <div>
                      <CardTitle className="text-lg">{server.name}</CardTitle>
                      <CardDescription>
                        {server.url} • {server.type}
                      </CardDescription>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <span className={cn('text-sm font-medium', getStatusColor(server.status))}>
                      {getStatusText(server.status)}
                    </span>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleServerActive(server.id)}
                    >
                      {activeServers.includes(server.id) ? (
                        <Zap className="h-4 w-4 mr-1 text-yellow-500" />
                      ) : (
                        <Zap className="h-4 w-4 mr-1" />
                      )}
                      {activeServers.includes(server.id) ? '停用' : '启用'}
                    </Button>
                    
                    {server.status === 'connected' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnectServer(server)}
                      >
                        <PowerOff className="h-4 w-4 mr-1" />
                        断开连接
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(server)}
                        disabled={server.status === 'connecting'}
                      >
                        {server.status === 'connecting' ? (
                          <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Power className="h-4 w-4 mr-1" />
                        )}
                        {server.status === 'connecting' ? '连接中...' : '连接'}
                      </Button>
                    )}
                    
                    {server.status === 'connected' && (
                      <div className="flex items-center text-xs text-muted-foreground">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></div>
                        {getConnection(server.id)?.serverInfo.type === 'streamable-http' ? 'Streamable' : 'HTTP'}
                      </div>
                    )}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveServer(server.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      删除
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              {server.description && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{server.description}</p>
                  {server.capabilities && server.capabilities.length > 0 && (
                    <div className="mt-2">
                      <span className="text-sm font-medium">功能: </span>
                      <span className="text-sm text-muted-foreground">
                        {server.capabilities.join(', ')}
                      </span>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Discovery Dialog */}
      <Dialog open={isDiscoveryDialogOpen} onOpenChange={setIsDiscoveryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>发现的服务器</DialogTitle>
            <DialogDescription>
              从公共注册表发现的 MCP 服务器
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-96 overflow-y-auto space-y-2">
            {discoveredServers.map((server) => (
              <Card key={server.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{server.name}</h4>
                      <p className="text-sm text-muted-foreground">{server.url}</p>
                      {server.description && (
                        <p className="text-sm text-muted-foreground mt-1">{server.description}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAddDiscoveredServer(server)}
                      disabled={servers.some(s => s.url === server.url)}
                    >
                      {servers.some(s => s.url === server.url) ? '已添加' : '添加'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDiscoveryDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServerManagement;