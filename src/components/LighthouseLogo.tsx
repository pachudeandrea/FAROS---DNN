import React from 'react';

interface LighthouseLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showContainer?: boolean;
}

export const LighthouseLogo: React.FC<LighthouseLogoProps> = ({ 
  className = '', 
  size = 'md',
  showContainer = true 
}) => {
  const containerSizeMap = {
    sm: 'w-7 h-7 p-1 rounded-lg',
    md: 'w-9 h-9 p-1.5 rounded-xl',
    lg: 'w-11 h-11 p-2 rounded-2xl',
    xl: 'w-14 h-14 p-2.5 rounded-2xl'
  };

  const svgSizeMap = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-7 h-7',
    xl: 'w-9 h-9'
  };

  const svgIcon = (
    <svg 
      className={showContainer ? svgSizeMap[size] : className || svgSizeMap[size]} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* FAROS Lighthouse Logo: Stylized beacon with dual light beams, lantern windows & ocean waves in pure white */}
      <g fill="currentColor">
        {/* 1. Roof Cap (Triangular pointed dome) */}
        <path d="M 50 11.5 L 58.5 22.5 L 41.5 22.5 Z" />

        {/* 2. Lantern Room with 3 Rectangular Window Panes */}
        <path 
          fillRule="evenodd" 
          clipRule="evenodd" 
          d="
            M 42 24 
            L 58 24 
            L 58.5 31 
            L 41.5 31 Z 
            M 43.8 26 L 46.8 26 L 46.8 29.5 L 43.8 29.5 Z 
            M 48.5 26 L 51.5 26 L 51.5 29.5 L 48.5 29.5 Z 
            M 53.2 26 L 56.2 26 L 56.2 29.5 L 53.2 29.5 Z
          " 
        />

        {/* 3. Gallery Platform / Railing */}
        <rect x="39" y="32" width="22" height="3" rx="0.5" />

        {/* 4. Tower Upper Transom Bar & Slit */}
        <path 
          fillRule="evenodd" 
          clipRule="evenodd" 
          d="
            M 41.5 36.5 L 58.5 36.5 L 59 41.5 L 41 41.5 Z
            M 43.5 38 L 56.5 38 L 56.5 40 L 43.5 40 Z
          " 
        />

        {/* 5. Tower Outer Walls (Left & Right tapered walls) */}
        <path d="M 41 43 L 46 43 L 39.5 81 L 34.5 81 Z" />
        <path d="M 59 43 L 54 43 L 60.5 81 L 65.5 81 Z" />

        {/* 6. Three Vertically Stacked Center Windows */}
        <rect x="47.75" y="47.5" width="4.5" height="4.5" rx="0.5" />
        <rect x="47.75" y="57" width="4.5" height="4.5" rx="0.5" />
        <rect x="47.75" y="66.5" width="4.5" height="4.5" rx="0.5" />

        {/* 7. Arched Doorway at Base */}
        <path d="M 45 81 L 45 76 A 5 5 0 0 1 55 76 L 55 81 Z" />

        {/* 8. Light Beams (Dual tapered rays to left & right) */}
        {/* Left upper ray */}
        <path d="M 37.5 24.5 L 15 22 L 18 27 L 37.5 26.5 Z" />
        {/* Left lower ray */}
        <path d="M 37.5 29.5 L 18 31 L 20.5 34 L 37.5 31.5 Z" />
        {/* Right upper ray */}
        <path d="M 62.5 24.5 L 85 22 L 82 27 L 62.5 26.5 Z" />
        {/* Right lower ray */}
        <path d="M 62.5 29.5 L 82 31 L 79.5 34 L 62.5 31.5 Z" />

        {/* 9. Dynamic Ocean Waves at Base */}
        {/* Upper swooping wave */}
        <path d="
          M 22 74 
          C 30 83, 42 87, 54 85.5 
          C 65 84, 74 78, 83 78 
          C 77 83, 66 88, 54 88.5 
          C 41 89, 30 84, 22 74 Z
        " />
        {/* Lower swooping wave */}
        <path d="
          M 32 83 
          C 43 90, 54 92, 66 91.5 
          C 74 91, 78 89, 81 87 
          C 75 91, 65 93.5, 53 93.5 
          C 42 93.5, 35 89, 32 83 Z
        " />
      </g>
    </svg>
  );

  if (!showContainer) {
    return svgIcon;
  }

  return (
    <div className={`inline-flex items-center justify-center shrink-0 bg-emerald-950 text-white border border-emerald-800/80 shadow-xs ${containerSizeMap[size]} ${className}`}>
      {svgIcon}
    </div>
  );
};
