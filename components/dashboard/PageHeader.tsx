'use client';

import { ReactNode } from 'react';

interface PageHeaderProps {
    title: string;
    icon: string;
    description?: string;
    children?: ReactNode; // Dodatkowe przyciski/kontrolki
}

/**
 * Wspólny komponent nagłówka strony w dashboardzie
 * Zapewnia spójny wygląd nagłówków na wszystkich podstronach
 */
export default function PageHeader({ title, icon, description, children }: PageHeaderProps) {
    return (
        <div className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
                    <span className="text-4xl">{icon}</span>
                    {title}
                </h1>
                {description && (
                    <p className="text-slate-400">{description}</p>
                )}
            </div>
            {children && (
                <div className="flex items-center gap-3 flex-wrap">
                    {children}
                </div>
            )}
        </div>
    );
}

