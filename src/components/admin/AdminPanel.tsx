import React, { useState, useEffect, useCallback } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Filter, 
  BarChart3, 
  Cpu, 
  Calculator, 
  Moon, 
  Sun, 
  RefreshCw, 
  ArrowLeft, 
  ShieldAlert, 
  Sparkles,
  Database,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { LighthouseLogo } from '../LighthouseLogo';
import { AdminOverviewView } from './AdminOverviewView';
import { AdminUsersView } from './AdminUsersView';
import { AdminFunnelView } from './AdminFunnelView';
import { AdminUsageView } from './AdminUsageView';
import { AdminPipelineHealthView } from './AdminPipelineHealthView';
import { AdminThesisFinancialsView } from './AdminThesisFinancialsView';
import { UserPlan } from '../../types';

interface AdminPanelProps {
  onBackToApp: () => void;
  currentUserEmail?: string;
}

type AdminSection = 'overview' | 'users' | 'funnel' | 'usage' | 'pipeline' | 'thesis';
type TimeframeOption = 7 | 30 | 90;

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBackToApp, currentUserEmail }) => {
  // Navigation
  const [activeSection, setActiveSection] = useState<AdminSection>('overview');

  // Controls
  const [timeframeDays, setTimeframeDays] = useState<TimeframeOption>(30);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true); // Default to Demo so founders see rich metrics immediately
  const [isDark, setIsDark] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('');
  const [unauthorizedError, setUnauthorizedError] = useState<string | null>(null);

  // Data states
  const [overviewData, setOverviewData] = useState<any>(null);
  const [usersData, setUsersData] = useState<any>({ users: [], total: 0, totalPages: 1, page: 1, limit: 20 });
  const [funnelData, setFunnelData] = useState<any>(null);
  const [usageData, setUsageData] = useState<any>(null);
  const [pipelineData, setPipelineData] = useState<any>(null);
  const [thesisData, setThesisData] = useState<any>(null);

  // Users Filters
  const [userSearch, setUserSearch] = useState<string>('');
  const [userPlanFilter, setUserPlanFilter] = useState<string>('todos');
  const [userProfileFilter, setUserProfileFilter] = useState<string>('todos');
  const [userPage, setUserPage] = useState<number>(1);

  // Format current time in Buenos Aires timezone
  const getBuenosAiresTime = useCallback(() => {
    try {
      return new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(new Date());
    } catch {
      return new Date().toLocaleTimeString();
    }
  }, []);

  // Fetch Section Data
  const loadSectionData = useCallback(async () => {
    setIsLoading(true);
    setUnauthorizedError(null);
    const mode = isDemoMode ? 'demo' : 'real';

    try {
      const storedToken = localStorage.getItem('faros_session_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }

      // Check current section and fetch accordingly
      if (activeSection === 'overview') {
        const res = await fetch(`/api/admin/overview?mode=${mode}&days=${timeframeDays}`, { headers });
        if (res.status === 403 || res.status === 401) {
          setUnauthorizedError('Tu cuenta no tiene privilegios de administrador para acceder a esta sección.');
          setIsLoading(false);
          return;
        }
        const data = await res.json();
        setOverviewData(data);
      } else if (activeSection === 'users') {
        const queryParams = new URLSearchParams({
          mode,
          page: String(userPage),
          limit: '20',
          search: userSearch,
          plan: userPlanFilter,
          profile: userProfileFilter
        });
        const res = await fetch(`/api/admin/users?${queryParams.toString()}`, { headers });
        if (res.status === 403 || res.status === 401) {
          setUnauthorizedError('Acceso restringido a administradores.');
          setIsLoading(false);
          return;
        }
        const data = await res.json();
        setUsersData(data);
      } else if (activeSection === 'funnel') {
        const res = await fetch(`/api/admin/funnel?mode=${mode}`, { headers });
        const data = await res.json();
        setFunnelData(data);
      } else if (activeSection === 'usage') {
        const res = await fetch(`/api/admin/usage?mode=${mode}`, { headers });
        const data = await res.json();
        setUsageData(data);
      } else if (activeSection === 'pipeline') {
        const res = await fetch(`/api/admin/pipeline-health?mode=${mode}`, { headers });
        const data = await res.json();
        setPipelineData(data);
      } else if (activeSection === 'thesis') {
        const res = await fetch(`/api/admin/thesis-financials?mode=${mode}`, { headers });
        const data = await res.json();
        setThesisData(data);
      }

      setLastUpdatedTime(getBuenosAiresTime());
    } catch (err: any) {
      console.error('Error fetching admin section data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeSection, isDemoMode, timeframeDays, userPage, userSearch, userPlanFilter, userProfileFilter, getBuenosAiresTime]);

  useEffect(() => {
    loadSectionData();
  }, [loadSectionData]);

  // Handle plan update from Users table
  const handleUpdateUserPlan = async (userId: string, newPlan: UserPlan) => {
    const storedToken = localStorage.getItem('faros_session_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
    }

    const res = await fetch(`/api/admin/users/${userId}/plan`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ plan: newPlan })
    });

    if (!res.ok) {
      throw new Error('No se pudo actualizar el plan');
    }

    // Refresh users view
    loadSectionData();
  };

  const navItems = [
    { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
    { id: 'users', label: 'Usuarios', icon: Users },
    { id: 'funnel', label: 'Embudo y Onboarding', icon: Filter },
    { id: 'usage', label: 'Uso del Producto', icon: BarChart3 },
    { id: 'pipeline', label: 'Salud del Pipeline', icon: Cpu },
    { id: 'thesis', label: 'Plan vs. Real (Tesis)', icon: Calculator },
  ];

  const mainBg = isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900';
  const sidebarBg = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90';

  if (unauthorizedError) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${mainBg}`}>
        <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-3xl border border-rose-300 dark:border-rose-900 shadow-2xl text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white">Acceso Restringido</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {unauthorizedError}
          </p>
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-left text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
            <p><strong>Email actual:</strong> {currentUserEmail || 'No detectado'}</p>
            <p><strong>Configuración requerida:</strong> Este correo debe figurar en la variable <code>ADMIN_EMAILS</code> de Vercel/entorno.</p>
          </div>
          <button
            onClick={onBackToApp}
            className="w-full py-2.5 bg-emerald-950 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-900"
          >
            Volver a la aplicación FAROS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${mainBg}`}>
      {/* Top Navbar */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs ${
        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white/95 border-slate-200'
      }`}>
        {/* Brand & Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToApp}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            title="Regresar a FAROS"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2.5">
            <LighthouseLogo size="sm" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm tracking-tight">FAROS</span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-950 text-white px-2 py-0.5 rounded-md">
                  Panel Administrador
                </span>
              </div>
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                Monitoreo de negocio, producto y salud del pipeline
              </span>
            </div>
          </div>
        </div>

        {/* Global Toolbar: Date filter, Demo/Real switch, Dark mode, Refresh */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {/* Timeframe selector (for overview) */}
          {activeSection === 'overview' && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold border border-slate-200 dark:border-slate-700">
              {([7, 30, 90] as TimeframeOption[]).map((days) => (
                <button
                  key={days}
                  onClick={() => setTimeframeDays(days)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    timeframeDays === days
                      ? 'bg-emerald-950 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>
          )}

          {/* Mode Switch: Demo vs Real */}
          <button
            onClick={() => setIsDemoMode(!isDemoMode)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs ${
              isDemoMode
                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
            }`}
            title="Alternar entre datos de simulación completos de tesis y datos reales registrados"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isDemoMode ? 'Modo Demostración (Tesis)' : 'Datos Reales (Producción)'}</span>
          </button>

          {/* Dark / Light Mode Toggle */}
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {/* Refresh Button */}
          <button
            onClick={loadSectionData}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
            {lastUpdatedTime && (
              <span className="font-mono text-[10px] text-slate-400">
                ({lastUpdatedTime} hs)
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace: Left Sidebar + Right Content Area */}
      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto p-4 sm:p-6 gap-6">
        {/* Navigation Sidebar */}
        <aside className={`w-full md:w-64 shrink-0 rounded-3xl border p-4 h-fit space-y-1 shadow-xs ${sidebarBg}`}>
          <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
            Secciones del Panel
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSection(item.id as AdminSection);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-950 text-white shadow-xs'
                    : isDark
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-300' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* Quick info box at bottom of sidebar */}
          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] space-y-2 text-slate-500">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>Persistencia Activa</span>
            </div>
            <p className="leading-snug">
              Adaptador seguro con aislamiento multi-usuario y almacenamiento en <code>/data/users_db.json</code>.
            </p>
          </div>
        </aside>

        {/* Dynamic Section Content */}
        <main className="flex-1 min-w-0">
          {activeSection === 'overview' && (
            <AdminOverviewView data={overviewData} isDark={isDark} />
          )}

          {activeSection === 'users' && (
            <AdminUsersView
              users={usersData.users || []}
              total={usersData.total || 0}
              page={usersData.page || 1}
              limit={usersData.limit || 20}
              totalPages={usersData.totalPages || 1}
              onPageChange={(p) => setUserPage(p)}
              onSearchChange={(q) => {
                setUserSearch(q);
                setUserPage(1);
              }}
              onPlanFilterChange={(pf) => {
                setUserPlanFilter(pf);
                setUserPage(1);
              }}
              onProfileFilterChange={(prf) => {
                setUserProfileFilter(prf);
                setUserPage(1);
              }}
              selectedPlanFilter={userPlanFilter}
              selectedProfileFilter={userProfileFilter}
              searchQuery={userSearch}
              isDark={isDark}
              onUpdatePlan={handleUpdateUserPlan}
            />
          )}

          {activeSection === 'funnel' && (
            <AdminFunnelView data={funnelData} isDark={isDark} />
          )}

          {activeSection === 'usage' && (
            <AdminUsageView data={usageData} isDark={isDark} />
          )}

          {activeSection === 'pipeline' && (
            <AdminPipelineHealthView data={pipelineData} isDark={isDark} />
          )}

          {activeSection === 'thesis' && (
            <AdminThesisFinancialsView data={thesisData} isDark={isDark} />
          )}
        </main>
      </div>
    </div>
  );
};
