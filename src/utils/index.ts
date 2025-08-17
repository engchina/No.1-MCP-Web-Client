import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility function for merging Tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Generate unique ID
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Format date
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// Format relative time
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}天前`;
  } else if (hours > 0) {
    return `${hours}小时前`;
  } else if (minutes > 0) {
    return `${minutes}分钟前`;
  } else {
    return '刚刚';
  }
}

// Validate URL
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Validate API key format
export function isValidApiKey(apiKey: string, provider: 'openai' | 'oracle'): boolean {
  if (!apiKey || apiKey.trim().length === 0) {
    return false;
  }

  switch (provider) {
    case 'openai':
      return apiKey.startsWith('sk-') && apiKey.length > 20;
    case 'oracle':
      return apiKey.length > 10; // Oracle keys have different format
    default:
      return false;
  }
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Copy to clipboard
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      document.body.removeChild(textArea);
      return false;
    }
  }
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Truncate text
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Parse error message
export function parseErrorMessage(error: any): string {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  
  if (error?.message) {
    return error.message;
  }
  
  return '发生未知错误';
}

// Local storage helpers
export const storage = {
  get: <T>(key: string, defaultValue?: T): T | null => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue || null;
    } catch {
      return defaultValue || null;
    }
  },
  
  set: (key: string, value: any): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      console.warn('Failed to save to localStorage');
    }
  },
  
  remove: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      console.warn('Failed to remove from localStorage');
    }
  },
  
  clear: (): void => {
    try {
      localStorage.clear();
    } catch {
      console.warn('Failed to clear localStorage');
    }
  }
};

// File service utilities for JSON persistence
export const fileService = {
  /**
   * Read JSON configuration from local file
   */
  async readJson<T>(filePath: string): Promise<T | null> {
    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        console.warn(`Failed to read ${filePath}: ${response.status}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn(`Error reading ${filePath}:`, error);
      return null;
    }
  },

  /**
   * Write JSON configuration to local file
   * Note: In browser environment, this requires a backend API or file system access
   */
  async writeJson<T>(filePath: string, data: T): Promise<boolean> {
    try {
      // For development/testing, we'll use localStorage as fallback
      if (typeof window !== 'undefined') {
        const key = `file:${filePath}`;
        localStorage.setItem(key, JSON.stringify(data, null, 2));
        console.log(`Saved to localStorage with key: ${key}`);
        return true;
      }
      
      // In a real implementation, this would make an API call to save the file
      console.warn('File writing not supported in browser environment');
      return false;
    } catch (error) {
      console.error(`Error writing ${filePath}:`, error);
      return false;
    }
  },

  /**
   * Load MCP servers configuration
   */
  async loadMCPServers(): Promise<MCPServersConfig | null> {
    // Prefer localStorage override in browser (ensures persistence across reloads during dev)
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('file:/mcp-servers.json');
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (error) {
        console.warn('Error reading from localStorage:', error);
      }
    }

    // Fallback to reading the default file from the server
    const config = await this.readJson<MCPServersConfig>('/mcp-servers.json');
    return config;
  },

  /**
   * Save MCP servers configuration
   */
  async saveMCPServers(config: MCPServersConfig): Promise<boolean> {
    return await this.writeJson('/mcp-servers.json', config);
  }
};

// Type definitions for MCP server configuration
export interface MCPServerConfig {
  type?: 'streamable-http' | 'sse';
  url?: string;
  serverUrl?: string; // Alternative field name for compatibility
}

export interface MCPServersConfig {
  mcpServers: {
    [serverName: string]: MCPServerConfig;
  };
}