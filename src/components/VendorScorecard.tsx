import React, { useState } from 'react';
import { Trophy, Award, AlertTriangle, Download } from 'lucide-react';
import { VendedorMetricas } from '../types';
import { exportarTablaAExcel, formatearSubtituloExportacion } from '../utils/excelExport';
import { formatLocalDate } from '../utils/dateHelpers';

interface VendorScorecardProps {
  vendedores: VendedorMetricas[];
  fechaInicio?: string;
  fechaFin?: string;
  onSeleccionarVendedor?: (vendedorId: string) => void;
}

export const VendorScorecard: React.FC<VendorScorecardProps> = ({
  vendedores,
  fechaInicio,
  fechaFin,
}) => {
  const [exportando, setExportando] = useState(false);

  const handleExportarExcel = async () => {
    setExportando(true);
    try {
      await exportarTablaAExcel(
        `Ranking_Vendedores_${fechaInicio || 'inicio'}_${fechaFin || formatLocalDate()}`,
        {
          name: 'Ranking Vendedores',
          title: 'Ranking y Scorecard de Cumplimiento por Asesor',
          subtitle: formatearSubtituloExportacion({
            fechaInicio,
            fechaFin,
            totalFilas: vendedores.length,
            modo: 'Scorecard de Vendedores',
          }),
          accentHex: 'D97706',
          columns: [
            { header: 'Asesor / Ejecutivo', key: 'vendedor_nombre', width: 28 },
            { header: 'Rol', key: 'rol', width: 20 },
            { header: 'Total Citas', key: 'total_citas', align: 'right' },
            { header: 'A Tiempo', key: 'citas_a_tiempo', align: 'right' },
            { header: 'Con Retraso', key: 'citas_tarde', align: 'right' },
            { header: 'No Llamó', key: 'citas_no_llamo', align: 'right' },
            { header: '% Cumplimiento', key: 'tasa_cumplimiento_pct', value: (v) => v.tasa_cumplimiento_pct / 100, numFmt: '0%', align: 'right' },
            { header: 'Desfase Medio (min)', key: 'promedio_desfase_minutos', align: 'right' },
            { header: 'Duración Media (min)', key: 'duracion_promedio_minutos', align: 'right' },
            { header: 'Score', key: 'score_rendimiento', semantic: 'status', align: 'center' },
          ],
          rows: vendedores,
        }
      );
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6 tabular-nums">
      {/* Title & Introduction */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500 dark:text-amber-400" />
            Ranking y Scorecard de Cumplimiento de Vendedores
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Evaluación objetiva basada en la puntualidad al iniciar la llamada y el cumplimiento de duración mínima pactada
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>Excelente (&ge;85%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            <span>Bueno (&ge;70%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span>Aceptable (&ge;50%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span>En Riesgo (&lt;50%)</span>
          </div>
          <button
            type="button"
            onClick={handleExportarExcel}
            disabled={exportando || vendedores.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{exportando ? 'Exportando...' : 'Descargar Excel'}</span>
          </button>
        </div>
      </div>

      {/* Vendor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vendedores.map((v, index) => {
          const esLider = index === 0 && v.tasa_cumplimiento_pct >= 75;
          return (
            <div
              key={v.vendedor_id}
              className={`rounded-2xl p-5 border transition-all shadow-xs ${
                esLider
                  ? 'bg-gradient-to-b from-indigo-50/70 via-white to-white border-indigo-300 dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900 dark:border-indigo-500/40'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {/* Header with Avatar and Score */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-gradient-to-tr dark:from-slate-800 dark:to-slate-700 border border-slate-300 dark:border-slate-600 flex items-center justify-center font-bold text-slate-800 dark:text-white text-base">
                      {v.vendedor_nombre
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')}
                    </div>
                    {esLider && (
                      <div className="absolute -top-1.5 -right-1.5 bg-amber-500 text-slate-950 p-0.5 rounded-full shadow">
                        <Award className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      {v.vendedor_nombre}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{v.rol}</p>
                  </div>
                </div>

                {/* Score Badge */}
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                    v.score_rendimiento === 'Excelente'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                      : v.score_rendimiento === 'Bueno'
                      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30'
                      : v.score_rendimiento === 'Aceptable'
                      ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
                      : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30'
                  }`}
                >
                  {v.score_rendimiento}
                </span>
              </div>

              {/* Progress Bar of On-Time Rate */}
              <div className="mt-4">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Cumplimiento a Tiempo</span>
                  <span className="font-bold text-slate-900 dark:text-white">{v.tasa_cumplimiento_pct}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      v.tasa_cumplimiento_pct >= 80
                        ? 'bg-emerald-500 dark:bg-emerald-400'
                        : v.tasa_cumplimiento_pct >= 60
                        ? 'bg-blue-500 dark:bg-blue-400'
                        : v.tasa_cumplimiento_pct >= 40
                        ? 'bg-amber-500 dark:bg-amber-400'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${v.tasa_cumplimiento_pct}%` }}
                  />
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800/80">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Citas Asignadas</span>
                  <span className="text-slate-900 dark:text-white font-bold text-sm">{v.total_citas}</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-0.5">
                    {v.citas_a_tiempo} a tiempo
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800/80">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Desfase Medio</span>
                  <span className="text-slate-900 dark:text-white font-bold text-sm">
                    {v.promedio_desfase_minutos > 0
                      ? `+${v.promedio_desfase_minutos}m`
                      : `${v.promedio_desfase_minutos}m`}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">vs hora agendada</span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800/80">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">No Llamó / Infracción</span>
                  <span
                    className={`font-bold text-sm ${
                      v.citas_no_llamo > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {v.citas_no_llamo} citas
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">sin llamada</span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800/80">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Duración Media</span>
                  <span className="text-slate-900 dark:text-white font-bold text-sm">
                    {v.duracion_promedio_minutos} min
                  </span>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 block mt-0.5">por llamada</span>
                </div>
              </div>

              {/* Warnings / Badges */}
              {v.citas_no_llamo > 0 && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-2 rounded-lg">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400 shrink-0" />
                  <span>Tiene {v.citas_no_llamo} cita(s) programada(s) que nunca llamó.</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
