/**
 * Testy jednostkowe dla modułu utils
 * Testuje funkcje pomocnicze (cn - className merge)
 */

import { cn } from '@/lib/utils';

describe('Utils', () => {
    
    // ========================
    // Testy funkcji cn (className merge)
    // ========================
    describe('cn (className)', () => {
        
        describe('Podstawowe użycie', () => {
            it('powinien połączyć proste klasy', () => {
                const result = cn('class1', 'class2');
                
                expect(result).toBe('class1 class2');
            });

            it('powinien zwrócić pustą string dla braku argumentów', () => {
                const result = cn();
                
                expect(result).toBe('');
            });

            it('powinien obsłużyć pojedynczą klasę', () => {
                const result = cn('single-class');
                
                expect(result).toBe('single-class');
            });
        });

        describe('Warunkowe klasy', () => {
            it('powinien obsłużyć obiekty z warunkami', () => {
                const result = cn({
                    'active': true,
                    'disabled': false,
                    'visible': true,
                });
                
                expect(result).toContain('active');
                expect(result).toContain('visible');
                expect(result).not.toContain('disabled');
            });

            it('powinien połączyć stringi z obiektami', () => {
                const result = cn('base-class', {
                    'conditional': true,
                    'hidden': false,
                });
                
                expect(result).toContain('base-class');
                expect(result).toContain('conditional');
                expect(result).not.toContain('hidden');
            });
        });

        describe('Tailwind merge', () => {
            it('powinien nadpisywać konflikty Tailwind', () => {
                const result = cn('p-4', 'p-2');
                
                // twMerge powinien zostawić tylko ostatnią wartość
                expect(result).toBe('p-2');
            });

            it('powinien nadpisywać kolory', () => {
                const result = cn('bg-red-500', 'bg-blue-500');
                
                expect(result).toBe('bg-blue-500');
            });

            it('powinien zachować niezwiązane klasy', () => {
                const result = cn('p-4', 'text-lg', 'p-2');
                
                expect(result).toContain('text-lg');
                expect(result).toContain('p-2');
                expect(result).not.toContain('p-4');
            });

            it('powinien obsłużyć warianty responsive', () => {
                const result = cn('md:p-4', 'md:p-6');
                
                expect(result).toBe('md:p-6');
            });

            it('powinien zachować różne breakpointy', () => {
                const result = cn('p-4', 'md:p-6', 'lg:p-8');
                
                expect(result).toContain('p-4');
                expect(result).toContain('md:p-6');
                expect(result).toContain('lg:p-8');
            });
        });

        describe('Obsługa wartości falsy', () => {
            it('powinien ignorować undefined', () => {
                const result = cn('class1', undefined, 'class2');
                
                expect(result).toBe('class1 class2');
            });

            it('powinien ignorować null', () => {
                const result = cn('class1', null, 'class2');
                
                expect(result).toBe('class1 class2');
            });

            it('powinien ignorować false', () => {
                const result = cn('class1', false, 'class2');
                
                expect(result).toBe('class1 class2');
            });

            it('powinien ignorować pusty string', () => {
                const result = cn('class1', '', 'class2');
                
                expect(result).toBe('class1 class2');
            });

            it('powinien ignorować 0', () => {
                const result = cn('class1', 0, 'class2');
                
                expect(result).toBe('class1 class2');
            });
        });

        describe('Tablice', () => {
            it('powinien obsłużyć tablice klas', () => {
                const result = cn(['class1', 'class2']);
                
                expect(result).toBe('class1 class2');
            });

            it('powinien obsłużyć zagnieżdżone tablice', () => {
                const result = cn(['class1', ['class2', 'class3']]);
                
                expect(result).toContain('class1');
                expect(result).toContain('class2');
                expect(result).toContain('class3');
            });

            it('powinien obsłużyć tablice z warunkami', () => {
                const isActive = true;
                const result = cn([
                    'base',
                    isActive && 'active',
                    !isActive && 'inactive',
                ]);
                
                expect(result).toContain('base');
                expect(result).toContain('active');
                expect(result).not.toContain('inactive');
            });
        });

        describe('Praktyczne przypadki UI', () => {
            it('powinien obsłużyć typowy przypadek przycisku', () => {
                const variant = 'primary';
                const size = 'lg';
                const disabled = false;
                
                const result = cn(
                    'btn',
                    variant === 'primary' && 'bg-blue-500 text-white',
                    variant === 'secondary' && 'bg-gray-200 text-gray-800',
                    size === 'lg' && 'px-6 py-3',
                    size === 'sm' && 'px-2 py-1',
                    disabled && 'opacity-50 cursor-not-allowed',
                );
                
                expect(result).toContain('btn');
                expect(result).toContain('bg-blue-500');
                expect(result).toContain('text-white');
                expect(result).toContain('px-6');
                expect(result).toContain('py-3');
                expect(result).not.toContain('opacity-50');
            });

            it('powinien obsłużyć typowy przypadek karty', () => {
                const result = cn(
                    'rounded-lg border',
                    'p-4',
                    'bg-white dark:bg-gray-800',
                    'shadow-sm hover:shadow-md',
                    'transition-shadow duration-200',
                );
                
                expect(result).toContain('rounded-lg');
                expect(result).toContain('border');
                expect(result).toContain('p-4');
            });
        });
    });
});

