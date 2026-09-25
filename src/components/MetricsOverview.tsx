import React from 'react';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  PhoneCall,
  CalendarCheck,
  TrendingUp,
  UserX,
  PhoneOff,
  Flame,
} from 'lucide-react';
import { ResumenKPIs, CruceAuditoria, ParametrosAuditoria } from '../types';

interface MetricsOverviewProps {
  kpis: ResumenKPIs;
  cruces: CruceAuditoria[];
  parametros: ParametrosAuditoria;
  onVerDetalleCruce: (cruceId: string) => void;
  onCambiarTab: (tab: 'cruces' | 'vendedores') => void;
}

export const MetricsOverview: React.FC<MetricsOverviewProps> = ({
  kpis,
  cruces,
  parametros,
  onVerDetalleCruce,
  onCambiarTab,
}) => {
  // Citas con infracción crítica (No llamó o tarde grave)
  const citasCriticas = cruces.filter(
    (c) => c.estado_cumplimiento === 'NO_LLAMO' || c.estado_cumplimiento === 'TARDE_GRAVE'
  );

  // Desglose para la barra de proporción
  const totalCitas = kpis.total_citas || 1;
  const pctATiempo = Math.round((kpis.citas_llamadas_a_tiempo / totalCitas) * 100);
  const pctRetraso = Math.round((kpis.citas_con_retraso / totalCitas) * 100);
  const pctNoLlamo = Math.round((kpis.citas_no_atendidas / totalCitas) * 100);
  const pctCorta = Math.round((kpis.citas_llamada_insuficiente / totalCitas) * 100);

  return (
    <div className="space-y-6">
      {/* Top Banner KPI Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Tasa de Cumplimiento (Primary Hero KPI) */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Cumplimiento a Tiempo
            </span>
            <div
              className={`p-2 rounded-xl ${
                kpis.tasa_cumplimiento_general >= 75
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : kpis.tasa_cumplimiento_general >= 50
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}
            >
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {kpis.tasa_cumplimiento_general}%
            </span>
            <span className="text-xs text-slate-400">
              ({kpis.citas_llamadas_a_tiempo} de {kpis.total_citas} citas)
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Tolerancia: dentro de +{parametros.tolerancia_retraso_a_tiempo_minutos} min y duración ≥{' '}
            {parametros.duracion_minima_efectiva_segundos}s
          </p>
          <div className="mt-3 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                kpis.tasa_cumplimiento_general >= 75
                  ? 'bg-emerald-400'
                  : kpis.tasa_cumplimiento_general >= 50
                  ? 'bg-amber-400'
                  : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(kpis.tasa_cumplimiento_general, 100)}%` }}
            />
          </div>
        </div>

        {/* KPI 2: Citas Agendadas y Asistencia */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Citas Agendadas
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <CalendarCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {kpis.total_citas}
            </span>
            <span className="text-xs text-emerald-400 font-medium">
              {kpis.tasa_shows_efectivos}% Asistidas
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
            <span>Infracciones (No llamó):</span>
            <span className="font-semibold text-rose-400">{kpis.citas_no_atendidas} citas</span>
          </div>
        </div>

        {/* KPI 3: Llamadas y Minutos Hablados */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Llamadas Realizadas
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <PhoneCall className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {kpis.total_llamadas}
            </span>
            <span className="text-xs text-slate-400">
              ({kpis.duracion_total_llamadas_horas} horas en línea)
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
            <span>Llamadas Cortas/Buzón:</span>
            <span className="font-semibold text-amber-400">{kpis.citas_llamada_insuficiente}</span>
          </div>
        </div>

        {/* KPI 4: Desfase Promedio */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Desfase Promedio
            </span>
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              +{kpis.promedio_tiempo_respuesta_minutos}
            </span>
            <span className="text-sm font-medium text-slate-400">minutos</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Retrasos leves: <strong className="text-amber-300">{kpis.citas_con_retraso}</strong> |
            Tardanzas severas:{' '}
            <strong className="text-rose-400">
              {cruces.filter((c) => c.estado_cumplimiento === 'TARDE_GRAVE').length}
            </strong>
          </p>
        </div>
      </div>

      {/* Visual Distribution Bar of Meeting Outcomes */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-400" />
              Distribución de Cumplimiento de Citas
            </h3>
            <p className="text-xs text-slate-400">
              Cruce automático según hora pactada en el calendario vs inicio de llamada en telefonía
            </p>
          </div>
          <button
            onClick={() => onCambiarTab('cruces')}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold self-start sm:self-auto"
          >
            Ver tabla de cruces completa →
          </button>
        </div>

        {/* Multi-segmented Progress Bar */}
        <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
          <div
            style={{ width: `${pctATiempo}%` }}
            className="bg-emerald-500 h-full transition-all hover:opacity-90"
            title={`A Tiempo: ${pctATiempo}% (${kpis.citas_llamadas_a_tiempo} citas)`}
          />
          <div
            style={{ width: `${pctRetraso}%` }}
            className="bg-amber-400 h-full transition-all hover:opacity-90"
            title={`Con Retraso: ${pctRetraso}% (${kpis.citas_con_retraso} citas)`}
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
            <span className="text-slate-300">
              A Tiempo: <strong>{pctATiempo}%</strong> ({kpis.citas_llamadas_a_tiempo})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-amber-400 shrink-0" />
            <span className="text-slate-300">
              Con Retraso: <strong>{pctRetraso}%</strong> ({kpis.citas_con_retraso})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-orange-500 shrink-0" />
            <span className="text-slate-300">
              Corta / Buzón: <strong>{pctCorta}%</strong> ({kpis.citas_llamada_insuficiente})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-rose-500 shrink-0" />
            <span className="text-slate-300">
              No Llamó: <strong>{pctNoLlamo}%</strong> ({kpis.citas_no_atendidas})
            </span>
          </div>
        </div>
      </div>

      {/* Critical Alerts & Quick Insights */}
      {citasCriticas.length > 0 && (
        <div className="bg-rose-950/20 border border-rose-900/40 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-rose-400 animate-bounce" />
              <h3 className="text-sm font-bold text-rose-200">
                Infracciones Críticas Detectadas ({citasCriticas.length})
              </h3>
            </div>
            <span className="text-xs text-rose-400 bg-rose-900/40 px-2 py-0.5 rounded-full border border-rose-800">
              Requiere Auditoría Inmediata
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {citasCriticas.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="bg-slate-900/90 border border-rose-900/40 p-3 rounded-xl hover:border-rose-700/60 transition-colors cursor-pointer"
                onClick={() => onVerDetalleCruce(item.id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold text-white">{item.prospecto_nombre}</p>
                    <p className="text-[11px] text-slate-400">Vendedor: {item.vendedor_nombre}</p>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      item.estado_cumplimiento === 'NO_LLAMO'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {item.estado_cumplimiento === 'NO_LLAMO' ? 'NO LLAMÓ' : `+${item.desfase_minutos}m TARDE`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-2 line-clamp-2">{item.explicacion}</p>
                <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Tel: {item.telefono}</span>
                  <span className="text-indigo-400 hover:underline">Ver detalle →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
