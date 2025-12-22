import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface LoginAttemptRecord {
    id: string;
    timestamp: string;
    site_id: string;
    session_id: string;
    visitor_id: string;
    form_submission_id: string | null;
    email: string | null;
    username: string | null;
    password_length: number;
    page_url: string | null;
    page_path: string | null;
    login_success: number | null;
    detection_method: string | null;
    error_message: string | null;
    redirect_url: string | null;
    response_status: number | null;
    created_at: string;
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
        const status = searchParams.get('status'); // 'success', 'failed', 'unknown', 'all'
        const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
        const offset = parseInt(searchParams.get('offset') || '0');
        const days = parseInt(searchParams.get('days') || '30');

        const db = getDb();
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        // Buduj zapytanie
        let query = `
            SELECT 
                id, timestamp, site_id, session_id, visitor_id,
                form_submission_id, email, username, password_length,
                page_url, page_path, login_success, detection_method,
                error_message, redirect_url, response_status, created_at
            FROM login_attempts
            WHERE timestamp >= ?
        `;

        const params: (string | number)[] = [since];

        if (siteId) {
            query += ' AND site_id = ?';
            params.push(siteId);
        }

        if (status && status !== 'all') {
            if (status === 'success') {
                query += ' AND login_success = 1';
            } else if (status === 'failed') {
                query += ' AND login_success = 0';
            } else if (status === 'unknown') {
                query += ' AND login_success IS NULL';
            }
        }

        // Pobierz łączną liczbę
        const countQuery = query.replace(
            /SELECT[\s\S]*?FROM/,
            'SELECT COUNT(*) as total FROM'
        );
        const totalResult = db.prepare(countQuery).get(...params) as { total: number };
        const total = totalResult?.total || 0;

        // Dodaj sortowanie i paginację
        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const logins = db.prepare(query).all(...params) as LoginAttemptRecord[];

        // Statystyki
        const statsQuery = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN login_success = 1 THEN 1 ELSE 0 END) as successful,
                SUM(CASE WHEN login_success = 0 THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN login_success IS NULL THEN 1 ELSE 0 END) as unknown,
                COUNT(DISTINCT session_id) as unique_sessions,
                COUNT(DISTINCT visitor_id) as unique_visitors,
                COUNT(DISTINCT email) as unique_emails,
                COUNT(DISTINCT site_id) as unique_sites
            FROM login_attempts
            WHERE timestamp >= ?
            ${siteId ? ' AND site_id = ?' : ''}
        `;
        
        const statsParams: (string | number)[] = [since];
        if (siteId) statsParams.push(siteId);
        
        const stats = db.prepare(statsQuery).get(...statsParams) as {
            total: number;
            successful: number;
            failed: number;
            unknown: number;
            unique_sessions: number;
            unique_visitors: number;
            unique_emails: number;
            unique_sites: number;
        };

        // Formatuj dane
        const formattedLogins = logins.map(login => ({
            id: login.id,
            timestamp: login.timestamp,
            siteId: login.site_id,
            sessionId: login.session_id,
            visitorId: login.visitor_id,
            formSubmissionId: login.form_submission_id,
            email: login.email,
            username: login.username,
            passwordLength: login.password_length,
            pageUrl: login.page_url,
            pagePath: login.page_path,
            loginSuccess: login.login_success === 1 ? true : (login.login_success === 0 ? false : null),
            detectionMethod: login.detection_method,
            errorMessage: login.error_message,
            redirectUrl: login.redirect_url,
            responseStatus: login.response_status,
            createdAt: login.created_at,
            // Wygodna etykieta statusu
            statusLabel: login.login_success === 1 ? 'Udane' : 
                        (login.login_success === 0 ? 'Nieudane' : 'Nieznany')
        }));

        return NextResponse.json({
            logins: formattedLogins,
            stats: {
                total: stats?.total || 0,
                successful: stats?.successful || 0,
                failed: stats?.failed || 0,
                unknown: stats?.unknown || 0,
                uniqueSessions: stats?.unique_sessions || 0,
                uniqueVisitors: stats?.unique_visitors || 0,
                uniqueEmails: stats?.unique_emails || 0,
                uniqueSites: stats?.unique_sites || 0,
                successRate: stats?.total > 0 
                    ? Math.round((stats.successful / stats.total) * 100) 
                    : 0
            },
            pagination: {
                limit,
                offset,
                total,
                hasMore: offset + limit < total
            }
        });

    } catch (error) {
        console.error('[API/logins] Error:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

