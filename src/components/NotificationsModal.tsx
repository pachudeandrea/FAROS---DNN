import { NewsItem, NewsImpact } from '../types';
import { X, Bell, CheckCheck, TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';

interface NotificationAlert {
  id: string;
  newsId: string;
  title: string;
  timeAgo: string;
  impact: NewsImpact;
  read: boolean;
  affectedHoldings: string;
}


interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationAlert[];
  onMarkAllAsRead: () => void;
  onSelectNotification: (newsId: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onSelectNotification,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div 
        className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-emerald-950" />
            <h3 className="font-bold text-slate-900 text-lg">
              Alertas de Cartera
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onMarkAllAsRead}
              className="text-xs font-semibold text-emerald-900 hover:text-emerald-950 flex items-center gap-1"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Marcar leídas</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3">
          {notifications.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-8">
              No tenés notificaciones pendientes para tu cartera.
            </p>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => {
                  onSelectNotification(notif.newsId);
                  onClose();
                }}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer hover:shadow-xs flex items-start gap-3 ${
                  !notif.read 
                    ? 'bg-emerald-50/40 border-emerald-300' 
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {(notif.impact === 'favorable' || notif.impact === 'positivo') && (
                    <div className="p-1 rounded bg-emerald-100 text-emerald-800">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  )}
                  {(notif.impact === 'alerta' || notif.impact === 'negativo') && (
                    <div className="p-1 rounded bg-rose-100 text-rose-800">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                  )}
                  {(notif.impact === 'neutral' || notif.impact === 'neutro') && (
                    <div className="p-1 rounded bg-slate-100 text-slate-600">
                      <Minus className="w-4 h-4" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-emerald-950 font-mono">
                        {notif.affectedHoldings}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        (notif.impact === 'favorable' || notif.impact === 'positivo') ? 'bg-emerald-100 text-emerald-800' :
                        (notif.impact === 'alerta' || notif.impact === 'negativo') ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {(notif.impact === 'favorable' || notif.impact === 'positivo') ? 'Favorable' : (notif.impact === 'alerta' || notif.impact === 'negativo') ? 'Alerta' : 'Neutral'}
                      </span>
                    </div>
                    <span>{notif.timeAgo}</span>
                  </div>

                  <p className="text-xs font-bold text-slate-900 leading-snug">
                    {notif.title}
                  </p>
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-800 mt-2">
                    <span>Ver análisis cualitativo en cartera</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>

              </div>
            ))
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
