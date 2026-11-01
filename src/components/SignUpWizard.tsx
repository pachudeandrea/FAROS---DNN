import { usePendingChanges } from '../hooks/usePendingChanges';
import { useModalFocus } from '../hooks/useModalFocus';
import React, { useState, useEffect, useMemo } from 'react';
import { BrandLogo } from './BrandLogo';
import { 
  X, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  Loader2, 
  Lock, 
  User, 
  Mail, 
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

export const SignUpWizard: React.FC<SignUpWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSwitchToLogin
}) => {
  const modalRef = useModalFocus(onClose);
  // Two steps: account credentials, then required age and consent.
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
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [timeZone] = useState('America/Argentina/Buenos_Aires');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [notificationsOptIn, setNotificationsOptIn] = useState(false);

  // Retain values from older drafts; new accounts configure these later.
  const [profile, setProfile] = useState<RiskProfile>('moderado');
  const [alyc, setAlyc] = useState('');

  // UI status
  const [isLoading, setIsLoading] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  usePendingChanges(isOpen && (!!name || !!email || !!password || !!recoveryKey || isLoading));

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
    if (!password) return { label: 'Sin ingresar', score: 0, color: 'bg-ink-200' };
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { label: 'Débil', score: 1, color: 'bg-danger-500' };
    if (score <= 3) return { label: 'Media', score: 2, color: 'bg-warning-500' };
    return { label: 'Fuerte', score: 3, color: 'bg-brand-600' };
  }, [password]);

  // Step validation and transition
  const handleNextStep = () => {
    setStepError(null);

    // Step 1: Cuenta
    if (step === 1) {
      if (!name.trim()) {
        setStepError('Ingresá tu nombre.');
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
      if (recoveryKey !== confirmRecoveryKey) { setStepError('Los códigos de recuperación no coinciden.'); return; }
      setStep(2);
      return;
    }


  };

  // Final submit (Step 2) - Creates user with empty "Mi Cartera"
  const handleFinalSubmit = async () => {
    const birth = new Date(birthDate + 'T00:00:00');
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
    if (!birthDate || !Number.isFinite(age) || age < 18) { setStepError('Ingresá tu fecha de nacimiento. Debés tener al menos 18 años para usar FAROS.'); return; }
    if (!termsAccepted) { setStepError('Aceptá los Términos del Servicio y la Política de Privacidad para crear tu cuenta.'); return; }
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
      country: country || undefined,
      city: city || undefined,
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div 
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signup-title"
        className="bg-paper rounded-3xl max-w-xl w-full border border-ink-200 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-1.5rem)] transition-none animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Lighthouse Brand & Stepper */}
        <div className="shrink-0 px-4 sm:px-8 pt-6 pb-4 border-b border-ink-100 bg-gradient-to-b from-ink-50 to-paper">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BrandLogo size="md" variant="full" />
              <div>
                <span className="font-extrabold text-xs uppercase tracking-wider text-brand-950 font-sans block">
                  FAROS · Registro Simple
                </span>
                <h3 id="signup-title" className="font-bold text-ink-900 text-lg leading-tight">
                  Crear cuenta personal
                </h3>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-muted hover:text-muted rounded-full hover:bg-ink-100 transition-colors cursor-pointer"
              aria-label="Cerrar registro"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stepper Dots (3 Steps) */}
          <div className="mt-5 grid grid-cols-2 gap-2">
            {[
              { num: 1, label: 'Cuenta' },
              { num: 2, label: 'Términos y listo' }
            ].map(s => (
              <div key={s.num} className="space-y-1">
                <div className={`h-1.5 rounded-full transition-all duration-300 ${
                  step >= s.num ? 'bg-brand-950' : 'bg-ink-200'
                }`} />
                <span className={`text-[10px] font-bold block truncate ${
                  step === s.num ? 'text-brand-950' : 'text-muted'
                }`}>
                  {s.num}. {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="min-h-0 p-4 sm:p-8 overflow-y-auto space-y-6 flex-1">
          {stepError && (
            <div role="alert" className="p-3.5 rounded-2xl bg-danger-50 border border-danger-200 text-danger-900 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-semibold leading-relaxed">{stepError}</div>
            </div>
          )}

          {/* ================= STEP 1: CUENTA ================= */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Email Form */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="signup-name" className="block text-xs font-bold text-muted mb-1.5">
                    Nombre
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-3.5 text-muted" />
                    <input id="signup-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Tu nombre"
                      autoCapitalize="words"
                      autoCorrect="off"
                      autoComplete="name"
                      spellCheck={false}
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-ink-300 focus:outline-none focus:border-brand-800 bg-ink-50/50"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-email" className="block text-xs font-bold text-muted mb-1.5">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-muted" />
                    <input id="signup-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu.nombre@ejemplo.com"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="email"
                      inputMode="email"
                      spellCheck={false}
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-ink-300 focus:outline-none focus:border-brand-800 bg-ink-50/50"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-password" className="block text-xs font-bold text-muted mb-1.5">
                    Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-muted" />
                    <input id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="new-password"
                      className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-ink-300 focus:outline-none focus:border-brand-800 bg-ink-50/50"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      className="absolute right-0 top-0 text-muted flex items-center justify-center"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password strength indicator */}
                  {password && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted">Fortaleza:</span>
                        <span className="font-bold text-muted">{passwordStrength.label}</span>
                      </div>
                      <div className="h-1 bg-ink-100 rounded-full overflow-hidden flex gap-1">
                        <div className={`h-full flex-1 ${passwordStrength.score >= 1 ? passwordStrength.color : 'bg-ink-200'}`} />
                        <div className={`h-full flex-1 ${passwordStrength.score >= 2 ? passwordStrength.color : 'bg-ink-200'}`} />
                        <div className={`h-full flex-1 ${passwordStrength.score >= 3 ? passwordStrength.color : 'bg-ink-200'}`} />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="signup-confirm" className="block text-xs font-bold text-muted mb-1.5">
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-muted" />
                    <input id="signup-confirm"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repetí la contraseña ingresada"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="new-password"
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-ink-300 focus:outline-none focus:border-brand-800 bg-ink-50/50"
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
              <p className="text-base text-muted">Tu cuenta está a un paso. Después podés elegir tus activos y ajustar tu perfil desde Mi cartera.</p>
              <label htmlFor="signup-birth-date" className="block text-sm font-semibold text-muted">Fecha de nacimiento
                <input id="signup-birth-date" type="date" autoComplete="bday" value={birthDate} onChange={event => setBirthDate(event.target.value)} max={new Date().toISOString().slice(0,10)} required className="block w-full mt-2 px-3 py-3 rounded-xl border border-ink-300 bg-paper" />
                <span className="block mt-1 text-sm font-normal text-muted">Para confirmar que tenés al menos 18 años.</span>
              </label>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-ink-200 hover:border-brand-300 bg-paper cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-brand-800 focus:ring-brand-700 cursor-pointer"
                  />
                  <span className="text-xs text-muted leading-snug">
                    Acepto los <a href="#" onClick={(e) => e.preventDefault()} className="text-brand-900 font-bold underline">Términos del Servicio</a> y la <a href="#" onClick={(e) => e.preventDefault()} className="text-brand-900 font-bold underline">Política de Privacidad</a> de FAROS. <span className="text-danger-500">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-ink-200 hover:border-brand-300 bg-paper cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={notificationsOptIn}
                    onChange={(e) => setNotificationsOptIn(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-brand-800 focus:ring-brand-700 cursor-pointer"
                  />
                  <span className="text-xs text-muted leading-snug">
                    Me interesa recibir alertas sobre mi cartera. Podré activarlas al ingresar y elegir si permito las notificaciones.
                  </span>
                </label>
              </div>
            </div>
          )}


        </div>

        {/* Modal Footer Controls */}
        <div className="shrink-0 px-4 sm:px-8 py-4 border-t border-ink-100 bg-ink-50 flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                setStepError(null);
                setStep(step - 1);
              }}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-muted hover:text-ink-900 hover:bg-ink-200/60 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Anterior</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-xs font-bold text-brand-900 hover:text-brand-950 cursor-pointer"
            >
              ¿Ya tenés cuenta? Iniciar sesión
            </button>
          )}

          {step < 2 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-brand-950 hover:bg-brand-900 text-paper text-xs font-extrabold rounded-xl transition-all shadow-xs cursor-pointer ml-auto"
            >
              <span>Continuar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-950 hover:bg-brand-900 text-paper text-xs font-extrabold rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 ml-auto"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-brand-300" />
                  <span>Creando cuenta...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-brand-300 stroke-[3]" />
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
