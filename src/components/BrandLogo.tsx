import React from 'react';
interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'light' | 'dark' | 'gray';
  variant?: 'symbol' | 'full';
  showContainer?: boolean;
}
/** Original artwork extracted from Faros.pdf. Never tint with currentColor or CSS filters. */
export function BrandLogo({ className = '', size = 'md', tone = 'light', variant = 'symbol' }: BrandLogoProps) {
  const sizes = variant === 'full'
    ? { sm: 'w-10 h-12', md: 'w-10 h-12', lg: 'w-14 h-18', xl: 'w-20 h-26' }
    : { sm: 'w-7 h-7', md: 'w-9 h-9', lg: 'w-11 h-11', xl: 'w-14 h-14' };
  return <span className={`brand-logo brand-logo-${variant} ${sizes[size]} ${className}`}>
    <img src={`/brand/faros-${variant === 'full' ? 'logo' : 'symbol'}-${tone}.svg`} alt="Faros" draggable={false} />
  </span>;
}
