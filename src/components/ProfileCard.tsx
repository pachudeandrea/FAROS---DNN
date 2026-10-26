import React from 'react';
import { Check } from 'lucide-react';
import { RiskProfile } from '../types';

export interface ProfileOption {
  id: RiskProfile;
  title: string;
}

export const PROFILE_OPTIONS: ProfileOption[] = [
  { id: 'conservador', title: 'Conservador' },
  { id: 'moderado', title: 'Moderado' },
  { id: 'dinamico', title: 'Dinámico' }
];

interface ProfileCardProps {
  id: RiskProfile;
  title: string;
  isSelected: boolean;
  onSelect: (id: RiskProfile) => void;
  disabled?: boolean;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({
  id,
  title,
  isSelected,
  onSelect,
  disabled = false
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && !disabled) {
      e.preventDefault();
      onSelect(id);
    }
  };

  return (
    <div
      role="radio"
      aria-checked={isSelected}
      aria-label={title}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onSelect(id)}
      onKeyDown={handleKeyDown}
      className={`cursor-pointer min-h-[44px] py-3 px-4 rounded-xl sm:rounded-2xl border text-center transition-all select-none flex items-center justify-center relative focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1 ${
        isSelected
          ? 'border-emerald-800 bg-emerald-50/80 shadow-xs ring-1 ring-emerald-800 font-bold text-emerald-950'
          : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/60 text-slate-800 font-medium'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className="text-sm tracking-tight">{title}</span>
      {isSelected && (
        <div 
          className="absolute right-3 w-5 h-5 rounded-full bg-emerald-800 text-white flex items-center justify-center shrink-0 shadow-xs"
          aria-hidden="true"
        >
          <Check className="w-3 h-3 stroke-[3]" />
        </div>
      )}
    </div>
  );
};

interface ProfileSelectorProps {
  value: RiskProfile;
  onChange: (profile: RiskProfile) => void;
  disabled?: boolean;
  className?: string;
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  className = ''
}) => {
  return (
    <div
      role="radiogroup"
      aria-label="Perfil de inversor"
      className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${className}`}
    >
      {PROFILE_OPTIONS.map(opt => (
        <ProfileCard
          key={opt.id}
          id={opt.id}
          title={opt.title}
          isSelected={value === opt.id}
          onSelect={onChange}
          disabled={disabled}
        />
      ))}
    </div>
  );
};
