import { NextRequest, NextResponse } from 'next/server';
import { 
    getTrackingSettings, 
    setGlobalTrackingEnabled, 
    setSiteTrackingEnabled,
    removeSiteTrackingSetting,
    getAllTrackedSites,
    isTrackingEnabled
} from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tracking/settings
 * Pobiera wszystkie ustawienia śledzenia oraz listę dostępnych site_id
 */
export async function GET(request: NextRequest) {
    // Weryfikacja sesji admina
    const authToken = request.cookies.get('dashboard_token')?.value;
    if (!authToken || !verifyToken(authToken)) {
        return NextResponse.json(
            { error: 'Nieautoryzowany dostęp' },
            { status: 401 }
        );
    }

    try {
        const settings = getTrackingSettings();
        const allSites = getAllTrackedSites();
        
        // Dla każdego site_id sprawdź efektywny status (uwzględniając global)
        const sitesWithStatus = allSites.map(siteId => {
            const siteSetting = settings.find(s => s.setting_type === 'site' && s.site_id === siteId);
            const globalSetting = settings.find(s => s.setting_type === 'global');
            
            return {
                site_id: siteId,
                enabled: isTrackingEnabled(siteId),
                has_custom_setting: Boolean(siteSetting),
                custom_enabled: siteSetting?.enabled ?? null,
                global_enabled: globalSetting?.enabled ?? true,
                updated_at: siteSetting?.updated_at || null
            };
        });

        // Znajdź ustawienie globalne
        const globalSetting = settings.find(s => s.setting_type === 'global');

        return NextResponse.json({
            global: {
                enabled: globalSetting?.enabled ?? true,
                updated_at: globalSetting?.updated_at || null,
                updated_by: globalSetting?.updated_by || null
            },
            sites: sitesWithStatus,
            settings: settings,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[API/tracking/settings] Error:', error);
        return NextResponse.json(
            { error: 'Błąd serwera' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/tracking/settings
 * Ustawia status śledzenia
 * 
 * Body:
 * - type: 'global' | 'site'
 * - site_id?: string (wymagane gdy type='site')
 * - enabled: boolean
 */
export async function POST(request: NextRequest) {
    // Weryfikacja sesji admina
    const authToken = request.cookies.get('dashboard_token')?.value;
    if (!authToken || !verifyToken(authToken)) {
        return NextResponse.json(
            { error: 'Nieautoryzowany dostęp' },
            { status: 401 }
        );
    }

    try {
        const body = await request.json();
        const { type, site_id, enabled } = body;

        // Walidacja
        if (!type || (type !== 'global' && type !== 'site')) {
            return NextResponse.json(
                { error: 'Nieprawidłowy typ ustawienia (global/site)' },
                { status: 400 }
            );
        }

        if (typeof enabled !== 'boolean') {
            return NextResponse.json(
                { error: 'Pole enabled musi być boolean' },
                { status: 400 }
            );
        }

        if (type === 'site' && !site_id) {
            return NextResponse.json(
                { error: 'Wymagane site_id dla typu site' },
                { status: 400 }
            );
        }

        // Zapisz zmianę
        if (type === 'global') {
            setGlobalTrackingEnabled(enabled, 'admin');
        } else {
            setSiteTrackingEnabled(site_id, enabled, 'admin');
        }

        // Pobierz aktualne ustawienia po zmianie
        const settings = getTrackingSettings();
        const globalSetting = settings.find(s => s.setting_type === 'global');

        return NextResponse.json({
            success: true,
            message: type === 'global' 
                ? `Śledzenie globalne ${enabled ? 'włączone' : 'wyłączone'}`
                : `Śledzenie dla ${site_id} ${enabled ? 'włączone' : 'wyłączone'}`,
            global_enabled: globalSetting?.enabled ?? true,
            effective_enabled: type === 'site' ? isTrackingEnabled(site_id) : (globalSetting?.enabled ?? true)
        });
    } catch (error) {
        console.error('[API/tracking/settings] POST Error:', error);
        return NextResponse.json(
            { error: 'Błąd serwera' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/tracking/settings
 * Usuwa ustawienie dla konkretnego site_id (przywraca domyślne)
 * 
 * Body:
 * - site_id: string
 */
export async function DELETE(request: NextRequest) {
    // Weryfikacja sesji admina
    const authToken = request.cookies.get('dashboard_token')?.value;
    if (!authToken || !verifyToken(authToken)) {
        return NextResponse.json(
            { error: 'Nieautoryzowany dostęp' },
            { status: 401 }
        );
    }

    try {
        const body = await request.json();
        const { site_id } = body;

        if (!site_id) {
            return NextResponse.json(
                { error: 'Wymagane site_id' },
                { status: 400 }
            );
        }

        removeSiteTrackingSetting(site_id);

        return NextResponse.json({
            success: true,
            message: `Usunięto niestandardowe ustawienie dla ${site_id} - przywrócono domyślne`,
            effective_enabled: isTrackingEnabled(site_id)
        });
    } catch (error) {
        console.error('[API/tracking/settings] DELETE Error:', error);
        return NextResponse.json(
            { error: 'Błąd serwera' },
            { status: 500 }
        );
    }
}

