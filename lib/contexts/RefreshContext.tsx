'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';

interface RefreshState {
  lastUpdated: Date | null;
  isRefreshing: boolean;
  autoRefreshEnabled: boolean;
  timeToRefresh: number;
  refreshInterval: number; // w sekundach
}

interface RefreshContextType extends RefreshState {
  setLastUpdated: (date: Date | null) => void;
  setIsRefreshing: (value: boolean) => void;
  setAutoRefreshEnabled: (value: boolean) => void;
  triggerRefresh: () => void;
  registerRefreshHandler: (handler: () => void) => void;
  unregisterRefreshHandler: () => void;
  setRefreshInterval: (seconds: number) => void;
}

const RefreshContext = createContext<RefreshContextType | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [timeToRefresh, setTimeToRefresh] = useState(15);
  const [refreshInterval, setRefreshInterval] = useState(15);
  const [refreshHandler, setRefreshHandler] = useState<(() => void) | null>(null);

  // Funkcja do wywołania odświeżenia
  const triggerRefresh = useCallback(() => {
    if (refreshHandler) {
      refreshHandler();
    }
    setTimeToRefresh(refreshInterval);
  }, [refreshHandler, refreshInterval]);

  // Rejestracja handlera odświeżania z konkretnej strony
  const registerRefreshHandler = useCallback((handler: () => void) => {
    setRefreshHandler(() => handler);
  }, []);

  const unregisterRefreshHandler = useCallback(() => {
    setRefreshHandler(null);
  }, []);

  // Auto-refresh countdown
  useEffect(() => {
    if (!autoRefreshEnabled) {
      setTimeToRefresh(refreshInterval);
      return;
    }

    const countdown = setInterval(() => {
      setTimeToRefresh((prev) => {
        if (prev <= 1) {
          // Wywołaj refresh
          if (refreshHandler) {
            refreshHandler();
          }
          return refreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, [autoRefreshEnabled, refreshHandler, refreshInterval]);

  // Reset timera przy zmianie interwału
  useEffect(() => {
    setTimeToRefresh(refreshInterval);
  }, [refreshInterval]);

  return (
    <RefreshContext.Provider
      value={{
        lastUpdated,
        isRefreshing,
        autoRefreshEnabled,
        timeToRefresh,
        refreshInterval,
        setLastUpdated,
        setIsRefreshing,
        setAutoRefreshEnabled,
        triggerRefresh,
        registerRefreshHandler,
        unregisterRefreshHandler,
        setRefreshInterval,
      }}
    >
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh() {
  const context = useContext(RefreshContext);
  if (!context) {
    throw new Error('useRefresh must be used within a RefreshProvider');
  }
  return context;
}
