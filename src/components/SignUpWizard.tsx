import React, { useState, useEffect, useMemo } from 'react';
import { LighthouseLogo } from './LighthouseLogo';
import { ProfileSelector } from './ProfileCard';
import { 
  X, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  AlertCircle, 
  Loader2, 
  Building2, 
  Calendar as CalendarIcon, 
  Lock, 
  User, 
  Mail, 
  Sparkles,
  Briefcase
} from 'lucide-react';
import { RiskProfile, UserAccount, OnboardingDraft } from '../types';
import { apiRequest } from '../utils/apiClient';
import { getRecoveryKeyError } from '../utils/recoveryKey';
import { RecoveryKeyFields } from './RecoveryKeyFields';

interface SignUpWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserAccount, token?: string, isNewRegistration?: boolean) => void;
  onSwitchToLogin: () => void;
}

const ALYC_OPTIONS = [
  'Balanz Capital',
  'Bull Market Brokers',
  'IOL invertironline',
  'PPI (Portfolio Personal Inversiones)',
  'Cocos Capital',
  'Allaria Ledesma',
  'SBS Trading',
  'Cohen Aliados Financieros',
  'Puente',
  'Banco Galicia / Inversiones',
  'Otro ALyC / Broker'
];

export const SignUpWizard: React.FC<SignUpWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSwitchToLogin
}) => {
  // 3-step simplified signup: 1 = Cuenta, 2 = Datos y Consentimiento, 3 = Perfil de Inversor
  const [step, setStep] = useState<number>(1);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [confirmRecoveryKey, setConfirmRecoveryKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Personal data
  const [birthDate, setBirthDate] = useState('');
  const [country, setCountry] = useState('Argentina');
  const [city, setCity] = useState('Buenos Aires');
  const [timeZone] = useState('America/Argentina/Buenos_Aires');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [notificationsOptIn, setNotificationsOptIn] = useState(true);

  // Investor Profile & ALyC
  const [profile, setProfile] = useState<RiskProfile>('moderado');
  const [alyc, setAlyc] = useState('');

  // UI status
  const [isLoading, setIsLoading] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem('faros_onboarding_draft');
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft) as OnboardingDraft;
        if (parsed.name) setName(parsed.name);
        if (parsed.email) setEmail(parsed.email);
        if (parsed.birthDate) setBirthDate(parsed.birthDate);
        if (parsed.country) setCountry(parsed.country);
        if (parsed.city) setCity(parsed.city);
        if (parsed.profile) setProfile(parsed.profile);
        if (parsed.alyc) setAlyc(parsed.alyc);
        if (parsed.termsAccepted) setTermsAccepted(parsed.termsAccepted);
        // Passwords and recovery keys are never saved in drafts. Start at
        // Cuenta so both credentials can be entered before completing signup.
      }
    } catch {}
  }, []);

  // Auto-save draft on form change
  useEffect(() => {
    try {
      const draft: OnboardingDraft = {
        step,
        provider: 'email',
        name,
        email,
        birthDate,
        country,
        city,
        timeZone,
        termsAccepted,
        notificationsOptIn,
        profile,
        alyc,
        portfolioName: 'Mi Cartera',
        currency: 'USD',
        assets: [],
        sectors: ['deuda_soberana', 'energia', 'cedears_tech', 'balances', 'regulaciones_bcra', 'macro_tasas']
      };
      localStorage.setItem('faros_onboarding_draft', JSON.stringify(draft));
    } catch {}
  }, [
    step, name, email, birthDate, country, city,
    timeZone, termsAccepted, notificationsOptIn, profile, alyc
  ]);

  // Password strength calculation
  const passwordStrength = useMemo(() => {
    if (!password) return { label: 'Sin ingresar', score: 0, color: 'bg-slate-200' };
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { label: 'Débil', score: 1, color: 'bg-rose-500' };
    if (score <= 3) return { label: 'Media', score: 2, color: 'bg-amber-500' };
    return { label: 'Fuerte', score: 3, color: 'bg-emerald-600' };
  }, [password]);

  // Step validation and transition
  const handleNextStep = () => {
    setStepError(null);

    // Step 1: Cuenta
    if (step === 1) {
      if (!name.trim()) {
        setStepError('Ingresá tu nombre completo.');
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setStepError('Por favor ingresá un correo electrónico válido.');
        return;
      }
      if (password.length < 8) {
        setStepError('La contraseña debe tener un mínimo de 8 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setStepError('Las contraseñas ingresadas no coinciden.');
        return;
      }
      const recoveryError = getRecoveryKeyError(recoveryKey, password);
      if (recoveryError) { setStepError(recoveryError); return; }
      if (recoveryKey !== confirmRecoveryKey) { setStepError('Las claves de recuperación no coinciden.'); return; }
      setStep(2);
      return;
    }

    // Step 2: Datos y Consentimientos
    if (step === 2) {
      if (!birthDate) {
        setStepError('La fecha de nacimiento es obligatoria para validar mayoría de edad.');
        return;
      }
      const birth = new Date(birthDate);
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const monthDiff = now.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
        age--;
      }
      if (isNaN(age) || age < 18) {
        setStepError('Debés tener al menos 18 años de edad para operar en FAROS.');
        return;
      }
      if (!termsAccepted) {
        setStepError('Debés aceptar los Términos y Condiciones y la Política de Privacidad.');
        return;
      }
      setStep(3);
      return;
    }
  };

  // Final submit (Step 3) - Creates user with empty "Mi Cartera"
  const handleFinalSubmit = async () => {
    if (isLoading) return; // Prevent duplicate concurrent requests
    setIsLoading(true);
    setStepError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    const payload = {
      name: cleanName,
      email: normalizedEmail,
      password,
      recoveryKey,
      provider: 'email',
      birthDate,
      country,
      city,
      timeZone,
      termsAccepted: true,
      notificationsOptIn,
      profile,
      alyc: alyc || undefined,
      portfolioName: 'Mi Cartera',
      currency: 'USD',
      assets: [], // Explicitly clean and empty initial portfolio
      preferences: {
        prioritizedTopics: ['deuda_soberana', 'energia', 'cedears_tech', 'balances', 'regulaciones_bcra', 'macro_tasas']
      }
    };

    try {
      const data = await apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
      if (!data.success || !data.user) throw new Error('El servidor no confirmó la creación de la cuenta.');
      try { localStorage.removeItem('faros_onboarding_draft'); } catch {}
      setPassword(''); setConfirmPassword(''); setRecoveryKey(''); setConfirmRecoveryKey('');
      onSuccess(data.user, data.token, true);
    } catch (err: any) {
      setStepError(err?.message || 'No se pudo completar el registro.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div 
        className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Lighthouse Brand & Stepper */}
        <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LighthouseLogo size="md" />
              <div>
                <span className="font-extrabold text-xs uppercase tracking-wider text-emerald-950 font-sans block">
                  FAROS · Registro Simple
                </span>
                <h3 className="font-black text-slate-900 text-lg leading-tight">
                  Crear cuenta personal
                </h3>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Cerrar registro"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stepper Dots (3 Steps) */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { num: 1, label: 'Cuenta' },
              { num: 2, label: 'Datos & Términos' },
              { num: 3, label: 'Perfil de Inversión' }
            ].map(s => (
              <div key={s.num} className="space-y-1">
                <div className={`h-1.5 rounded-full transition-all duration-300 ${
                  step >= s.num ? 'bg-emerald-950' : 'bg-slate-200'
                }`} />
                <span className={`text-[10px] font-bold block truncate ${
                  step === s.num ? 'text-emerald-950' : 'text-slate-400'
                }`}>
                  {s.num}. {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1">
          {stepError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-semibold leading-relaxed">{stepError}</div>
            </div>
          )}

          {/* ================= STEP 1: CUENTA ================= */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Email Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nombre completo
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Mariano De Andrea"
                      autoCapitalize="words"
                      autoCorrect="off"
                      autoComplete="name"
                      spellCheck={false}
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu.nombre@ejemplo.com"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="email"
                      inputMode="email"
                      spellCheck={false}
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="new-password"
                      className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password strength indicator */}
                  {password && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">Fortaleza:</span>
                        <span className="font-bold text-slate-700">{passwordStrength.label}</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden flex gap-1">
                        <div className={`h-full flex-1 ${passwordStrength.score >= 1 ? passwordStrength.color : 'bg-slate-200'}`} />
                        <div className={`h-full flex-1 ${passwordStrength.score >= 2 ? passwordStrength.color : 'bg-slate-200'}`} />
                        <div className={`h-full flex-1 ${passwordStrength.score >= 3 ? passwordStrength.color : 'bg-slate-200'}`} />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repetí la contraseña ingresada"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="new-password"
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && <RecoveryKeyFields idPrefix="signup-recovery" value={recoveryKey} confirmation={confirmRecoveryKey} onChange={setRecoveryKey} onConfirmationChange={setConfirmRecoveryKey} />}

          {/* ================= STEP 2: DATOS Y TÉRMINOS ================= */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/90 text-xs text-emerald-950 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  Verificación regulatoria obligatoria
                </p>
                <p className="text-[11px] leading-relaxed text-emerald-900">
                  FAROS requiere validar que seas mayor de 18 años para habilitar el seguimiento financiero y la recepción de resúmenes informativos.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Fecha de nacimiento <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <CalendarIcon className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    País de residencia
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Ciudad
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                  />
                </div>
              </div>

              {/* Terms Checkbox */}
              <div className="pt-2 space-y-3">
                <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 hover:border-emerald-300 bg-white cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-emerald-800 focus:ring-emerald-700 cursor-pointer"
                  />
                  <span className="text-xs text-slate-700 leading-snug">
                    Acepto los <a href="#" onClick={(e) => e.preventDefault()} className="text-emerald-900 font-bold underline">Términos del Servicio</a> y la <a href="#" onClick={(e) => e.preventDefault()} className="text-emerald-900 font-bold underline">Política de Privacidad</a> de FAROS. <span className="text-rose-500">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 hover:border-emerald-300 bg-white cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={notificationsOptIn}
                    onChange={(e) => setNotificationsOptIn(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-emerald-800 focus:ring-emerald-700 cursor-pointer"
                  />
                  <span className="text-xs text-slate-600 leading-snug">
                    Deseo recibir alertas de mercado relevantes y el pulso diario de noticias en mi correo.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* ================= STEP 3: PERFIL DE INVERSIÓN ================= */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-950 block mb-1">
                  Tu perfil inversor
                </span>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Permite calibrar la interpretación y el contexto de las noticias financieras. Podés modificarlo en cualquier momento desde tu cartera.
                </p>
              </div>

              {/* Profile Cards */}
              <ProfileSelector
                value={profile}
                onChange={setProfile}
              />

              {/* ALyC Selector (Optional) */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Tu ALyC / Broker principal (opcional)</span>
                </label>
                <select
                  value={alyc}
                  onChange={(e) => setAlyc(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50 cursor-pointer"
                >
                  <option value="">Seleccioná tu broker o ALyC (opcional)</option>
                  {ALYC_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Highlight Note: Zero tickers required at signup */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 text-xs text-emerald-950 space-y-1.5 shadow-2xs">
                <div className="flex items-center gap-2 font-black text-emerald-950">
                  <Sparkles className="w-4 h-4 text-emerald-700" />
                  <span>Tu cartera se creará limpia y vacía</span>
                </div>
                <p className="text-[11px] text-emerald-900 leading-relaxed font-normal">
                  No necesitás cargar tickers ni montos ahora. Al ingresar a FAROS vas a poder incorporar tus activos favoritos, definir si tu posición es <strong>LONG</strong> o <strong>SHORT</strong>, y personalizar tus fuentes a tu propio ritmo.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 sm:px-8 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                setStepError(null);
                setStep(step - 1);
              }}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Anterior</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-xs font-bold text-emerald-900 hover:text-emerald-950 cursor-pointer"
            >
              ¿Ya tenés cuenta? Iniciar sesión
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-emerald-950 hover:bg-emerald-900 text-white text-xs font-extrabold rounded-xl transition-all shadow-xs cursor-pointer ml-auto"
            >
              <span>Continuar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-950 hover:bg-emerald-900 text-white text-xs font-extrabold rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 ml-auto"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-300" />
                  <span>Creando cuenta...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-emerald-300 stroke-[3]" />
                  <span>Crear mi cuenta en FAROS</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
