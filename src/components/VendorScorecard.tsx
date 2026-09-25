import React from 'react';
import {
  Trophy,
  Award,
  AlertTriangle,
  Clock,
  PhoneCall,
  UserCheck,
  CheckCircle2,
  XCircle,
  TrendingUp,
} from 'lucide-react';
import { VendedorMetricas } from '../types';

interface VendorScorecardProps {
  vendedores: VendedorMetricas[];
  onSeleccionarVendedor?: (vendedorId: string) => void;
}

export const VendorScorecard: React.FC<VendorScorecardProps> = ({
  vendedores,
  onSeleccionarVendedor,
}) => {
  return (
    <div className="space-y-6">
      {/* Title & Introduction */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-400" />
            Ranking y Scorecard de Cumplimiento de Vendedores
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Evaluación objetiva basada en la puntualidad al iniciar la llamada y el cumplimiento de
            duración mínima pactada
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span>Excelente (&ge;85%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
            <span>Bueno (&ge;70%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span>Aceptable (&ge;50%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span>En Riesgo (&lt;50%)</span>
          </div>
        </div>
      </div>

      {/* Vendor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vendedores.map((v, index) => {
          const esLider = index === 0 && v.tasa_cumplimiento_pct >= 75;
          return (
            <div
              key={v.vendedor_id}
              className={`rounded-2xl p-5 border transition-all ${
                esLider
                  ? 'bg-gradient-to-b from-indigo-950/40 via-slate-900 to-slate-900 border-indigo-500/40 shadow-md shadow-indigo-500/10'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Header with Avatar and Score */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-slate-800 to-slate-700 border border-slate-600 flex items-center justify-center font-bold text-white text-base">
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
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      {v.vendedor_nombre}
                    </h3>
                    <p className="text-[11px] text-slate-400">{v.rol}</p>
                  </div>
                </div>

                {/* Score Badge */}
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                    v.score_rendimiento === 'Excelente'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : v.score_rendimiento === 'Bueno'
                      ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                      : v.score_rendimiento === 'Aceptable'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  }`}
                >
                  {v.score_rendimiento}
                </span>
              </div>

              {/* Progress Bar of On-Time Rate */}
              <div className="mt-4">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400 font-medium">Cumplimiento a Tiempo</span>
                  <span className="font-bold text-white">{v.tasa_cumplimiento_pct}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      v.tasa_cumplimiento_pct >= 80
                        ? 'bg-emerald-400'
                        : v.tasa_cumplimiento_pct >= 60
                        ? 'bg-blue-400'
                        : v.tasa_cumplimiento_pct >= 40
                        ? 'bg-amber-400'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${v.tasa_cumplimiento_pct}%` }}
                  />
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800 text-xs">
                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/80">
                  <span className="text-slate-400 text-[11px] block">Citas Asignadas</span>
                  <span className="text-white font-bold text-sm">{v.total_citas}</span>
                  <span className="text-[10px] text-emerald-400 block mt-0.5">
                    {v.citas_a_tiempo} a tiempo
                  </span>
                </div>

                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/80">
                  <span className="text-slate-400 text-[11px] block">Desfase Medio</span>
                  <span className="text-white font-bold text-sm">
                    {v.promedio_desfase_minutos > 0
                      ? `+${v.promedio_desfase_minutos}m`
                      : `${v.promedio_desfase_minutos}m`}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">vs hora agendada</span>
                </div>

                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/80">
                  <span className="text-slate-400 text-[11px] block">No Llamó / Infracción</span>
                  <span
                    className={`font-bold text-sm ${
                      v.citas_no_llamo > 0 ? 'text-rose-400' : 'text-slate-300'
                    }`}
                  >
                    {v.citas_no_llamo} citas
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">sin llamada</span>
                </div>

                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/80">
                  <span className="text-slate-400 text-[11px] block">Duración Media</span>
                  <span className="text-white font-bold text-sm">
                    {v.duracion_promedio_minutos} min
                  </span>
                  <span className="text-[10px] text-indigo-400 block mt-0.5">por llamada</span>
                </div>
              </div>

              {/* Warnings / Badges */}
              {v.citas_no_llamo > 0 && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-rose-300 bg-rose-950/40 border border-rose-900/60 p-2 rounded-lg">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
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
