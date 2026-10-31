import { NotificationAlert, NewsImpact } from '../types';
import { X, Bell, CheckCheck, TrendingUp, TrendingDown, Minus, ArrowRight, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationAlert[];
  onMarkAllAsRead: () => void;
  onSelectNotification: (notification: NotificationAlert) => void;
  lastReviewTime?: string;
  sourcesChecked?: string[];
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onSelectNotification,
  lastReviewTime,
  sourcesChecked,
}) => {
  if (!isOpen) return null;

  const riskAlertsCount = notifications.filter(n => n.impact === 'alerta' || n.impact === 'negativo').length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div 
        className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-emerald-950" />
            <div>
              <h3 className="font-bold text-slate-900 text-lg leading-tight">
                Alertas de Cartera
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                {riskAlertsCount > 0 
                  ? `${riskAlertsCount} ${riskAlertsCount === 1 ? 'alerta de riesgo activa' : 'alertas de riesgo activas'}`
                  : 'Tus avisos y recordatorios'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onMarkAllAsRead}
              disabled={notifications.length === 0}
              className="text-xs font-semibold text-emerald-900 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Marcar leídas</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Cerrar alertas"
              className="p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        {/* List */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3.5">
          {notifications.length === 0 ? (
            <div className="text-center py-8 px-4 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-700">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="font-black text-slate-900 text-base">
                Sin alertas todavía
              </h4>
              <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                Aquí aparecerán los avisos de noticias confirmadas y los recordatorios que programes. Podés activar las notificaciones desde Mi cartera.
              </p>
              {lastReviewTime && <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-left text-[11px] text-slate-600 space-y-1">
                <p>
                  <strong>Última revisión:</strong> {lastReviewTime} (Hora Buenos Aires)
                </p>
                {sourcesChecked?.length ? <p><strong>Fuentes consultadas:</strong> {sourcesChecked.join(', ')}</p> : null}
              </div>}
            </div>
          ) : (
            notifications.map((notif) => {
              const isAlert = notif.impact === 'alerta' || notif.impact === 'negativo';
              const isFavorable = notif.impact === 'favorable' || notif.impact === 'positivo';

              return (
                <div
                  key={notif.id}
                  className={`p-4 rounded-xl border transition-all flex flex-col gap-2.5 ${
                    !notif.read 
                      ? isAlert
                        ? 'bg-rose-50/50 border-rose-300 shadow-2xs'
                        : isFavorable
                        ? 'bg-emerald-50/40 border-emerald-300'
                        : 'bg-slate-50/60 border-slate-300'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {isFavorable && (
                        <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                          <TrendingUp className="w-4 h-4" />
                        </div>
                      )}
                      {isAlert && (
                        <div className="p-1.5 rounded-lg bg-rose-100 text-rose-800">
                          <TrendingDown className="w-4 h-4" />
                        </div>
                      )}
                      {!isFavorable && !isAlert && (
                        <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600">
                          <Minus className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1 flex-wrap gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="max-w-full [overflow-wrap:anywhere] font-mono font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            {notif.affectedHoldings}
                          </span>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isFavorable 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                              : isAlert 
                              ? 'bg-rose-100 text-rose-900 border border-rose-200' 
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {isFavorable ? 'Favorable' : isAlert ? 'Alerta de Riesgo' : 'Neutral'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {notif.mediaName ? `${notif.mediaName} · ` : ''}{notif.timeAgo}
                        </span>
                      </div>

                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                        {notif.title}
                      </h4>

                      {notif.reason && (
                        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed bg-white/70 p-2 rounded-lg border border-slate-100">
                          <strong className="text-slate-800 font-semibold">Motivo: </strong>
                          {notif.reason}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="pt-2 border-t border-slate-100/90 flex items-center justify-between gap-2 flex-wrap">
                    {/* CANONICAL SOURCE REDIRECTION LINK */}
                    {notif.sourceUrl ? (
                      <a
                        href={notif.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-950 hover:underline cursor-pointer"
                        title={`Abrir nota en ${notif.mediaName || 'fuente original'}`}
                      >
                        <span>Abrir nota en {notif.mediaName || 'fuente'}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        Fuente oficial verificada
                      </span>
                    )}

                    {(notif.newsId || notif.calendarEventId) && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectNotification(notif);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 hover:text-emerald-950 cursor-pointer ml-auto"
                      >
                        <span>{notif.calendarEventId ? 'Ver en calendario' : 'Ver análisis cualitativo'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
