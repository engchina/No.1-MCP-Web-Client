import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '../stores';
import { cn } from '../utils';

const NotificationContainer: React.FC = () => {
  const { notifications, removeNotification } = useUIStore();

  useEffect(() => {
    // Auto-remove notifications after 5 seconds
    const timers = notifications.map(notification => {
      if (notification.type !== 'error') {
        return setTimeout(() => {
          removeNotification(notification.id);
        }, 5000);
      }
      return null;
    });

    return () => {
      timers.forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, [notifications, removeNotification]);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={cn(
            'max-w-sm w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden',
            'transform transition-all duration-300 ease-in-out',
            {
              'border-l-4 border-red-500': notification.type === 'error',
              'border-l-4 border-green-500': notification.type === 'success',
              'border-l-4 border-yellow-500': notification.type === 'warning',
              'border-l-4 border-blue-500': notification.type === 'info',
            }
          )}
        >
          <div className="p-4">
            <div className="flex items-start">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {notification.title}
                </p>
                {notification.message && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {notification.message}
                  </p>
                )}
              </div>
              <div className="ml-4 flex-shrink-0 flex">
                <button
                  className="bg-white dark:bg-gray-800 rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  onClick={() => removeNotification(notification.id)}
                >
                  <span className="sr-only">Close</span>
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NotificationContainer;