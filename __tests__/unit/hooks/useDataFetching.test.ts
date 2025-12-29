/**
 * Testy jednostkowe dla hooka useDataFetching
 * Testuje pobieranie danych, ładowanie, błędy i auto-odświeżanie
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useDataFetching } from '@/lib/hooks/useDataFetching';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('useDataFetching', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('powinien zainicjować się ze stanem loading: true', async () => {
        const fetchFn = vi.fn().mockReturnValue(new Promise(() => { })); // Nigdy nie powraca

        const { result } = renderHook(() =>
            useDataFetching({
                fetchFn,
            }),
        );

        expect(result.current.loading).toBe(true);
        expect(result.current.data).toBeNull();
        expect(result.current.error).toBeNull();
    });

    it('powinien załadować dane pomyślnie', async () => {
        const mockData = { test: 'value' };
        const fetchFn = vi.fn().mockResolvedValue(mockData);

        const { result } = renderHook(() =>
            useDataFetching({
                fetchFn,
            }),
        );

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.data).toEqual(mockData);
        expect(result.current.error).toBeNull();
        expect(result.current.lastUpdated).toBeInstanceOf(Date);
    });

    it('powinien obsłużyć błąd pobierania', async () => {
        const errorMessage = 'Błąd serwera';
        const fetchFn = vi.fn().mockRejectedValue(new Error(errorMessage));
        const onError = vi.fn();

        const { result } = renderHook(() =>
            useDataFetching({
                fetchFn,
                onError,
            }),
        );

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.error).toBe(errorMessage);
        expect(result.current.data).toBeNull();
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('powinien obsłużyć auto-odświeżanie', async () => {
        const fetchFn = vi.fn().mockResolvedValue({ val: 1 });
        const interval = 5000;

        renderHook(() =>
            useDataFetching({
                fetchFn,
                autoRefreshInterval: interval,
                initialAutoRefresh: true,
            }),
        );

        // Pierwsze wywołanie (useEffect)
        await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

        // Przesuń czas o interval
        await act(async () => {
            vi.advanceTimersByTime(interval);
        });

        expect(fetchFn).toHaveBeenCalledTimes(2);

        // Przesuń czas o kolejny interval
        await act(async () => {
            vi.advanceTimersByTime(interval);
        });

        expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it('powinien przestać odświeżać gdy autoRefresh jest wyłączone', async () => {
        const fetchFn = vi.fn().mockResolvedValue({ val: 1 });
        const interval = 5000;

        const { result } = renderHook(() =>
            useDataFetching({
                fetchFn,
                autoRefreshInterval: interval,
                initialAutoRefresh: true,
            }),
        );

        await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

        // Wyłącz auto-odświeżanie
        act(() => {
            result.current.setAutoRefresh(false);
        });

        // Przesuń czas
        await act(async () => {
            vi.advanceTimersByTime(interval * 2);
        });

        // Nie powinno być nowych wywołań poza pierwszym
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('powinien wymusić ręczne odświeżenie', async () => {
        const fetchFn = vi.fn().mockResolvedValue({ val: 1 });

        const { result } = renderHook(() =>
            useDataFetching({
                fetchFn,
                initialAutoRefresh: false,
            }),
        );

        await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

        // Ręczne odświeżenie
        await act(async () => {
            await result.current.refresh();
        });

        expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('powinien przekierować na /login przy błędzie 401', async () => {
        const fetchFn = vi.fn().mockRejectedValue(new Error('Unauthorized (401)'));

        // Mockowanie window.location.href
        const originalLocation = window.location;
        const locationMock = { href: 'http://localhost/' };
        vi.stubGlobal('location', locationMock);

        renderHook(() =>
            useDataFetching({
                fetchFn,
            }),
        );

        // W hooku jest window.location.href = '/login'
        // Musimy poczekać aż fetch się nie uda i nastąpi przypisanie
        await waitFor(() => expect(locationMock.href).toBe('/login'));

        vi.stubGlobal('location', originalLocation);
    });

    it('powinien wywołać onSuccess po pomyślnym pobraniu', async () => {
        const mockData = { key: 'value' };
        const fetchFn = vi.fn().mockResolvedValue(mockData);
        const onSuccess = vi.fn();

        renderHook(() =>
            useDataFetching({
                fetchFn,
                onSuccess,
            }),
        );

        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(mockData));
    });
});
