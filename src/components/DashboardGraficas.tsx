import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { VendedorMetricas } from '../types';

export interface DatoMensualDashboard {
  mesKey: string; // YYYY-MM
  labelCorto: string; // "Nov 26"
  labelLargo: string; // "Noviembre 2026"
  esMesActual: boolean;
  total: number;
  auditables: number;
  aTiempo: number;
  tarde: number;
  noLlamo: number;
  pendientes: number;
  pctCumplimiento: number;
}

interface SegmentoDonut {
  key: string;
  label: string;
  count: number;
  color: string;
}

interface DashboardGraficasProps {
  rankingVendedores: VendedorMetricas[];
  conteosEstado: {
    A_TIEMPO: number;
    TARDE_LEVE: number;
    TARDE_GRAVE: number;
    LLAMO_OTRO_DIA: number;
    NO_LLAMO: number;
    PENDIENTE: number;
    LLAMADA_CORTA: number;
    ADELANTADA: number;
  };
  canalesPeriodo: {
    PBX: number;
    Celular: number;
    WhatsApp: number;
    Teams: number;
  };
  comparativaMensual: DatoMensualDashboard[];
  esCalificado: boolean;
  onIrAKpi1: () => void;
}

export const DashboardGraficas: React.FC<DashboardGraficasProps> = ({
  rankingVendedores,
  conteosEstado,
  canalesPeriodo,
  comparativaMensual,
  esCalificado,
  onIrAKpi1,
}) => {
  const [modoPastel, setModoPastel] = useState<'estados' | 'canales'>('estados');
  const [sliceHover, setSliceHover] = useState<string | null>(null);

  const [modoBarrasEjec, setModoBarrasEjec] = useState<'pct' | 'volumen'>('volumen');
  const [ejecHover, setEjecHover] = useState<string | null>(null);

  const [mesHover, setMesHover] = useState<string | null>(null);
  const [mesBaseKey, setMesBaseKey] = useState<string>('');
  const [mesCompKey, setMesCompKey] = useState<string>('');

  // Inicializar los 2 meses a comparar (penúltimo vs último / mes anterior vs mes actual)
  useEffect(() => {
    if (comparativaMensual.length === 0) return;
    const ultimo = comparativaMensual[comparativaMensual.length - 1]?.mesKey || '';
    const penultimo =
      comparativaMensual.length >= 2
        ? comparativaMensual[comparativaMensual.length - 2].mesKey
        : ultimo;

    if (!mesCompKey || !comparativaMensual.some((m) => m.mesKey === mesCompKey)) {
      setMesCompKey(ultimo);
    }
    if (!mesBaseKey || !comparativaMensual.some((m) => m.mesKey === mesBaseKey)) {
      setMesBaseKey(penultimo);
    }
  }, [comparativaMensual, mesBaseKey, mesCompKey]);

  // 1. Datos para Gráfico de Pastel / Donut
  const segmentosPastel: SegmentoDonut[] = useMemo(() => {
    if (modoPastel === 'canales') {
      return [
        { key: 'PBX', label: 'PBX (VoIP)', count: canalesPeriodo.PBX, color: '#e11d48' },
        { key: 'Celular', label: 'Celular Corporativo', count: canalesPeriodo.Celular, color: '#2563eb' },
        { key: 'WhatsApp', label: 'WhatsApp', count: canalesPeriodo.WhatsApp, color: '#10b981' },
        { key: 'Teams', label: 'Teams / Virtual', count: canalesPeriodo.Teams, color: '#7c3aed' },
      ];
    }
    return [
      { key: 'A_TIEMPO', label: 'A Tiempo', count: conteosEstado.A_TIEMPO, color: '#10b981' },
      { key: 'ADELANTADA', label: 'Adelantada', count: conteosEstado.ADELANTADA, color: '#0ea5e9' },
      { key: 'TARDE_LEVE', label: 'Tarde Leve', count: conteosEstado.TARDE_LEVE, color: '#f59e0b' },
      { key: 'TARDE_GRAVE', label: 'Retraso Grave', count: conteosEstado.TARDE_GRAVE, color: '#f97316' },
      { key: 'LLAMO_OTRO_DIA', label: 'Otro Día', count: conteosEstado.LLAMO_OTRO_DIA, color: '#6366f1' },
      { key: 'NO_LLAMO', label: 'No Llamó', count: conteosEstado.NO_LLAMO, color: '#ef4444' },
      { key: 'PENDIENTE', label: 'Pendiente', count: conteosEstado.PENDIENTE, color: '#94a3b8' },
    ];
  }, [modoPastel, conteosEstado, canalesPeriodo]);

  const totalPastel = useMemo(
    () => segmentosPastel.reduce((acc, s) => acc + s.count, 0),
    [segmentosPastel]
  );

  const arcosDonut = useMemo(() => {
    const r = 74;
    const circunferencia = 2 * Math.PI * r;
    let acumulado = 0;
    return segmentosPastel
      .filter((s) => s.count > 0)
      .map((seg) => {
        const fraccion = totalPastel > 0 ? seg.count / totalPastel : 0;
        const longitud = fraccion * circunferencia;
        const offset = -acumulado;
        acumulado += longitud;
        return {
          ...seg,
          pct: Math.round(fraccion * 100),
          dashArray: `${longitud} ${circunferencia}`,
          dashOffset: offset,
          r,
        };
      });
  }, [segmentosPastel, totalPastel]);

  const segActivo = useMemo(
    () => arcosDonut.find((s) => s.key === sliceHover) || null,
    [arcosDonut, sliceHover]
  );

  // 2. Datos para Comparativa de Ejecutivos (Top 10 por volumen o cumplimiento)
  const ejecutivosTop = useMemo(() => {
    const copia = [...rankingVendedores];
    if (modoBarrasEjec === 'pct') {
      copia.sort(
        (a, b) =>
          b.tasa_cumplimiento_pct - a.tasa_cumplimiento_pct ||
          b.total_citas - a.total_citas
      );
    } else {
      copia.sort((a, b) => b.total_citas - a.total_citas);
    }
    return copia.slice(0, 10);
  }, [rankingVendedores, modoBarrasEjec]);

  const maxLeadsEjec = useMemo(
    () => Math.max(1, ...ejecutivosTop.map((e) => e.total_citas)),
    [ejecutivosTop]
  );

  const ejecSeleccionado = useMemo(
    () =>
      ejecutivosTop.find((e) => e.vendedor_id === ejecHover) ||
      ejecutivosTop[0] ||
      null,
    [ejecutivosTop, ejecHover]
  );

  // 3. Datos para Comparativa Mensual
  const maxTotalMensual = useMemo(
    () => Math.max(1, ...comparativaMensual.map((m) => m.total)),
    [comparativaMensual]
  );

  const mesBaseObj = useMemo(
    () => comparativaMensual.find((m) => m.mesKey === mesBaseKey) || null,
    [comparativaMensual, mesBaseKey]
  );

  const mesCompObj = useMemo(
    () => comparativaMensual.find((m) => m.mesKey === mesCompKey) || null,
    [comparativaMensual, mesCompKey]
  );

  const mesTooltipObj = useMemo(
    () => comparativaMensual.find((m) => m.mesKey === mesHover) || null,
    [comparativaMensual, mesHover]
  );

  const renderDelta = (actual: number, previo: number, suffix = '', invertColor = false) => {
    const diff = actual - previo;
    if (diff === 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <Minus className="h-3 w-3" /> 0{suffix}
        </span>
      );
    }
    const esPositivo = diff > 0;
    const esBueno = invertColor ? !esPositivo : esPositivo;
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${
          esBueno
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-rose-600 dark:text-rose-400'
        }`}
      >
        {esPositivo ? (
          <ArrowUpRight className="h-3.5 w-3.5" />
        ) : (
          <ArrowDownRight className="h-3.5 w-3.5" />
        )}
        {esPositivo ? `+${diff}` : diff}
        {suffix}
      </span>
    );
  };

  return (
    <div className="space-y-6 tabular-nums">
      {/* Fila 1: Gráfico de Pastel (Donut) + Gráfico de Barras Comparando Ejecutivos */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Gráfico de Pastel / Donut */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-indigo-500" />
                Gráfico de Pastel · {modoPastel === 'estados' ? 'Cumplimiento' : 'Canales'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Proporción interactiva en el período seleccionado
              </p>
            </div>
            <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => {
                  setModoPastel('estados');
                  setSliceHover(null);
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  modoPastel === 'estados'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Estados
              </button>
              <button
                type="button"
                onClick={() => {
                  setModoPastel('canales');
                  setSliceHover(null);
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  modoPastel === 'canales'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Canales
              </button>
            </div>
          </div>

          {totalPastel === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              Sin registros suficientes en el rango de fechas para graficar.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
              {/* SVG Donut */}
              <div className="sm:col-span-5 flex items-center justify-center">
                <div className="relative w-44 h-44">
                  <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                    <circle
                      cx="100"
                      cy="100"
                      r="74"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="26"
                      className="text-slate-100 dark:text-slate-800"
                    />
                    {arcosDonut.map((seg) => {
                      const esActivo = sliceHover === seg.key;
                      return (
                        <circle
                          key={seg.key}
                          cx="100"
                          cy="100"
                          r={seg.r}
                          fill="transparent"
                          stroke={seg.color}
                          strokeWidth={esActivo ? 32 : 26}
                          strokeDasharray={seg.dashArray}
                          strokeDashoffset={seg.dashOffset}
                          onMouseEnter={() => setSliceHover(seg.key)}
                          onMouseLeave={() => setSliceHover(null)}
                          className="transition-all duration-150 cursor-pointer"
                          style={{
                            opacity:
                              sliceHover && !esActivo ? 0.35 : 1,
                          }}
                        />
                      );
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[110px]">
                      {segActivo ? segActivo.label : modoPastel === 'estados' ? 'Total Leads' : 'Llamadas'}
                    </span>
                    <span className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">
                      {segActivo ? segActivo.count : totalPastel}
                    </span>
                    {segActivo && (
                      <span
                        className="text-xs font-bold"
                        style={{ color: segActivo.color }}
                      >
                        {segActivo.pct}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Leyenda tabular */}
              <div className="sm:col-span-7 divide-y divide-slate-100 dark:divide-slate-800/80">
                {segmentosPastel.map((seg) => {
                  const pct =
                    totalPastel > 0 ? Math.round((seg.count / totalPastel) * 100) : 0;
                  const activo = sliceHover === seg.key;
                  return (
                    <button
                      key={seg.key}
                      type="button"
                      onMouseEnter={() => setSliceHover(seg.key)}
                      onMouseLeave={() => setSliceHover(null)}
                      onClick={() =>
                        setSliceHover((prev) => (prev === seg.key ? null : seg.key))
                      }
                      className={`w-full flex items-center justify-between py-2 px-2 rounded-lg text-xs transition-colors cursor-pointer ${
                        activo
                          ? 'bg-slate-100 dark:bg-slate-800'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                          {seg.label}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0 font-mono">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {seg.count}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 w-9 text-right">
                          {pct}%
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Gráfico de Barras Comparando Ejecutivos */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-amber-500" />
                Comparativa por Ejecutivo ({esCalificado ? 'Calificados' : 'No Calificados'})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Top {ejecutivosTop.length} asesores comparados por{' '}
                {modoBarrasEjec === 'volumen' ? 'volumen y resultado' : '% de cumplimiento (meta 80%)'}
              </p>
            </div>
            <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setModoBarrasEjec('volumen')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  modoBarrasEjec === 'volumen'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Volumen
              </button>
              <button
                type="button"
                onClick={() => setModoBarrasEjec('pct')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  modoBarrasEjec === 'pct'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                % Meta
              </button>
            </div>
          </div>

          {ejecutivosTop.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              No hay datos de ejecutivos en el rango seleccionado.
            </div>
          ) : (
            <div className="space-y-2.5">
              {ejecutivosTop.map((ej) => {
                const tarde = ej.citas_tarde_leve + ej.citas_tarde_grave;
                const otros = Math.max(0, ej.total_citas - ej.citas_a_tiempo - tarde - ej.citas_no_llamo);
                const pctWidth = Math.min(100, Math.max(2, ej.tasa_cumplimiento_pct));
                const wATiempo = (ej.citas_a_tiempo / maxLeadsEjec) * 100;
                const wTarde = (tarde / maxLeadsEjec) * 100;
                const wNoLlamo = (ej.citas_no_llamo / maxLeadsEjec) * 100;
                const wOtros = (otros / maxLeadsEjec) * 100;
                const barColorPct =
                  ej.tasa_cumplimiento_pct >= 80
                    ? 'bg-emerald-500'
                    : ej.tasa_cumplimiento_pct >= 50
                    ? 'bg-amber-500'
                    : 'bg-rose-500';

                return (
                  <button
                    key={ej.vendedor_id}
                    type="button"
                    onMouseEnter={() => setEjecHover(ej.vendedor_id)}
                    onClick={onIrAKpi1}
                    className="w-full text-left group cursor-pointer"
                    title={`${ej.vendedor_nombre}: ${ej.citas_a_tiempo} a tiempo, ${tarde} tarde, ${ej.citas_no_llamo} no llamó (${ej.tasa_cumplimiento_pct}%)`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1 gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                        {ej.vendedor_nombre}
                      </span>
                      <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 shrink-0">
                        {modoBarrasEjec === 'volumen' ? (
                          <>
                            <strong className="text-slate-900 dark:text-white">{ej.total_citas}</strong> leads ·{' '}
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              {ej.citas_a_tiempo} OK
                            </span>{' '}
                            ({ej.tasa_cumplimiento_pct}%)
                          </>
                        ) : (
                          <>
                            <strong className="text-slate-900 dark:text-white">
                              {ej.tasa_cumplimiento_pct}%
                            </strong>{' '}
                            ({ej.citas_a_tiempo}/{ej.total_citas})
                          </>
                        )}
                      </span>
                    </div>
                    <div className="relative h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                      {modoBarrasEjec === 'volumen' ? (
                        <>
                          {wATiempo > 0 && (
                            <div
                              style={{ width: `${wATiempo}%` }}
                              className="h-full bg-emerald-500 transition-all"
                            />
                          )}
                          {wTarde > 0 && (
                            <div
                              style={{ width: `${wTarde}%` }}
                              className="h-full bg-amber-500 transition-all"
                            />
                          )}
                          {wNoLlamo > 0 && (
                            <div
                              style={{ width: `${wNoLlamo}%` }}
                              className="h-full bg-rose-500 transition-all"
                            />
                          )}
                          {wOtros > 0 && (
                            <div
                              style={{ width: `${wOtros}%` }}
                              className="h-full bg-slate-400 dark:bg-slate-600 transition-all"
                            />
                          )}
                        </>
                      ) : (
                        <>
                          <div
                            style={{ width: `${pctWidth}%` }}
                            className={`h-full ${barColorPct} rounded-full transition-all`}
                          />
                          {/* Línea de meta 80% */}
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-slate-900/40 dark:bg-white/50"
                            style={{ left: '80%' }}
                            title="Meta 80%"
                          />
                        </>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Leyenda + Detalle del ejecutivo enfocado */}
              <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> A Tiempo
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" /> Con Retraso
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" /> No Llamó
                  </span>
                </div>
                {ejecSeleccionado && (
                  <span className="font-mono text-slate-600 dark:text-slate-300">
                    {ejecSeleccionado.vendedor_nombre}: {ejecSeleccionado.citas_a_tiempo} OK ·{' '}
                    {ejecSeleccionado.citas_tarde_leve + ejecSeleccionado.citas_tarde_grave} tarde ·{' '}
                    {ejecSeleccionado.citas_no_llamo} sin llamada
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fila 2: Comparativa Mensual (Mes Actual vs Meses Anteriores) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Comparativa Mensual · Mes Actual vs Meses Anteriores
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Evolución histórica mensual de leads, llamadas a tiempo, brechas y % de cumplimiento (todos los meses con registros)
            </p>
          </div>

          {comparativaMensual.length >= 2 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Comparar:</span>
              <select
                value={mesBaseKey}
                onChange={(e) => setMesBaseKey(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              >
                {comparativaMensual.map((m) => (
                  <option key={m.mesKey} value={m.mesKey}>
                    {m.labelLargo}
                  </option>
                ))}
              </select>
              <span className="text-slate-400 font-bold">vs</span>
              <select
                value={mesCompKey}
                onChange={(e) => setMesCompKey(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              >
                {comparativaMensual.map((m) => (
                  <option key={m.mesKey} value={m.mesKey}>
                    {m.labelLargo} {m.esMesActual ? '(Actual)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {comparativaMensual.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Sin datos históricos mensuales disponibles.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Gráfico de Barras Agrupadas por Mes */}
            <div className="xl:col-span-7 space-y-3">
              <div className="overflow-x-auto pb-1">
                <div className="min-w-[440px]">
                  <div className="grid gap-3 items-end h-52 pt-6 pb-2 border-b border-slate-200 dark:border-slate-800"
                    style={{ gridTemplateColumns: `repeat(${comparativaMensual.length}, minmax(0, 1fr))` }}
                  >
                    {comparativaMensual.map((m) => {
                      const hTotal = Math.max(4, Math.round((m.total / maxTotalMensual) * 145));
                      const hOk = Math.max(m.aTiempo > 0 ? 4 : 0, Math.round((m.aTiempo / maxTotalMensual) * 145));
                      const hNoLlamo = Math.max(m.noLlamo > 0 ? 4 : 0, Math.round((m.noLlamo / maxTotalMensual) * 145));
                      const activo = mesHover === m.mesKey;
                      return (
                        <div
                          key={m.mesKey}
                          onMouseEnter={() => setMesHover(m.mesKey)}
                          onMouseLeave={() => setMesHover(null)}
                          className={`flex flex-col items-center justify-end h-full px-1.5 rounded-t-xl transition-colors cursor-pointer ${
                            activo
                              ? 'bg-slate-50 dark:bg-slate-800/50'
                              : m.esMesActual
                              ? 'bg-indigo-50/40 dark:bg-indigo-950/20'
                              : ''
                          }`}
                          title={`${m.labelLargo}: ${m.total} leads · ${m.aTiempo} a tiempo · ${m.noLlamo} no llamó (${m.pctCumplimiento}%)`}
                        >
                          <div className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 mb-1.5 font-mono">
                            {m.pctCumplimiento}%
                          </div>
                          <div className="flex items-end justify-center gap-1 w-full">
                            <div
                              style={{ height: `${hTotal}px` }}
                              className="w-3 sm:w-4 rounded-t bg-slate-400 dark:bg-slate-600 transition-all"
                              title={`Total: ${m.total}`}
                            />
                            <div
                              style={{ height: `${hOk}px` }}
                              className="w-3 sm:w-4 rounded-t bg-emerald-500 transition-all"
                              title={`A Tiempo: ${m.aTiempo}`}
                            />
                            <div
                              style={{ height: `${hNoLlamo}px` }}
                              className="w-3 sm:w-4 rounded-t bg-rose-500 transition-all"
                              title={`No Llamó: ${m.noLlamo}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Etiquetas de Meses */}
                  <div
                    className="grid gap-3 pt-2 text-center"
                    style={{ gridTemplateColumns: `repeat(${comparativaMensual.length}, minmax(0, 1fr))` }}
                  >
                    {comparativaMensual.map((m) => (
                      <div key={m.mesKey} className="text-[11px]">
                        <div
                          className={`font-bold ${
                            m.esMesActual
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {m.labelCorto}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          {m.total} leads
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Leyenda + tooltip de mes */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-slate-400 dark:bg-slate-600" /> Total Leads
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> A Tiempo (OK)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" /> No Llamó
                  </span>
                </div>
                {mesTooltipObj && (
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {mesTooltipObj.labelLargo}: {mesTooltipObj.aTiempo} OK / {mesTooltipObj.total} ({mesTooltipObj.pctCumplimiento}%)
                  </span>
                )}
              </div>
            </div>

            {/* Tarjeta de Comparación Directa Mes Base vs Mes Comparado */}
            <div className="xl:col-span-5 divide-y divide-slate-100 dark:divide-slate-800/80 border-t xl:border-t-0 xl:border-l border-slate-100 dark:border-slate-800 pt-4 xl:pt-0 xl:pl-6">
              {mesBaseObj && mesCompObj ? (
                <>
                  <div className="pb-3 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {mesCompObj.labelCorto} vs {mesBaseObj.labelCorto}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      Variación directa
                    </span>
                  </div>

                  {[
                    {
                      label: '% Cumplimiento',
                      base: mesBaseObj.pctCumplimiento,
                      comp: mesCompObj.pctCumplimiento,
                      suffix: '%',
                      invert: false,
                    },
                    {
                      label: 'Total Leads',
                      base: mesBaseObj.total,
                      comp: mesCompObj.total,
                      suffix: '',
                      invert: false,
                    },
                    {
                      label: 'Llamadas A Tiempo',
                      base: mesBaseObj.aTiempo,
                      comp: mesCompObj.aTiempo,
                      suffix: '',
                      invert: false,
                    },
                    {
                      label: 'Con Retraso',
                      base: mesBaseObj.tarde,
                      comp: mesCompObj.tarde,
                      suffix: '',
                      invert: true,
                    },
                    {
                      label: 'No Llamó',
                      base: mesBaseObj.noLlamo,
                      comp: mesCompObj.noLlamo,
                      suffix: '',
                      invert: true,
                    },
                  ].map((fila) => {
                    const maxRow = Math.max(1, fila.base, fila.comp);
                    return (
                      <div key={fila.label} className="py-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {fila.label}
                          </span>
                          <div className="flex items-center gap-3 font-mono">
                            <span className="text-slate-500 dark:text-slate-400">
                              {mesBaseObj.labelCorto}: <strong className="text-slate-700 dark:text-slate-200">{fila.base}{fila.suffix}</strong>
                            </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {mesCompObj.labelCorto}: <strong className="text-slate-900 dark:text-white">{fila.comp}{fila.suffix}</strong>
                            </span>
                            {renderDelta(fila.comp, fila.base, fila.suffix, fila.invert)}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-slate-400 dark:bg-slate-500 rounded-full"
                              style={{ width: `${Math.round((fila.base / maxRow) * 100)}%` }}
                            />
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ width: `${Math.round((fila.comp / maxRow) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
