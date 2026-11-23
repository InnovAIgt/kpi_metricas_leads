import React from 'react';
import {
  PhoneCall,
  CalendarCheck,
  TrendingUp,
  Flame,
} from 'lucide-react';
import { ResumenKPIs, CruceAuditoria, ParametrosAuditoria } from '../types';
import { SemaforoCumplimiento } from './SemaforoCumplimiento';

interface MetricsOverviewProps {
  kpis: ResumenKPIs;
  cruces: CruceAuditoria[];
  parametros: ParametrosAuditoria;
  esNoCalificado?: boolean;
  onVerTranscripcion?: (cruce: CruceAuditoria) => void;
  onVerDetalleCruce: (cruceId: string) => void;
  onCambiarTab: (tab: 'cruces' | 'vendedores') => void;
}

export const MetricsOverview: React.FC<MetricsOverviewProps> = ({
  kpis,
  cruces,
  parametros,
  esNoCalificado = false,
  onVerTranscripcion,
  onVerDetalleCruce,
  onCambiarTab,
}) => {
  const citasCriticas = cruces.filter(
    (c) => c.estado_cumplimiento === 'NO_LLAMO' || c.estado_cumplimiento === 'TARDE_GRAVE'
  );

  const totalCitas = kpis.total_citas || 1;
  const pctATiempo = Math.round((kpis.citas_llamadas_a_tiempo / totalCitas) * 100);
  const pctRetraso = Math.round((kpis.citas_con_retraso / totalCitas) * 100);
  const pctNoLlamo = Math.round((kpis.citas_no_atendidas / totalCitas) * 100);
  const pctCorta = Math.round((kpis.citas_llamada_insuficiente / totalCitas) * 100);

  const totalAuditables = Math.max(0, kpis.total_citas - (kpis.citas_pendientes || 0));

  return (
    <div className="space-y-6 tabular-nums">
      <SemaforoCumplimiento
        cruces={cruces}
        esNoCalificado={esNoCalificado}
        parametros={parametros}
        onVerTranscripcion={onVerTranscripcion}
        titulo="Semáforo de Cumplimiento · Resumen KPIs"
        heroAside={
          <div className="h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col justify-between gap-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {esNoCalificado ? 'Leads del Período' : 'Citas del Período'}
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Total auditado en el rango
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20">
                <CalendarCheck className="h-6 w-6" />
              </div>
            </div>

            <div className="my-auto py-2">
              <div className="text-6xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
                {kpis.total_citas}
              </div>
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-2">
                {kpis.tasa_shows_efectivos}% asistidas · {totalAuditables} auditables
              </p>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <PhoneCall className="h-3.5 w-3.5 text-indigo-500" /> Llamadas detectadas
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {kpis.total_llamadas} ({kpis.duracion_total_llamadas_horas}h)
              </span>
            </div>
          </div>
        }
      />

      {/* Visual Distribution Bar of Meeting Outcomes */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
              Distribución de Cumplimiento de Citas
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cruce automático según hora pactada en el calendario vs inicio de llamada en telefonía
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCambiarTab('cruces')}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold self-start sm:self-auto cursor-pointer"
          >
            Ver detalle de cumplimiento →
          </button>
        </div>

        {/* Multi-segmented Progress Bar */}
        <div className="w-full h-4 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
          <div
            style={{ width: `${pctATiempo}%` }}
            className="bg-emerald-500 h-full transition-all hover:opacity-90"
            title={`A Tiempo: ${pctATiempo}% (${kpis.citas_llamadas_a_tiempo} citas)`}
          />
          <div
            style={{ width: `${pctRetraso}%` }}
            className="bg-amber-400 h-full transition-all hover:opacity-90"
            title={`Tarde: ${pctRetraso}% (${kpis.citas_con_retraso} citas)`}
          />
          <div
            style={{ width: `${pctCorta}%` }}
            className="bg-orange-500 h-full transition-all hover:opacity-90"
            title={`Llamada Corta / Buzón: ${pctCorta}% (${kpis.citas_llamada_insuficiente} citas)`}
          />
          <div
            style={{ width: `${pctNoLlamo}%` }}
            className="bg-rose-500 h-full transition-all hover:opacity-90"
            title={`No Llamó / Infracción: ${pctNoLlamo}% (${kpis.citas_no_atendidas} citas)`}
          />
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-slate-700 dark:text-slate-300">
              A Tiempo: <strong>{pctATiempo}%</strong> ({kpis.citas_llamadas_a_tiempo})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-amber-400 shrink-0" />
            <span className="text-slate-700 dark:text-slate-300">
              Tarde: <strong>{pctRetraso}%</strong> ({kpis.citas_con_retraso})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-orange-500 shrink-0" />
            <span className="text-slate-700 dark:text-slate-300">
              Corta / Buzón: <strong>{pctCorta}%</strong> ({kpis.citas_llamada_insuficiente})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-rose-500 shrink-0" />
            <span className="text-slate-700 dark:text-slate-300">
              No Llamó: <strong>{pctNoLlamo}%</strong> ({kpis.citas_no_atendidas})
            </span>
          </div>
        </div>
      </div>

      {/* Critical Alerts & Quick Insights */}
      {citasCriticas.length > 0 && (
        <div className="bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-rose-500 dark:text-rose-400" />
              <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                Infracciones Críticas Detectadas ({citasCriticas.length})
              </h3>
            </div>
            <span className="text-xs text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/40 px-2.5 py-0.5 rounded-full border border-rose-200 dark:border-rose-800 font-medium">
              Requiere Auditoría Inmediata
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {citasCriticas.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900/90 border border-rose-200 dark:border-rose-900/40 p-3 rounded-xl hover:border-rose-400 dark:hover:border-rose-700/60 transition-colors cursor-pointer shadow-xs"
                onClick={() => onVerDetalleCruce(item.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{item.prospecto_nombre}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">Vendedor: {item.vendedor_nombre}</p>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                      item.estado_cumplimiento === 'NO_LLAMO'
                        ? 'bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40'
                        : 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
                    }`}
                  >
                    {item.estado_cumplimiento === 'NO_LLAMO' ? 'NO LLAMÓ' : `+${item.desfase_minutos}m TARDE`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">{item.explicacion}</p>
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span>Tel: {item.telefono}</span>
                  <span className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">Ver detalle →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
