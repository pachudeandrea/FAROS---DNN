import React, { useState } from 'react';
import { LighthouseLogo } from './LighthouseLogo';
import { 
  X, 
  Eye, 
  EyeOff, 
  Mail, 
  Lock, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  KeyRound
} from 'lucide-react';
import { UserAccount } from '../types';
import { saveUserToVault, verifyVaultLogin } from '../utils/accountVault';

interface LoginFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserAccount, token?: string) => void;
  onSwitchToSignUp: () => void;
  onNeedsOnboarding: (tempUser: { email: string; name: string; provider: 'google' | 'microsoft'; picture?: string }) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSwitchToSignUp,
  onNeedsOnboarding
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [oauthErrorProvider, setOauthErrorProvider] = useState<'google' | 'microsoft' | null>(null);

  // Forgot password flow state
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // OAuth info modal state (when credentials missing in dev)
  const [oauthNotice, setOauthNotice] = useState<{ provider: string; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 25000);

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          rememberMe
        }),
        signal: abortController.signal
      });

      clearTimeout(timeoutId);

      let data: any = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try { data = await res.json(); } catch {}
      } else {
        const textBody = await res.text();
        try { data = JSON.parse(textBody); } catch {}
      }

      if (res.ok && data?.user) {
        if (data.token) {
          localStorage.setItem('faros_session_token', data.token);
        }
        await saveUserToVault(data.user, password);
        onSuccess(data.user, data.token);
        onClose();
        return;
      }

      // If server explicitly reported invalid credentials or rate limiting
      if (res.status === 401 || res.status === 400 || res.status === 429) {
        throw new Error(data?.error || 'Email o contraseña incorrectos.');
      }

      // If server endpoint returned 404/500 (e.g. static host), check local vault
      const vaultAuth = await verifyVaultLogin(normalizedEmail, password);
      if (vaultAuth.success && vaultAuth.user) {
        onSuccess(vaultAuth.user, vaultAuth.token);
        onClose();
        return;
      }

      throw new Error('Email o contraseña incorrectos.');
    } catch (err: any) {
      // Check local vault in case of network disconnect or server unavailability
      const vaultAuth = await verifyVaultLogin(normalizedEmail, password);
      if (vaultAuth.success && vaultAuth.user) {
        onSuccess(vaultAuth.user, vaultAuth.token);
        onClose();
        return;
      }
      setErrorMessage(err.message || 'Error al iniciar sesión. Verificá tus credenciales.');
    } finally {
      setIsLoading(false);
    }
  };

  // Google OAuth Popup Trigger
  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setOauthNotice(null);
    try {
      const res = await fetch('/api/auth/google/url');
      const data = await res.json();

      if (!data.configured) {
        setOauthNotice({
          provider: 'Google',
          message: data.instructions || 'Faltan configurar las credenciales GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en las variables de entorno.'
        });
        return;
      }

      openOAuthPopup(data.url);
    } catch (err) {
      setErrorMessage('No se pudo iniciar el flujo de autenticación con Google.');
    }
  };

  // Microsoft OAuth Popup Trigger
  const handleMicrosoftLogin = async () => {
    setErrorMessage(null);
    setOauthNotice(null);
    try {
      const res = await fetch('/api/auth/microsoft/url');
      const data = await res.json();

      if (!data.configured) {
        setOauthNotice({
          provider: 'Microsoft',
          message: data.instructions || 'Faltan configurar las credenciales MICROSOFT_CLIENT_ID y MICROSOFT_CLIENT_SECRET en las variables de entorno.'
        });
        return;
      }

      openOAuthPopup(data.url);
    } catch (err) {
      setErrorMessage('No se pudo iniciar el flujo de autenticación con Microsoft.');
    }
  };

  // Generic OAuth popup helper with postMessage listener
  const openOAuthPopup = (authUrl: string) => {
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      authUrl,
      'faros_oauth_popup',
      `toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=yes, resizable=yes, copyhistory=no, width=${width}, height=${height}, top=${top}, left=${left}`
    );

    if (!popup) {
      setErrorMessage('El navegador bloqueó la ventana emergente. Por favor habilitá las ventanas emergentes para continuar.');
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        window.removeEventListener('message', handleMessage);
        onSuccess(event.data.user, event.data.token);
        onClose();
      } else if (event.data?.type === 'OAUTH_AUTH_NEW_USER') {
        window.removeEventListener('message', handleMessage);
        onNeedsOnboarding(event.data.tempUser);
        onClose();
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR' || event.data?.error) {
        window.removeEventListener('message', handleMessage);
        setErrorMessage(event.data.error || 'Error durante la autenticación con el proveedor.');
        setOauthErrorProvider(event.data.provider || null);
      }
    };

    window.addEventListener('message', handleMessage);
  };

  // Forgot password request
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() })
      });
      const data = await res.json();
      setForgotSuccess(data.message);
      if (data.resetToken) {
        setResetToken(data.resetToken);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al procesar la solicitud.');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset password submit
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken || !newPassword) return;
    setIsResetting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setForgotSuccess(data.message);
      setIsForgotMode(false);
      setResetToken(null);
      setPassword(newPassword);
      setEmail(forgotEmail);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al restablecer contraseña.');
    } finally {
      setIsResetting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col relative text-slate-800">
        
        {/* Top Header Card */}
        <div className="bg-emerald-950 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-emerald-300 hover:text-white p-1 rounded-full hover:bg-emerald-900 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <LighthouseLogo size="sm" showContainer={false} className="w-5 h-5 text-white" />
            <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
              FAROS Inversores
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white">
            {isForgotMode ? 'Recuperar contraseña' : 'Iniciar sesión'}
          </h2>
          <p className="text-xs text-emerald-100/80 mt-1">
            {isForgotMode
              ? 'Ingresá tu correo para recibir un enlace seguro de restablecimiento.'
              : 'Accedé a tu cartera y al feed de noticias financieras calibrado.'}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Error Message with Provider Retry */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{errorMessage}</span>
              </div>
              {oauthErrorProvider && (
                <div className="pl-6 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      if (oauthErrorProvider === 'google') handleGoogleLogin();
                      else handleMicrosoftLogin();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-rose-300 hover:bg-rose-100/60 rounded-lg text-rose-900 font-bold text-[11px] cursor-pointer transition-colors shadow-2xs"
                  >
                    <span>Reintentar inicio con {oauthErrorProvider === 'google' ? 'Google' : 'Microsoft'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* OAuth Notice if credentials missing in dev */}
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

          {!isForgotMode ? (
            <>
              {/* OAuth Providers */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
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
                  onClick={handleMicrosoftLogin}
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

              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 border-t border-slate-200" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">o con email</span>
                <div className="flex-1 border-t border-slate-200" />
              </div>

              {/* Email & Password Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="inversor@ejemplo.com"
                      className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800 bg-slate-50/50"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Contraseña
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotMode(true);
                        setForgotEmail(email);
                        setErrorMessage(null);
                      }}
                      className="text-xs text-emerald-800 hover:text-emerald-950 font-semibold cursor-pointer"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>

                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Tu contraseña"
                      className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800 bg-slate-50/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-400 hover:text-slate-600 absolute right-3 top-2.5 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded text-emerald-800 focus:ring-emerald-800 w-4 h-4 accent-emerald-800 cursor-pointer"
                    />
                    <span className="text-xs text-slate-600 font-medium">Recordarme en este dispositivo</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Iniciando sesión...</span>
                    </>
                  ) : (
                    <>
                      <span>Iniciar sesión</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            /* Forgot Password Screen */
            <div className="space-y-4">
              {forgotSuccess ? (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <span>{forgotSuccess}</span>
                  </div>

                  {resetToken && (
                    <form onSubmit={handleResetSubmit} className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                        <KeyRound className="w-4 h-4 text-emerald-800" />
                        <span>Restablecer contraseña inmediatamente</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Enlace de recuperación verificado. Ingresá tu nueva clave (mínimo 8 caracteres):
                      </p>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Nueva contraseña"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-white"
                      />
                      <button
                        type="submit"
                        disabled={isResetting}
                        className="w-full py-2 rounded-xl bg-emerald-800 text-white text-xs font-bold hover:bg-emerald-900 transition-colors"
                      >
                        {isResetting ? 'Actualizando...' : 'Guardar nueva contraseña'}
                      </button>
                    </form>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotMode(false);
                      setForgotSuccess(null);
                    }}
                    className="w-full py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Volver a iniciar sesión
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                      Correo registrado
                    </label>
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="inversor@ejemplo.com"
                      className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Enviar instrucciones</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotMode(false);
                      setErrorMessage(null);
                    }}
                    className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Volver al inicio de sesión
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Switch to Sign Up */}
          {!isForgotMode && (
            <div className="pt-3 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-600">
                ¿No tenés una cuenta en FAROS?{' '}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSwitchToSignUp();
                  }}
                  className="font-bold text-emerald-800 hover:text-emerald-950 underline underline-offset-2 cursor-pointer"
                >
                  Crear cuenta
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
