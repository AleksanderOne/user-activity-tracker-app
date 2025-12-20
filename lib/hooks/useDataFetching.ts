'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseDataFetchingOptions<T> {
    fetchFn: () => Promise<T>;
    autoRefreshInterval?: number; // milisekundy, 0 = wyłączone
    initialAutoRefresh?: boolean;
    onError?: (error: Error) => void;
    onSuccess?: (data: T) => void;
}

interface UseDataFetchingReturn<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    lastUpdated: Date | null;
    isRefreshing: boolean;
    autoRefresh: boolean;
    setAutoRefresh: (enabled: boolean) => void;
    refresh: (isAutoRefresh?: boolean) => Promise<void>;
}

/**
 * Hook do pobierania danych z obsługą auto-odświeżania
 * Eliminuje powtarzającą się logikę w komponentach dashboardu
 */
export function useDataFetching<T>({
    fetchFn,
    autoRefreshInterval = 15000,
    initialAutoRefresh = true,
    onError,
    onSuccess,
}: UseDataFetchingOptions<T>): UseDataFetchingReturn<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(initialAutoRefresh);

    // Ref do przechowania aktualnej wersji fetchFn
    const fetchFnRef = useRef(fetchFn);
    fetchFnRef.current = fetchFn;

    const refresh = useCallback(async (isAutoRefresh = false) => {
        if (isAutoRefresh) {
            setIsRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);

        try {
            const result = await fetchFnRef.current();
            setData(result);
            setLastUpdated(new Date());
            onSuccess?.(result);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Nieznany błąd';
            setError(errorMessage);
            
            // Jeśli błąd 401 - przekieruj na login
            if (errorMessage.includes('401')) {
                window.location.href = '/login';
                return;
            }
            
            onError?.(err instanceof Error ? err : new Error(errorMessage));
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, [onError, onSuccess]);

    // Początkowe załadowanie
    useEffect(() => {
        refresh();
    }, [refresh]);

    // Auto-refresh
    useEffect(() => {
        if (!autoRefresh || autoRefreshInterval <= 0) return;

        const interval = setInterval(() => {
            refresh(true);
        }, autoRefreshInterval);

        return () => clearInterval(interval);
    }, [autoRefresh, autoRefreshInterval, refresh]);

    return {
        data,
        loading,
        error,
        lastUpdated,
        isRefreshing,
        autoRefresh,
        setAutoRefresh,
        refresh,
    };
}

