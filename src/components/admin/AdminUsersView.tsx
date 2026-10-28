import React, { useState } from 'react';
import { 
  Search, 
  Download, 
  Filter, 
  Check, 
  Clock, 
  Briefcase, 
  Bell, 
  ExternalLink, 
  X, 
  ChevronLeft, 
  ChevronRight,
  ShieldCheck,
  TrendingUp,
  Activity,
  UserCheck
} from 'lucide-react';
import { UserPlan } from '../../types';

interface AdminUsersViewProps {
  users: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  onSearchChange: (q: string) => void;
  onPlanFilterChange: (p: string) => void;
  onProfileFilterChange: (pr: string) => void;
  selectedPlanFilter: string;
  selectedProfileFilter: string;
  searchQuery: string;
  isDark: boolean;
  onUpdatePlan: (userId: string, newPlan: UserPlan) => Promise<void>;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({
  users,
  total,
  page,
  limit,
  totalPages,
  onPageChange,
  onSearchChange,
  onPlanFilterChange,
  onProfileFilterChange,
  selectedPlanFilter,
  selectedProfileFilter,
  searchQuery,
  isDark,
  onUpdatePlan
}) => {
  const [selectedUserDetail, setSelectedUserDetail] = useState<any | null>(null);
  const [isUpdatingPlanId, setIsUpdatingPlanId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const cardBg = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200/90 text-slate-900';
  const subText = isDark ? 'text-slate-400' : 'text-slate-500';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handlePlanSelect = async (userId: string, plan: UserPlan) => {
    setIsUpdatingPlanId(userId);
    try {
      await onUpdatePlan(userId, plan);
      showToast(`Plan actualizado a "${plan}"`);
    } catch {
      showToast('Error al actualizar plan');
    } finally {
      setIsUpdatingPlanId(null);
    }
  };

  // Export current users table to CSV with UTF-8 BOM
  const handleExportCsv = () => {
    const headers = [
      'ID',
      'Nombre',
      'Email',
      'Metodo de Registro',
      'Fecha de Alta',
      'Ultimo Acceso',
      'Perfil Inversor',
      'ALyC / Broker',
      'Plan',
      'Etapa Embudo',
      'Notificaciones',
      'Activos en Cartera',
      'Posiciones Long',
      'Posiciones Short'
    ];

    const rows = users.map(u => {
      const assetIds = u.portfolio?.assetIds || [];
      const positions = u.portfolio?.assetPositions || {};
      const longCount = assetIds.filter((sym: string) => (positions[sym] || 'long') === 'long').length;
      const shortCount = assetIds.filter((sym: string) => positions[sym] === 'short').length;

      return [
        u.id,
        `"${(u.name || '').replace(/"/g, '""')}"`,
        u.email,
        u.provider || 'email',
        u.createdAt ? new Date(u.createdAt).toLocaleDateString('es-AR') : '',
        u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString('es-AR') : '',
        u.profile || 'moderado',
        `"${(u.alyc || '').replace(/"/g, '""')}"`,
        u.plan || 'prueba',
        u.funnelStage || 'adoption',
        u.notificationsEnabled ? 'SI' : 'NO',
        `"${assetIds.join(', ')}"`,
        longCount,
        shortCount
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `faros_usuarios_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Toast feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-950 text-emerald-200 border border-emerald-700 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold animate-in fade-in flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Control Bar: Search, Filters, CSV Export */}
      <div className={`p-5 rounded-3xl border shadow-xs space-y-4 ${cardBg}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar por nombre, email o broker..."
              className={`w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-700 ${
                isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            />
          </div>

          {/* Filters & Export */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Plan Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className={subText}>Plan:</span>
              <select
                value={selectedPlanFilter}
                onChange={(e) => onPlanFilterChange(e.target.value)}
                className={`py-1.5 px-3 rounded-xl border text-xs font-bold focus:outline-none ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="todos">Todos los planes</option>
                <option value="prueba">Prueba (Trial 30d)</option>
                <option value="market">Market ($11.500/mes)</option>
                <option value="partner">Partner ($16.500/mes)</option>
                <option value="ninguno">Ninguno</option>
              </select>
            </div>

            {/* Profile Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className={subText}>Perfil:</span>
              <select
                value={selectedProfileFilter}
                onChange={(e) => onProfileFilterChange(e.target.value)}
                className={`py-1.5 px-3 rounded-xl border text-xs font-bold focus:outline-none ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="todos">Todos los perfiles</option>
                <option value="conservador">Conservador</option>
                <option value="moderado">Moderado</option>
                <option value="dinamico">Dinámico</option>
              </select>
            </div>

            {/* CSV Download Button */}
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-white text-xs font-bold transition-all shadow-xs cursor-pointer ml-auto"
              title="Descargar base de usuarios en formato CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
          <span>Mostrando {users.length} de {total} usuarios registrados</span>
          <span>Página {page} de {totalPages}</span>
        </div>
      </div>

      {/* Users Table */}
      <div className={`rounded-3xl border shadow-xs overflow-hidden ${cardBg}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`border-b uppercase font-bold tracking-wider text-[11px] ${
              isDark ? 'bg-slate-800/80 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <tr>
                <th className="py-3.5 px-4">Usuario</th>
                <th className="py-3.5 px-3">Método</th>
                <th className="py-3.5 px-3">Fecha Alta</th>
                <th className="py-3.5 px-3">Perfil</th>
                <th className="py-3.5 px-3">Activos / Posición</th>
                <th className="py-3.5 px-3">Plan (Admin)</th>
                <th className="py-3.5 px-3">Notif.</th>
                <th className="py-3.5 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No se encontraron usuarios con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                users.map((u: any) => {
                  const assetIds = u.portfolio?.assetIds || [];
                  const positions = u.portfolio?.assetPositions || {};
                  const isPending = isUpdatingPlanId === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      {/* Name & Email */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-950 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                            {u.name?.slice(0, 2).toUpperCase() || 'U'}
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-900 dark:text-white block text-xs">
                              {u.name}
                            </span>
                            <span className={`text-[11px] ${subText} block`}>
                              {u.email}
                            </span>
                            {u.alyc && u.alyc !== 'No especificado' && (
                              <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-bold">
                                ALyC: {u.alyc}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Provider Badge */}
                      <td className="py-3.5 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          u.provider === 'google' 
                            ? 'bg-red-50 text-red-700 border border-red-200' 
                            : u.provider === 'microsoft' 
                            ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {u.provider || 'email'}
                        </span>
                      </td>

                      {/* Created At */}
                      <td className="py-3.5 px-3 font-mono text-[11px] whitespace-nowrap">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('es-AR') : '-'}
                      </td>

                      {/* Profile */}
                      <td className="py-3.5 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold capitalize bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          {u.profile}
                        </span>
                      </td>

                      {/* Portfolio Tickers & Long/Short Badges */}
                      <td className="py-3.5 px-3">
                        {assetIds.length === 0 ? (
                          <span className="text-[11px] text-slate-400 italic">0 activos</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1 max-w-[190px]">
                            {assetIds.slice(0, 3).map((sym: string) => {
                              const pos = positions[sym] || 'long';
                              return (
                                <span 
                                  key={sym}
                                  className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                    pos === 'short'
                                      ? 'bg-amber-100/90 text-amber-950 border-amber-300'
                                      : 'bg-blue-100/90 text-blue-950 border-blue-300'
                                  }`}
                                  title={`${sym} (${pos.toUpperCase()})`}
                                >
                                  <span>{sym}</span>
                                  <span className="text-[8px] opacity-80">{pos === 'short' ? 'S' : 'L'}</span>
                                </span>
                              );
                            })}
                            {assetIds.length > 3 && (
                              <span className="text-[10px] text-slate-500 font-bold">
                                +{assetIds.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Plan Dropdown (Admin Action) */}
                      <td className="py-3.5 px-3">
                        <select
                          disabled={isPending}
                          value={u.plan || 'prueba'}
                          onChange={(e) => handlePlanSelect(u.id, e.target.value as UserPlan)}
                          className={`text-xs font-bold rounded-xl px-2.5 py-1 border focus:outline-none transition-colors cursor-pointer ${
                            u.plan === 'partner'
                              ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-300 text-blue-900 dark:text-blue-300'
                              : u.plan === 'market'
                              ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-300 text-emerald-900 dark:text-emerald-300'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                          } ${isPending ? 'opacity-50 cursor-wait' : ''}`}
                        >
                          <option value="prueba">Prueba</option>
                          <option value="market">Market ($11.500)</option>
                          <option value="partner">Partner ($16.500)</option>
                          <option value="ninguno">Ninguno</option>
                        </select>
                      </td>

                      {/* Notifications */}
                      <td className="py-3.5 px-3">
                        {u.notificationsEnabled ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                            <Check className="w-3.5 h-3.5" />
                            Sí
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">No</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedUserDetail(u)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                        >
                          Detalle
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <span className="text-xs font-mono text-slate-500">
              Página {page} de {totalPages}
            </span>

            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              <span>Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {selectedUserDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className={`max-w-2xl w-full rounded-3xl border shadow-2xl p-6 sm:p-7 max-h-[85vh] overflow-y-auto space-y-6 ${cardBg}`}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-950 text-white font-mono font-bold flex items-center justify-center">
                  {selectedUserDetail.name?.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-black">{selectedUserDetail.name}</h3>
                  <p className={`text-xs ${subText}`}>{selectedUserDetail.email}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <span className={subText}>Alta</span>
                <p className="font-bold font-mono mt-0.5">
                  {new Date(selectedUserDetail.createdAt).toLocaleDateString('es-AR')}
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <span className={subText}>Perfil</span>
                <p className="font-bold capitalize mt-0.5">
                  {selectedUserDetail.profile}
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <span className={subText}>ALyC</span>
                <p className="font-bold mt-0.5 truncate">
                  {selectedUserDetail.alyc || 'No asignado'}
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <span className={subText}>Plan Actual</span>
                <p className="font-bold capitalize text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {selectedUserDetail.plan || 'Prueba'}
                </p>
              </div>
            </div>

            {/* Portfolio Holdings Section */}
            <div className="space-y-2">
              <h4 className="font-extrabold text-sm flex items-center justify-between">
                <span>Activos en Cartera ({selectedUserDetail.portfolio?.assetIds?.length || 0})</span>
                <span className="text-xs font-normal text-slate-500">{selectedUserDetail.portfolio?.name}</span>
              </h4>

              {(selectedUserDetail.portfolio?.assetIds?.length || 0) === 0 ? (
                <p className="text-xs text-slate-400 italic p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  El usuario aún no ha agregado activos a su cartera.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {selectedUserDetail.portfolio.assetIds.map((sym: string) => {
                    const pos = selectedUserDetail.portfolio?.assetPositions?.[sym] || 'long';
                    return (
                      <div 
                        key={sym} 
                        className={`p-2.5 rounded-xl border flex items-center justify-between ${
                          pos === 'short'
                            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
                            : 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800'
                        }`}
                      >
                        <span className="font-mono font-bold text-xs">{sym}</span>
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                          pos === 'short' ? 'bg-amber-400 text-amber-950' : 'bg-blue-600 text-white'
                        }`}>
                          {pos.toUpperCase()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Activity Events Timeline */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <h4 className="font-extrabold text-sm flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-700" />
                Línea de Tiempo de Actividad
              </h4>

              {(!selectedUserDetail.recentEvents || selectedUserDetail.recentEvents.length === 0) ? (
                <p className="text-xs text-slate-400 italic">No hay eventos recientes registrados para este usuario.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedUserDetail.recentEvents.map((evt: any) => (
                    <div key={evt.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                          {evt.eventType}
                        </span>
                        {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                          <span className={`ml-2 text-[11px] ${subText}`}>
                            {JSON.stringify(evt.metadata)}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0 ml-2">
                        {new Date(evt.timestamp).toLocaleString('es-AR')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
