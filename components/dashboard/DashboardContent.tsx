'use client';

import React from 'react';

interface DashboardContentProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * Wspólny wrapper dla wszystkich stron dashboardu.
 * Zapewnia spójny padding, szerokość i stylowanie.
 */
export function DashboardContent({ children, className = '' }: DashboardContentProps) {
    return (
        <div className="p-6 text-slate-200 font-sans">
            <div className={`mx-auto max-w-7xl ${className}`.trim()}>
                {children}
            </div>
        </div>
    );
}

