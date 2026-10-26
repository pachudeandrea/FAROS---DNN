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
  Shield, 
  ShieldCheck, 
  Search, 
  Plus, 
  Trash2, 
  AlertCircle, 
  Loader2, 
  Building2, 
  Calendar as CalendarIcon, 
  DollarSign, 
  Bell, 
  CheckCircle2,
  Lock,
  User,
  Mail,
  Info
} from 'lucide-react';
import { RiskProfile, UserAccount, Portfolio, OnboardingDraft, OnboardingAssetEntry } from '../types';
import { MOCK_ASSETS, MOCK_PORTFOLIOS } from '../data/mockData';

interface SignUpWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserAccount, token?: string) => void;
  onSwitchToLogin: () => void;
  initialTempUser?: {
    email: string;
    name: string;
    provider: 'google' | 'microsoft';
    picture?: string;
    googleSub?: string;
    microsoftOid?: string;
  } | null;
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

const SECTORS_LIST = [
  { id: 'deuda_soberana', label: 'Deuda Soberana & Bonos USD' },
  { id: 'energia', label: 'Petróleo, Gas & Vaca Muerta' },
  { id: 'cedears_tech', label: 'Big Tech & Semiconductores' },
  { id: 'balances', label: 'Balances Corporativos' },
  { id: 'regulaciones_bcra', label: 'Normativa Cambiaria & BCRA' },
  { id: 'macro_tasas', label: 'Inflación & Tasas Mayoristas' }
];

