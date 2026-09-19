import React from 'react';

interface ReceiptoLogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  wordmarkClassName?: string;
}

const SIZE_MAP = {
  xs: 'w-6 h-6 rounded-lg',
  sm: 'w-8 h-8 rounded-xl',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-14 h-14 rounded-2xl',
  xl: 'w-16 h-16 rounded-2xl',
};

export function ReceiptoLogo({
  className = '',
  size = 'md',
  showWordmark = false,
  wordmarkClassName = 'text-slate-900 dark:text-white font-extrabold tracking-tight',
}: ReceiptoLogoProps) {
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div className={`inline-flex items-center gap-3.5 sm:gap-4 select-none ${className}`}>
      <div
        className={`relative ${sizeClass} overflow-hidden shadow-md shadow-blue-600/20 ring-1 ring-blue-500/30 shrink-0 bg-slate-900 transition-transform duration-200 hover:scale-[1.02]`}
      >
        <img
          src="/logo.png"
          alt="Receipto Logo"
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          loading="eager"
        />
      </div>
      {showWordmark && (
        <span className={wordmarkClassName}>
          Receipto
        </span>
      )}
    </div>
  );
}
