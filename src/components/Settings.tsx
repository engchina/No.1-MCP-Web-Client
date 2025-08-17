import React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { useSettingsStore, useUIStore } from '../stores';

const Settings: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();
  const { theme, setTheme, addNotification } = useUIStore();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data && typeof data === 'object') {
            updateSettings({ ...settings, ...data });
          }
        }
      } catch (e) {
        // ignore if endpoint not available
      }
    })();
    return () => { cancelled = true };
  }, []);
  const themeOptions = [
    { value: 'light', label: '浅色', icon: Sun },
    { value: 'dark', label: '深色', icon: Moon },
    { value: 'system', label: '系统', icon: Monitor },
  ];

  const handleSaveSettings = async () => {
    // Settings are automatically persisted by zustand persist middleware
    // Additionally, persist to local file via dev server API
    try {
      // update zustand state
      updateSettings({ ...settings });

      // persist to file
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!res.ok) throw new Error('写入失败');
      
      addNotification({
        type: 'success',
        title: '设置已保存',
        message: '已保存到项目目录下的 ai-provider-settings.json',
        duration: 3000,
      });
    } catch (error: any) {
      addNotification({
        type: 'error',
        title: '保存失败',
        message: `文件写入失败：${error?.message || '未知错误'}`,
        duration: 5000,
      });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">设置</h2>
        <p className="text-muted-foreground">配置您的应用程序设置和偏好</p>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>常规设置</CardTitle>
          <CardDescription>应用程序的基本配置</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Theme */}
          <div>
            <label className="text-sm font-medium mb-2 block">主题</label>
            <div className="flex space-x-2">
              {themeOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <Button
                    key={option.value}
                    variant={theme === option.value ? 'default' : 'outline'}
                    onClick={() => setTheme(option.value as any)}
                    className="flex items-center space-x-2"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{option.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Auto Save */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">自动保存</label>
              <p className="text-sm text-muted-foreground">自动保存聊天记录</p>
            </div>
            <Button
              variant={settings.autoSave ? 'default' : 'outline'}
              onClick={() => updateSettings({ autoSave: !settings.autoSave })}
            >
              {settings.autoSave ? '已启用' : '已禁用'}
            </Button>
          </div>

          {/* Stream Response */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">流式响应</label>
              <p className="text-sm text-muted-foreground">实时显示AI回复</p>
            </div>
            <Button
              variant={settings.streamResponse ? 'default' : 'outline'}
              onClick={() => updateSettings({ streamResponse: !settings.streamResponse })}
            >
              {settings.streamResponse ? '已启用' : '已禁用'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI Provider Settings */}
      <Card>
        <CardHeader>
          <CardTitle>AI提供商设置</CardTitle>
          <CardDescription>配置AI模型参数</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider Type Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">提供商类型</label>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="providerType"
                  value="openai"
                  checked={settings.providerType === 'openai'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSettings({ providerType: e.target.value as 'openai' | 'ocigenai' })}
                  className="text-primary"
                />
                <span>OpenAI</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="providerType"
                  value="ocigenai"
                  checked={settings.providerType === 'ocigenai'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSettings({ providerType: e.target.value as 'openai' | 'ocigenai' })}
                  className="text-primary"
                />
                <span>OCI GenAI</span>
              </label>
            </div>
          </div>

          {/* OpenAI Settings */}
          {settings.providerType === 'openai' && (
            <>
              <div>
                <label className="text-sm font-medium mb-2 block">Base URL</label>
                <Input
                  value={settings.openaiBaseUrl || 'https://api.openai.com/v1'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSettings({ openaiBaseUrl: e.target.value })}
                  placeholder="OpenAI API Base URL"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">API Key</label>
                <Input
                  type="password"
                  value={settings.openaiApiKey || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSettings({ openaiApiKey: e.target.value })}
                  placeholder="输入OpenAI API密钥"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">模型名称</label>
                <Input
                  value={settings.openaiModelName || 'gpt-4o'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSettings({ openaiModelName: e.target.value })}
                  placeholder="模型名称"
                />
              </div>
            </>
          )}

          {/* OCI GenAI Settings */}
          {settings.providerType === 'ocigenai' && (
            <div>
              <label className="text-sm font-medium mb-2 block">模型名称</label>
              <Input
                value={settings.ocigenaiModelName || 'meta.llama-4-scout-17b-16e-instruct'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSettings({ ocigenaiModelName: e.target.value })}
                placeholder="模型名称"
              />
            </div>
          )}

          {/* Max Tokens */}
          <div>
            <label className="text-sm font-medium mb-2 block">最大令牌数</label>
            <Input
              type="number"
              value={settings.maxTokens}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSettings({ maxTokens: parseInt(e.target.value) || 64000 })}
              min={1}
              max={200000}
            />
          </div>

          {/* Temperature */}
          <div>
            <label className="text-sm font-medium mb-2 block">温度 ({settings.temperature})</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSettings({ temperature: parseFloat(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>保守 (0)</span>
              <span>平衡 (1)</span>
              <span>创造性 (2)</span>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-4 border-t">
            <Button 
              onClick={handleSaveSettings}
              className="w-full"
            >
              保存设置
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;