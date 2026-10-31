import React from 'react';
import { Bell, Loader2 } from 'lucide-react';
import type { AlertsController } from '../hooks/useAlerts';

export function NotificationControls({ alerts, question = false }: { alerts: AlertsController; question?: boolean }) {
  return <div className="min-w-0 space-y-3 text-sm text-slate-700">
    <div className="flex items-start gap-3">
      <Bell className="w-5 h-5 shrink-0 mt-0.5 text-emerald-800" />
      <div className="min-w-0">
        <h3 className="font-bold text-emerald-950">{question ? '¿Querés recibir alertas de FAROS?' : 'Alertas en tus dispositivos'}</h3>
        <p className="mt-1 text-xs leading-relaxed">Noticias confirmadas sobre tu cartera y los recordatorios que programes, también con FAROS cerrado. Podés desactivarlas cuando quieras.</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">Con FAROS cerrado, las revisiones se realizan dos veces al día, desde las 09:00 y las 17:00 (Buenos Aires).</p>
      </div>
    </div>
    {alerts.support === 'install-ios' ? <p className="p-3 rounded-xl bg-slate-50 text-xs leading-relaxed">En iPhone o iPad, tocá <strong>Compartir → Agregar a pantalla de inicio</strong>. Después abrí FAROS desde ese ícono y elegí <strong>Activar alertas</strong>. Requiere iOS/iPadOS 16.4 o posterior.</p> : alerts.support === 'unsupported' ? <p className="p-3 rounded-xl bg-slate-50 text-xs">Este navegador no admite alertas fuera de la plataforma. Podés consultar los avisos desde la campana de FAROS.</p> : alerts.permission === 'denied' ? <p className="p-3 rounded-xl bg-amber-50 text-xs text-amber-950">Las notificaciones están bloqueadas. Permití las alertas de FAROS en la configuración del navegador o del dispositivo para activarlas.</p> : <div className="flex min-w-0 flex-wrap gap-2">
      <button type="button" disabled={alerts.busy || !alerts.prepared} onClick={() => void (alerts.active ? alerts.disable() : alerts.activate())} className="min-h-11 px-4 py-2 rounded-xl bg-emerald-800 text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">{alerts.busy && <Loader2 className="w-4 h-4 animate-spin" />}{alerts.active ? 'Desactivar alertas' : 'Activar alertas'}</button>
      {alerts.active && <button type="button" disabled={alerts.busy} onClick={() => void alerts.test()} className="min-h-11 px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold cursor-pointer disabled:opacity-50">Enviar aviso de prueba</button>}
    </div>}
    {alerts.enabled && !alerts.active && <button type="button" disabled={alerts.busy} onClick={() => void alerts.disable()} className="text-xs font-semibold text-slate-600 cursor-pointer">Desactivar todas mis alertas</button>}
    {alerts.active && <p role="status" className="text-xs font-semibold text-emerald-800">Alertas activas en este dispositivo.</p>}
    {alerts.error && <p role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-800 text-xs">{alerts.error}{!alerts.prepared && <button type="button" onClick={() => void alerts.refresh()} className="ml-2 font-bold underline cursor-pointer">Volver a intentar</button>}</p>}
    {alerts.message && <p role="status" className="text-xs text-emerald-800">{alerts.message}</p>}
    {question && <button type="button" onClick={alerts.dismiss} className="text-xs font-semibold text-slate-500 cursor-pointer">Ahora no</button>}
  </div>;
}
