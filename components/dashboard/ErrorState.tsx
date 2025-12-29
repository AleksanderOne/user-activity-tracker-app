'use client';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

/**
 * Wspólny komponent stanu błędu
 */
export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-white mb-2">Wystąpił błąd</h2>
        <p className="text-slate-400 mb-4">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors font-medium"
          >
            Spróbuj ponownie
          </button>
        )}
      </div>
    </div>
  );
}
