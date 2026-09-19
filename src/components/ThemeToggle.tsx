import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.js';

interface ThemeToggleProps {
  className?: string;
  variant?: 'segmented' | 'compact';
}

export function ThemeToggle({ className = '', variant = 'compact' }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  if (variant === 'compact') {
    return (
      <div
        role="group"
        aria-label="Theme mode switcher"
        className={`inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition-colors shadow-xs ${className}`}
      >
        {/* Sun Button -> Sets Light Mode */}
        <button
          type="button"
          id="btn-theme-sun"
          onClick={() => setTheme('light')}
          className={`p-1.5 rounded-lg transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-amber-400 ${
            theme === 'light'
              ? 'bg-white text-amber-500 shadow-xs border border-slate-200/80 scale-100 font-semibold'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:scale-105'
          }`}
          aria-label="Turn webpage to Light mode"
          title="Turn webpage to Light mode (Sun)"
          aria-pressed={theme === 'light'}
        >
          <Sun className={`w-4 h-4 transition-transform duration-200 ${theme === 'light' ? 'rotate-0 text-amber-500 stroke-[2.2]' : '-rotate-45'}`} />
        </button>

        {/* Moon Button -> Sets Dark Mode */}
        <button
          type="button"
          id="btn-theme-moon"
          onClick={() => setTheme('dark')}
          className={`p-1.5 rounded-lg transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            theme === 'dark'
              ? 'bg-slate-800 text-indigo-400 shadow-xs border border-slate-700 scale-100 font-semibold'
              : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 hover:scale-105'
          }`}
          aria-label="Turn webpage to Dark mode"
          title="Turn webpage to Dark mode (Moon)"
          aria-pressed={theme === 'dark'}
        >
          <Moon className={`w-4 h-4 transition-transform duration-200 ${theme === 'dark' ? 'rotate-0 text-indigo-400 stroke-[2.2]' : 'rotate-12'}`} />
        </button>
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme mode switcher"
      className={`inline-flex items-center p-1 rounded-xl border backdrop-blur-xs transition-colors ${
        theme === 'dark'
          ? 'bg-slate-900 border-slate-800'
          : 'bg-slate-100 border-slate-200'
      } ${className}`}
    >
      {/* Sun Button (Light Mode) */}
      <button
        type="button"
        role="radio"
        aria-checked={theme === 'light'}
        id="btn-theme-sun-seg"
        onClick={() => setTheme('light')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-amber-400 ${
          theme === 'light'
            ? 'bg-white text-amber-600 shadow-xs border border-slate-200'
            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
        title="Turn webpage to Light mode (Sun)"
      >
        <Sun className="w-3.5 h-3.5 text-amber-500" />
        <span>Light</span>
      </button>

      {/* Moon Button (Dark Mode) */}
      <button
        type="button"
        role="radio"
        aria-checked={theme === 'dark'}
        id="btn-theme-moon-seg"
        onClick={() => setTheme('dark')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          theme === 'dark'
            ? 'bg-slate-800 text-indigo-300 shadow-xs border border-slate-700/80'
            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
        title="Turn webpage to Dark mode (Moon)"
      >
        <Moon className="w-3.5 h-3.5 text-indigo-400" />
        <span>Dark</span>
      </button>
    </div>
  );
}