export const SignUpWizard: React.FC<SignUpWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSwitchToLogin,
  initialTempUser
}) => {
  // Wizard Step: 1 = Cuenta, 2 = Datos Personales, 3 = Perfil, 4 = Cartera, 5 = Confirmación
  const [step, setStep] = useState<number>(1);

  // Form State
  const [authProvider, setAuthProvider] = useState<'email' | 'google' | 'microsoft'>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Personal data
  const [birthDate, setBirthDate] = useState('');
  const [country, setCountry] = useState('Argentina');
  const [city, setCity] = useState('Buenos Aires');
  const [phone, setPhone] = useState('');
  const [timeZone, setTimeZone] = useState('America/Argentina/Buenos_Aires');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [notificationsOptIn, setNotificationsOptIn] = useState(true);

  // Investor Profile
  const [profile, setProfile] = useState<RiskProfile>('moderado');
  const [alyc, setAlyc] = useState('');

  // Portfolio
  const [portfolioName, setPortfolioName] = useState('Mi Cartera Personal');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('USD');
  const [assets, setAssets] = useState<OnboardingAssetEntry[]>([
    { symbol: 'AL30', name: 'Bonar 2030 USD Ley Arg.', category: 'bonos' },
    { symbol: 'GD30', name: 'Global 2030 USD Ley NY', category: 'bonos' }
  ]);
  const [assetSearch, setAssetSearch] = useState('');

  // Preferences
  const [selectedSectors, setSelectedSectors] = useState<string[]>([
    'deuda_soberana',
    'energia',
    'regulaciones_bcra'
  ]);

  // UI status
  const [isLoading, setIsLoading] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<{ provider: string; message: string } | null>(null);
  const [oauthGoogleSub, setOauthGoogleSub] = useState<string | null>(null);
  const [oauthMicrosoftOid, setOauthMicrosoftOid] = useState<string | null>(null);
  const [oauthPicture, setOauthPicture] = useState<string | null>(null);
  const [oauthErrorProvider, setOauthErrorProvider] = useState<'google' | 'microsoft' | null>(null);

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
        if (parsed.phone) setPhone(parsed.phone);
        if (parsed.profile) setProfile(parsed.profile);
        if (parsed.alyc) setAlyc(parsed.alyc);
        if (parsed.portfolioName) setPortfolioName(parsed.portfolioName);
        if (parsed.currency) setCurrency(parsed.currency);
        if (Array.isArray(parsed.assets) && parsed.assets.length > 0) setAssets(parsed.assets);
        if (Array.isArray(parsed.sectors)) setSelectedSectors(parsed.sectors);
        if (parsed.termsAccepted) setTermsAccepted(parsed.termsAccepted);
        if (parsed.step && parsed.step > 1 && parsed.step <= 5) setStep(parsed.step);
      }
    } catch {}
  }, []);

  // Hydrate if coming from Google/Microsoft OAuth popup
  useEffect(() => {
    if (initialTempUser) {
      if (initialTempUser.name) setName(initialTempUser.name);
      if (initialTempUser.email) setEmail(initialTempUser.email);
      if (initialTempUser.provider) setAuthProvider(initialTempUser.provider);
      if (initialTempUser.googleSub) setOauthGoogleSub(initialTempUser.googleSub);
      if (initialTempUser.microsoftOid) setOauthMicrosoftOid(initialTempUser.microsoftOid);
      if (initialTempUser.picture) setOauthPicture(initialTempUser.picture);
      // Skip password step when OAuth provider is used
      setStep(2);
    }
  }, [initialTempUser]);

  // Auto-save draft on form change
  useEffect(() => {
    try {
      const draft: OnboardingDraft = {
        step,
        provider: authProvider,
        name,
        email,
        birthDate,
        country,
        city,
        phone,
        timeZone,
        termsAccepted,
        notificationsOptIn,
        profile,
        alyc,
        portfolioName,
        currency,
        assets,
        sectors: selectedSectors
      };
      localStorage.setItem('faros_onboarding_draft', JSON.stringify(draft));
    } catch {}
  }, [
    step, authProvider, name, email, birthDate, country, city, phone,
    timeZone, termsAccepted, notificationsOptIn, profile, alyc,
    portfolioName, currency, assets, selectedSectors
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

  // Google OAuth popup
  const handleGoogleOAuth = async () => {
    setStepError(null);
    setOauthNotice(null);
    try {
      const res = await fetch('/api/auth/google/url');
      const data = await res.json();
      if (!data.configured) {
        setOauthNotice({
          provider: 'Google',
          message: data.instructions || 'Faltan configurar credenciales GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en las variables de entorno.'
        });
        return;
      }
      openOAuthPopup(data.url);
    } catch {
      setStepError('No se pudo conectar con Google.');
    }
  };

  // Microsoft OAuth popup
  const handleMicrosoftOAuth = async () => {
    setStepError(null);
    setOauthNotice(null);
    try {
      const res = await fetch('/api/auth/microsoft/url');
      const data = await res.json();
      if (!data.configured) {
        setOauthNotice({
          provider: 'Microsoft',
          message: data.instructions || 'Faltan configurar credenciales MICROSOFT_CLIENT_ID y MICROSOFT_CLIENT_SECRET en las variables de entorno.'
        });
        return;
      }
      openOAuthPopup(data.url);
    } catch {
      setStepError('No se pudo conectar con Microsoft.');
    }
  };

  const openOAuthPopup = (authUrl: string) => {
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      authUrl,
      'faros_oauth_signup',
      `toolbar=no, location=no, status=no, menubar=no, scrollbars=yes, resizable=yes, width=${width}, height=${height}, top=${top}, left=${left}`
    );

    if (!popup) {
      setStepError('El navegador bloqueó la ventana emergente. Por favor habilitá popups para continuar.');
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        window.removeEventListener('message', handleMessage);
        onSuccess(event.data.user, event.data.token);
        localStorage.removeItem('faros_onboarding_draft');
        onClose();
      } else if (event.data?.type === 'OAUTH_AUTH_NEW_USER') {
        window.removeEventListener('message', handleMessage);
        const temp = event.data.tempUser;
        if (temp?.name) setName(temp.name);
        if (temp?.email) setEmail(temp.email);
        if (temp?.provider) setAuthProvider(temp.provider);
        if (temp?.googleSub) setOauthGoogleSub(temp.googleSub);
        if (temp?.microsoftOid) setOauthMicrosoftOid(temp.microsoftOid);
        if (temp?.picture) setOauthPicture(temp.picture);
        setStep(2); // Advance directly to personal details
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR' || event.data?.error) {
        window.removeEventListener('message', handleMessage);
        setStepError(event.data.error || 'Error al conectar con el proveedor.');
        setOauthErrorProvider(event.data.provider || null);
      }
    };

    window.addEventListener('message', handleMessage);
  };

  // Step validation before advancing
  const handleNextStep = () => {
    setStepError(null);

    // Step 1: Cuenta
    if (step === 1) {
      if (authProvider === 'email') {
        if (!name.trim()) {
          setStepError('Por favor ingresá tu nombre completo.');
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
      }
      setStep(2);
      return;
    }

    // Step 2: Datos Personales
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

    // Step 3: Perfil de Inversor
    if (step === 3) {
      if (!profile) {
        setStepError('Por favor seleccioná tu perfil de inversor.');
        return;
      }
      setStep(4);
      return;
    }

    // Step 4: Cartera
    if (step === 4) {
      if (assets.length === 0) {
        setStepError('Por favor agregá al menos un activo a tu cartera (ej: AL30, GD30, YPFD).');
        return;
      }
      setStep(5);
      return;
    }
  };

  // Final submit (Step 5)
  const handleFinalSubmit = async () => {
    setIsLoading(true);
    setStepError(null);

    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: authProvider === 'email' ? password : undefined,
        provider: authProvider,
        googleSub: oauthGoogleSub || undefined,
        microsoftOid: oauthMicrosoftOid || undefined,
        picture: oauthPicture || undefined,
        birthDate,
        country,
        city,
        phone,
        timeZone,
        termsAccepted,
        notificationsOptIn,
        profile,
        alyc,
        portfolioName: portfolioName.trim() || 'Mi Cartera Personal',
        currency,
        assets: assets.map(a => ({
          symbol: a.symbol,
          quantity: a.quantity,
          avgPrice: a.avgPrice,
          buyDate: a.buyDate
        })),
        preferences: {
          prioritizedTopics: selectedSectors
        }
      };

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al completar el registro.');
      }

      localStorage.removeItem('faros_onboarding_draft');
      onSuccess(data.user, data.token);
      onClose();
    } catch (err: any) {
      setStepError(err.message || 'Error al crear la cuenta. Por favor revisá los datos.');
    } finally {
      setIsLoading(false);
    }
  };

  // Asset autocomplete and addition
  const availableToAdd = useMemo(() => {
    if (!assetSearch.trim()) return [];
    const q = assetSearch.toLowerCase().trim();
    return MOCK_ASSETS.filter(a => 
      (a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) &&
      !assets.some(x => x.symbol.toUpperCase() === a.symbol.toUpperCase())
    ).slice(0, 5);
  }, [assetSearch, assets]);

  const handleAddAsset = (symbol: string, assetName?: string, category?: any) => {
    const cleanSym = symbol.toUpperCase().trim();
    if (!cleanSym) return;
    if (assets.some(a => a.symbol === cleanSym)) return;

    setAssets(prev => [
      ...prev,
      {
        symbol: cleanSym,
        name: assetName || cleanSym,
        category: category || 'bonos'
      }
    ]);
    setAssetSearch('');
  };

  const handleRemoveAsset = (symbol: string) => {
    setAssets(prev => prev.filter(a => a.symbol !== symbol));
  };

  const handleUpdateAssetField = (symbol: string, field: 'quantity' | 'avgPrice' | 'buyDate', value: any) => {
    setAssets(prev => prev.map(a => {
      if (a.symbol === symbol) {
        return { ...a, [field]: value };
      }
      return a;
    }));
  };

  const toggleSector = (sectorId: string) => {
    setSelectedSectors(prev => 
      prev.includes(sectorId) ? prev.filter(s => s !== sectorId) : [...prev, sectorId]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] text-slate-800">
        
        {/* Header with Step Progress */}
        <div className="bg-emerald-950 p-6 text-white relative shrink-0">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-emerald-300 hover:text-white p-1 rounded-full hover:bg-emerald-900 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2.5">
            <LighthouseLogo size="sm" showContainer={false} className="w-5 h-5 text-white" />
            <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
              Onboarding FAROS · Paso {step} de 5
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-emerald-900/80 h-1.5 rounded-full overflow-hidden mb-3">
            <div 
              className="bg-emerald-400 h-full transition-all duration-300 rounded-full"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white">
            {step === 1 && 'Creá tu cuenta de inversor'}
            {step === 2 && 'Datos personales y cumplimiento'}
            {step === 3 && 'Seleccioná tu perfil'}
            {step === 4 && 'Cargá los activos de tu cartera'}
            {step === 5 && 'Preferencias y confirmación'}
          </h2>
          <p className="text-xs text-emerald-100/80 mt-1">
            {step === 1 && 'Acceso seguro con Google, Microsoft o credenciales directas.'}
            {step === 2 && 'Información protegida para verificar mayoría de edad y avisos.'}
            {step === 3 && 'Ajustá el modelo para calibrar el feed de noticias sin explicaciones innecesarias.'}
            {step === 4 && 'Los activos que elijas alimentarán tu feed y el calendario de vencimientos.'}
            {step === 5 && 'Revisá el resumen final y comenzá a monitorear el mercado.'}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Step Error Notice */}
          {stepError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{stepError}</span>
              </div>
              {oauthErrorProvider && (
                <div className="pl-6 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStepError(null);
                      if (oauthErrorProvider === 'google') handleGoogleOAuth();
                      else handleMicrosoftOAuth();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-rose-300 hover:bg-rose-100/60 rounded-lg text-rose-900 font-bold text-[11px] cursor-pointer transition-colors shadow-2xs"
                  >
                    <span>Reintentar con {oauthErrorProvider === 'google' ? 'Google' : 'Microsoft'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* OAuth Notice */}
          {oauthNotice && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Configuración de {oauthNotice.provider} requerida</span>
              </div>
              <p className="text-[11px] text-amber-800/90 leading-relaxed">
                {oauthNotice.message}
              </p>
            </div>
          )}

          {/* STEP 1: CUENTA */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleGoogleOAuth}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 flex items-center justify-center gap-3 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                  </svg>
                  <span>Continuar con Google</span>
                </button>

                <button
                  type="button"
                  onClick={handleMicrosoftOAuth}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 flex items-center justify-center gap-3 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 21 21">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                  </svg>
                  <span>Continuar con Microsoft</span>
                </button>
              </div>

              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 border-t border-slate-200" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">o registrate con email</span>
                <div className="flex-1 border-t border-slate-200" />
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Nombre y Apellido *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ej: Mariano De Andrea"
                      className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Correo electrónico *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="inversor@ejemplo.com"
                      className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Utilizado como identificador único de cuenta y para alertas de vencimientos.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                      Contraseña * (mínimo 8 car.)
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        className="w-full pl-9 pr-9 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-slate-400 hover:text-slate-600 absolute right-3 top-2.5"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Password Strength Indicator */}
                    {password && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1 flex-1 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${passwordStrength.color} transition-all duration-300`} 
                            style={{ width: `${(passwordStrength.score / 3) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">{passwordStrength.label}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                      Confirmar contraseña *
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repetir contraseña"
                      className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: DATOS PERSONALES */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 text-xs text-emerald-950 flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11px]">
                  Tus datos personales sensibles están protegidos con cifrado y se utilizan exclusivamente para validar tu mayoría de edad y configurar la zona horaria de las cotizaciones.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Fecha de nacimiento * (Mayoría de edad)
                </label>
                <div className="relative">
                  <CalendarIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="date"
                    required
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Requerido para validar que sos mayor de 18 años para operar con activos financieros.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    País
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Provincia o Ciudad
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ej: Buenos Aires / Córdoba / Rosario"
                    className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Teléfono (Opcional)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+54 11 1234-5678"
                    className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Zona horaria
                  </label>
                  <input
                    type="text"
                    disabled
                    value="America/Argentina/Buenos_Aires (UTC-3)"
                    className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Terms and Consent Checkboxes */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    required
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-800 focus:ring-emerald-800 w-4 h-4 accent-emerald-800 cursor-pointer"
                  />
                  <span className="text-xs text-slate-700 leading-snug">
                    Acepto los <span className="font-semibold text-emerald-900 underline">Términos y Condiciones</span> y la <span className="font-semibold text-emerald-900 underline">Política de Privacidad</span> de FAROS. *
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={notificationsOptIn}
                    onChange={(e) => setNotificationsOptIn(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-800 focus:ring-emerald-800 w-4 h-4 accent-emerald-800 cursor-pointer"
                  />
                  <span className="text-xs text-slate-600 leading-snug">
                    Deseo recibir alertas de vencimientos de cupones y resúmenes diarios matutinos de mercado.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: PERFIL DE INVERSOR */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Seleccioná tu perfil
                </label>
                <ProfileSelector
                  value={profile}
                  onChange={setProfile}
                />
              </div>

              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  ALyC con el que operás (Opcional)
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <select
                    value={alyc}
                    onChange={(e) => setAlyc(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                  >
                    <option value="">Seleccionar ALyC o Broker...</option>
                    {ALYC_OPTIONS.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Permite contextualizar normativas específicas de acreditación y comisiones de custodia.
                </span>
              </div>
            </div>
          )}

          {/* STEP 4: CARTERA DE ACTIVOS */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Nombre de la cartera
                  </label>
                  <input
                    type="text"
                    value={portfolioName}
                    onChange={(e) => setPortfolioName(e.target.value)}
                    className="w-full px-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Moneda de referencia
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as 'ARS' | 'USD')}
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                  >
                    <option value="USD">Dólares (USD)</option>
                    <option value="ARS">Pesos (ARS)</option>
                  </select>
                </div>
              </div>

              {/* Asset Search & Autocomplete */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Buscar y agregar activos (Acciones, CEDEARs, Bonos, ONs)
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    placeholder="Escribí un ticker (ej: YPF, AL30, AAPL, GGAL)..."
                    className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                  />
                </div>

                {/* Autocomplete Dropdown */}
                {availableToAdd.length > 0 && (
                  <div className="mt-2 border border-slate-200 rounded-xl bg-white shadow-md divide-y divide-slate-100 overflow-hidden">
                    {availableToAdd.map(item => (
                      <div
                        key={item.id}
                        onClick={() => handleAddAsset(item.symbol, item.name, item.category)}
                        className="p-2.5 flex items-center justify-between hover:bg-emerald-50/60 cursor-pointer transition-colors"
                      >
                        <div>
                          <span className="font-bold text-xs text-slate-900 mr-2">{item.symbol}</span>
                          <span className="text-xs text-slate-500">{item.name}</span>
                        </div>
                        <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" /> Agregar
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notice about optional quantities */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
                <span>Podés ingresar solo los tickers si preferís no compartir cantidades o montos.</span>
                <span className="text-emerald-800 font-bold">{assets.length} activos cargados</span>
              </div>

              {/* Assets list with optional details */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {assets.map(asset => (
                  <div
                    key={asset.symbol}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xs text-slate-900 px-2 py-0.5 rounded bg-white border border-slate-200">
                        {asset.symbol}
                      </span>
                      <span className="text-xs text-slate-600 font-medium truncate max-w-[150px]">
                        {asset.name || asset.symbol}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="number"
                        placeholder="Cant. (opc)"
                        value={asset.quantity || ''}
                        onChange={(e) => handleUpdateAssetField(asset.symbol, 'quantity', parseFloat(e.target.value) || undefined)}
                        className="w-20 px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white"
                      />
                      <input
                        type="number"
                        placeholder="Precio prom."
                        value={asset.avgPrice || ''}
                        onChange={(e) => handleUpdateAssetField(asset.symbol, 'avgPrice', parseFloat(e.target.value) || undefined)}
                        className="w-24 px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveAsset(asset.symbol)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors ml-1"
                        title="Quitar activo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 5: PREFERENCIAS Y CONFIRMACIÓN */}
          {step === 5 && (
            <div className="space-y-4">
              {/* Sector Preferences */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
                  Temáticas prioritarias para tu feed
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SECTORS_LIST.map(sec => {
                    const isChecked = selectedSectors.includes(sec.id);
                    return (
                      <label 
                        key={sec.id}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                          isChecked 
                            ? 'bg-emerald-50/80 border-emerald-700 text-emerald-950 font-semibold' 
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSector(sec.id)}
                          className="rounded text-emerald-800 accent-emerald-800 w-3.5 h-3.5"
                        />
                        <span>{sec.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Summary Review Card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Resumen de tu configuración
                </h4>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Inversor</span>
                    <span className="font-semibold text-slate-800">{name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Email</span>
                    <span className="font-semibold text-slate-800 truncate block">{email}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Perfil asignado</span>
                    <span className="font-bold text-emerald-900 block">
                      Perfil: {profile === 'dinamico' ? 'Dinámico' : profile === 'conservador' ? 'Conservador' : 'Moderado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">ALyC</span>
                    <span className="font-semibold text-slate-800">{alyc || 'No especificado'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block text-[11px]">Cartera ({currency})</span>
                    <span className="font-semibold text-slate-800">
                      {portfolioName}: {assets.map(a => a.symbol).join(', ')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                setStepError(null);
                setStep(s => s - 1);
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-white text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Atrás</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose();
                onSwitchToLogin();
              }}
              className="text-xs text-slate-600 hover:text-emerald-900 font-semibold cursor-pointer"
            >
              ¿Ya tenés cuenta? Iniciar sesión
            </button>
          )}

          {step < 5 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer ml-auto"
            >
              <span>Continuar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isLoading}
              onClick={handleFinalSubmit}
              className="px-6 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-bold shadow-md flex items-center gap-2 transition-all cursor-pointer ml-auto disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creando tu cuenta...</span>
                </>
              ) : (
                <>
                  <span>Entrar a FAROS</span>
                  <Check className="w-4 h-4 stroke-[3]" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
