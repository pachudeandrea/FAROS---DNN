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
  Loader2
} from 'lucide-react';
import { UserAccount } from '../types';
import { apiRequest } from '../utils/apiClient';
import { PasswordRecoveryForm } from './PasswordRecoveryForm';

interface LoginFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserAccount, token?: string) => void;
  onSwitchToSignUp: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSwitchToSignUp
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forgot password flow state
  const [isForgotMode, setIsForgotMode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email: normalizedEmail, password, rememberMe })
      });
      if (!data.user || !data.success) throw new Error('El servidor no confirmó el inicio de sesión.');
      onSuccess(data.user, data.token);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'No se pudo iniciar sesión.');
    } finally {
      setIsLoading(false);
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
              ? 'Usá tu código de recuperación de 4 dígitos para cambiar tu contraseña.'
              : 'Accedé a tu cartera y al feed de noticias financieras calibrado.'}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{errorMessage}</span>
              </div>
            </div>
          )}

          {!isForgotMode ? (
            <>
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
            <PasswordRecoveryForm initialEmail={email}
              onBack={() => { setIsForgotMode(false); setErrorMessage(null); }}
              onComplete={resetEmail => { setEmail(resetEmail); setPassword(''); setIsForgotMode(false); setErrorMessage(null); }} />
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
