'use client';

interface LoadingStateProps {
  message?: string;
}

/**
 * Wspólny komponent stanu ładowania
 */
export default function LoadingState({ message = 'Ładowanie...' }: LoadingStateProps) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="animate-spin text-4xl mb-4">⏳</div>
        <p className="text-slate-400">{message}</p>
      </div>
    </div>
  );
}
