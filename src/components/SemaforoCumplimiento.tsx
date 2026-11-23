import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Headphones,
  Search,
  X,
} from 'lucide-react';
import { CruceAuditoria, ParametrosAuditoria } from '../types';
import { PARAMETROS_DEFAULT } from '../data/mockData';
import { normalizarTipoReunion } from '../utils/leadValidation';
import { exportarTablaAExcel, formatearSubtituloExportacion } from '../utils/excelExport';
import { exportarTablaAPdf } from '../utils/pdfExport';
import { formatLocalDate } from '../utils/dateHelpers';
import {
  etiquetaSemaforoCruce,
  formatearAlcanceLeads,
  obtenerCanalLlamadaLabel,
} from '../utils/kpiExcelBuilder';
import { clasificarHorarioIngreso, obtenerTimestampCreacionLead } from '../utils/matchingEngine';

export type SemaforoGrupoKey = 'ROJO' | 'AMARILLO' | 'VERDE';

interface SemaforoCumplimientoProps {
  cruces: CruceAuditoria[];
  esNoCalificado?: boolean;
  paisFiltro?: string;
  asesorFiltro?: string;
  parametros?: ParametrosAuditoria;
  onVerTranscripcion?: (cruce: CruceAuditoria) => void;
  titulo?: string;
  heroAside?: React.ReactNode;
}

const ETIQUETA_TIPIFICACION: Record<string, string> = {
  A_TIEMPO: 'A Tiempo',
  ADELANTADA: 'Adelantada',
  TARDE_LEVE: 'Tarde Leve',
  TARDE_GRAVE: 'Tarde Grave',
  LLAMADA_CORTA: 'Tarde Leve (Corta)',
  NO_LLAMO: 'No Llamó',
  LLAMO_OTRO_DIA: 'Otro Día',
  PENDIENTE: 'Pendiente',
};

export function claseBadgeHorarioIngreso(horarioTipo: string): string {
  if (horarioTipo.includes('Fin de Semana')) {
    return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/50';
  }
  if (horarioTipo.includes('Viernes Tarde')) {
    return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/50';
  }
  if (horarioTipo.includes('Fuera de Horario') || horarioTipo.includes('Noche')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/50';
  }
  return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/50';
}

function obtenerFechaObjetivoStr(c: CruceAuditoria): string {
  return (
    c.cita?.fecha_agendada ||
    (c.fecha_cita ? c.fecha_cita.slice(0, 10) : '') ||
    (c.cita?.created_at ? String(c.cita.created_at).slice(0, 10) : '') ||
    'N/D'
  );
}

function obtenerHoraObjetivoStr(c: CruceAuditoria): string {
  if (c.cita?.hora_agendada) return String(c.cita.hora_agendada).slice(0, 5);
  if (c.fecha_cita && c.fecha_cita.length >= 16) return c.fecha_cita.slice(11, 16);
  return '--:--';
}

export const SemaforoCumplimiento: React.FC<SemaforoCumplimientoProps> = ({
  cruces,
  esNoCalificado = false,
  paisFiltro,
  asesorFiltro,
  parametros = PARAMETROS_DEFAULT,
  onVerTranscripcion,
  titulo = 'Semáforo de Cumplimiento',
  heroAside,
}) => {
  const [colorActivo, setColorActivo] = useState<SemaforoGrupoKey | null>(null);
  const [busquedaDetalle, setBusquedaDetalle] = useState('');
  const [filtroAsesorDetalle, setFiltroAsesorDetalle] = useState('TODOS');
  const [exportandoGrupo, setExportandoGrupo] = useState(false);
  const [exportandoGrupoPdf, setExportandoGrupoPdf] = useState(false);

  const tolAntes = parametros.tolerancia_anticipacion_minutos ?? 15;
  const tolDespues = parametros.tolerancia_retraso_a_tiempo_minutos ?? 20;
  const umbralGrave = parametros.umbral_retraso_grave_minutos ?? 120;
  const hIni = parametros.horario_laboral_inicio || '08:00';
  const hFin = parametros.horario_laboral_fin || '18:00';

  const grupos = useMemo(() => {
    const verde: CruceAuditoria[] = [];
    const amarillo: CruceAuditoria[] = [];
    const rojo: CruceAuditoria[] = [];
    let adelantadas = 0;
    let otroDia = 0;
    let noLlamo = 0;
    let pendientes = 0;

    cruces.forEach((c) => {
      if (c.estado_cumplimiento === 'A_TIEMPO') {
        verde.push(c);
      } else if (
        c.estado_cumplimiento === 'TARDE_LEVE' ||
        c.estado_cumplimiento === 'LLAMADA_CORTA'
      ) {
        amarillo.push(c);
      } else if (c.estado_cumplimiento === 'TARDE_GRAVE') {
        rojo.push(c);
      } else if (c.estado_cumplimiento === 'ADELANTADA') {
        adelantadas++;
      } else if (c.estado_cumplimiento === 'LLAMO_OTRO_DIA') {
        otroDia++;
      } else if (c.estado_cumplimiento === 'NO_LLAMO') {
        noLlamo++;
      } else if (c.estado_cumplimiento === 'PENDIENTE') {
        pendientes++;
      }
    });

    const sortReciente = (a: CruceAuditoria, b: CruceAuditoria) => {
      const fA = `${obtenerFechaObjetivoStr(a)}T${obtenerHoraObjetivoStr(a)}`;
      const fB = `${obtenerFechaObjetivoStr(b)}T${obtenerHoraObjetivoStr(b)}`;
      return fB.localeCompare(fA);
    };

    verde.sort(sortReciente);
    amarillo.sort(sortReciente);
    rojo.sort(sortReciente);

    const totalSemaforo = verde.length + amarillo.length + rojo.length;
    const denom = Math.max(1, totalSemaforo);

    return {
      verde,
      amarillo,
      rojo,
      adelantadas,
      otroDia,
      noLlamo,
      pendientes,
      totalSemaforo,
      pctVerde: totalSemaforo > 0 ? Math.round((verde.length / denom) * 100) : 0,
      pctAmarillo: totalSemaforo > 0 ? Math.round((amarillo.length / denom) * 100) : 0,
      pctRojo: totalSemaforo > 0 ? Math.round((rojo.length / denom) * 100) : 0,
    };
  }, [cruces]);

  const toggleColor = (key: SemaforoGrupoKey) => {
    setBusquedaDetalle('');
    setFiltroAsesorDetalle('TODOS');
    setColorActivo((prev) => (prev === key ? null : key));
  };

  const listaActiva = useMemo(() => {
    if (!colorActivo) return [];
    const base =
      colorActivo === 'VERDE'
        ? grupos.verde
        : colorActivo === 'AMARILLO'
        ? grupos.amarillo
        : grupos.rojo;

    return base.filter((c) => {
      if (
        filtroAsesorDetalle !== 'TODOS' &&
        (c.vendedor_nombre || 'Sin Asignar') !== filtroAsesorDetalle
      ) {
        return false;
      }
      if (busquedaDetalle.trim()) {
        const q = busquedaDetalle.toLowerCase();
        return (
          c.prospecto_nombre.toLowerCase().includes(q) ||
          (c.telefono || '').toLowerCase().includes(q) ||
          (c.vendedor_nombre || '').toLowerCase().includes(q) ||
          (c.cita?.codigo_prospecto || '').toLowerCase().includes(q) ||
          (c.horario_ingreso_tipo || '').toLowerCase().includes(q) ||
          (c.explicacion || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [colorActivo, grupos, filtroAsesorDetalle, busquedaDetalle]);

  const asesoresEnGrupo = useMemo(() => {
    if (!colorActivo) return [];
    const base =
      colorActivo === 'VERDE'
        ? grupos.verde
        : colorActivo === 'AMARILLO'
        ? grupos.amarillo
        : grupos.rojo;
    return Array.from(new Set(base.map((c) => c.vendedor_nombre || 'Sin Asignar'))).sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
  }, [colorActivo, grupos]);

  const infoColorActivo =
    colorActivo === 'VERDE'
      ? {
          titulo: 'A Tiempo (Luz Verde)',
          subtitulo: esNoCalificado
            ? `Hasta ${tolDespues} minutos hábiles de retraso (incluye el minuto ${tolDespues})`
            : `Llamadas dentro de tolerancia (-${tolAntes} / +${tolDespues} min incl.)`,
          accentHex: '15803D',
          badgeClass:
            'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60',
        }
      : colorActivo === 'AMARILLO'
      ? {
          titulo: 'Tarde Leve (Luz Amarilla)',
          subtitulo: `Desde el minuto ${tolDespues + 1} hasta antes de cumplir ${umbralGrave} min (${tolDespues + 1}–${umbralGrave - 1} min)`,
          accentHex: 'CA8A04',
          badgeClass:
            'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60',
        }
      : {
          titulo: 'Tarde Grave (Luz Roja)',
          subtitulo: `A partir de ${umbralGrave} minutos de retraso (2 horas exactas incluidas: ≥ ${umbralGrave} min)`,
          accentHex: 'B91C1C',
          badgeClass:
            'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60',
        };

  const construirHojaGrupo = () => {
    const alcanceLabel = formatearAlcanceLeads(esNoCalificado, paisFiltro);
    const asesorActivoTxt =
      filtroAsesorDetalle !== 'TODOS'
        ? `Ejecutivo: ${filtroAsesorDetalle}`
        : asesorFiltro && asesorFiltro !== 'TODOS'
        ? `Ejecutivo: ${asesorFiltro}`
        : undefined;
    return {
      name: `Semáforo ${colorActivo}`,
      title: `${infoColorActivo.titulo} — ${alcanceLabel}`,
      subtitle: formatearSubtituloExportacion({
        totalFilas: listaActiva.length,
        modo: alcanceLabel,
        extra: asesorActivoTxt,
      }),
      accentHex: infoColorActivo.accentHex,
      columns: [
        {
          header: 'Semáforo',
          key: 'semaforo',
          width: 24,
          value: (c: CruceAuditoria) => etiquetaSemaforoCruce(c.estado_cumplimiento).etiquetaSemaforo,
          semantic: 'semaforo' as const,
          align: 'center' as const,
        },
        { header: 'Código', key: 'codigo', width: 15, value: (c: CruceAuditoria) => c.cita?.codigo_prospecto || c.id },
        { header: 'Prospecto', key: 'prospecto_nombre', width: 28 },
        { header: 'Teléfono', key: 'telefono', width: 16 },
        { header: 'País', key: 'pais', width: 10, value: (c: CruceAuditoria) => String(c.pais || c.cita?.pais || 'SV').toUpperCase(), align: 'center' as const },
        { header: 'Ejecutivo', key: 'vendedor_nombre', width: 26 },
        {
          header: 'Horario Ingreso',
          key: 'horario_ingreso_tipo',
          width: 23,
          value: (c: CruceAuditoria) =>
            c.horario_ingreso_tipo ||
            clasificarHorarioIngreso(obtenerTimestampCreacionLead(c.cita), hIni, hFin),
          semantic: 'status' as const,
          align: 'center' as const,
        },
        { header: 'Tipo Reunión', key: 'tipo_reunion', width: 20, value: (c: CruceAuditoria) => normalizarTipoReunion(c.cita?.tipo_reunion) },
        { header: 'Fecha Objetivo', key: 'fecha_obj', width: 15, value: (c: CruceAuditoria) => obtenerFechaObjetivoStr(c), align: 'center' as const },
        { header: 'Hora Objetivo', key: 'hora_obj', width: 13, value: (c: CruceAuditoria) => obtenerHoraObjetivoStr(c), align: 'center' as const },
        { header: 'Llamada Real', key: 'fecha_llamada', width: 20, value: (c: CruceAuditoria) => (c.fecha_llamada ? c.fecha_llamada.replace('T', ' ').slice(0, 19) : 'Sin registro'), align: 'center' as const },
        { header: 'Canal de Llamada', key: 'canal_utilizado', width: 16, value: (c: CruceAuditoria) => obtenerCanalLlamadaLabel(c), align: 'center' as const },
        { header: 'Desfase (min)', key: 'desfase_minutos', width: 15, value: (c: CruceAuditoria) => c.desfase_minutos ?? '-', align: 'right' as const },
        { header: 'Diagnóstico', key: 'explicacion', width: 46, wrapText: true },
      ],
      rows: listaActiva,
    };
  };

  const handleExportarGrupo = async () => {
    if (!colorActivo || listaActiva.length === 0) return;
    setExportandoGrupo(true);
    try {
      await exportarTablaAExcel(`Semaforo_${colorActivo}_${formatLocalDate()}`, construirHojaGrupo());
    } finally {
      setExportandoGrupo(false);
    }
  };

  const handleExportarGrupoPdf = async () => {
    if (!colorActivo || listaActiva.length === 0) return;
    setExportandoGrupoPdf(true);
    try {
      await exportarTablaAPdf(`Semaforo_${colorActivo}_${formatLocalDate()}`, construirHojaGrupo());
    } finally {
      setExportandoGrupoPdf(false);
    }
  };

  // Definición de las 3 luces en orden real de semáforo de tránsito: Rojo (Tarde Grave), Amarillo (Tarde Leve), Verde (A Tiempo)
  const luces: Array<{
    key: SemaforoGrupoKey;
    titulo: string;
    subtitulo: string;
    count: number;
    pct: number;
    lensActive: string;
    lensIdle: string;
    rowActive: string;
    rowHover: string;
    titleColor: string;
    ringFocus: string;
  }> = [
    {
      key: 'ROJO',
      titulo: 'Tarde Grave',
      subtitulo: `A partir de ${umbralGrave} min de retraso (≥ 2h incl.)`,
      count: grupos.rojo.length,
      pct: grupos.pctRojo,
      lensActive:
        'bg-[radial-gradient(circle_at_35%_30%,#fda4af_0%,#ef4444_45%,#991b1b_100%)] shadow-[0_0_28px_rgba(239,68,68,0.85)] ring-4 ring-rose-400/50 scale-105',
      lensIdle:
        'bg-[radial-gradient(circle_at_35%_30%,#fca5a5_0%,#dc2626_55%,#7f1d1d_100%)] shadow-[0_0_16px_rgba(220,38,38,0.45)] opacity-90 group-hover:opacity-100',
      rowActive:
        'bg-rose-50 dark:bg-rose-950/50 border-rose-500 ring-2 ring-rose-500/25',
      rowHover:
        'bg-slate-50/80 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-rose-400 dark:hover:border-rose-700',
      titleColor: 'text-rose-700 dark:text-rose-400',
      ringFocus: 'focus-visible:ring-rose-500',
    },
    {
      key: 'AMARILLO',
      titulo: 'Tarde Leve',
      subtitulo: `Del min ${tolDespues + 1} antes de ${umbralGrave} min (${tolDespues + 1}–${umbralGrave - 1} min)`,
      count: grupos.amarillo.length,
      pct: grupos.pctAmarillo,
      lensActive:
        'bg-[radial-gradient(circle_at_35%_30%,#fef08a_0%,#f59e0b_50%,#b45309_100%)] shadow-[0_0_28px_rgba(245,158,11,0.85)] ring-4 ring-amber-300/50 scale-105 text-amber-950',
      lensIdle:
        'bg-[radial-gradient(circle_at_35%_30%,#fde047_0%,#f59e0b_60%,#92400e_100%)] shadow-[0_0_16px_rgba(245,158,11,0.45)] opacity-90 group-hover:opacity-100 text-amber-950',
      rowActive:
        'bg-amber-50 dark:bg-amber-950/45 border-amber-500 ring-2 ring-amber-500/25',
      rowHover:
        'bg-slate-50/80 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-700',
      titleColor: 'text-amber-700 dark:text-amber-400',
      ringFocus: 'focus-visible:ring-amber-500',
    },
    {
      key: 'VERDE',
      titulo: 'A Tiempo',
      subtitulo: esNoCalificado
        ? `Hasta ${tolDespues} min de retraso (min ${tolDespues} incl.)`
        : `En ventana (-${tolAntes} / +${tolDespues} min incl.)`,
      count: grupos.verde.length,
      pct: grupos.pctVerde,
      lensActive:
        'bg-[radial-gradient(circle_at_35%_30%,#86efac_0%,#10b981_48%,#065f46_100%)] shadow-[0_0_28px_rgba(16,185,129,0.85)] ring-4 ring-emerald-400/50 scale-105',
      lensIdle:
        'bg-[radial-gradient(circle_at_35%_30%,#6ee7b7_0%,#10b981_55%,#064e3b_100%)] shadow-[0_0_16px_rgba(16,185,129,0.45)] opacity-90 group-hover:opacity-100',
      rowActive:
        'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 ring-2 ring-emerald-500/25',
      rowHover:
        'bg-slate-50/80 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-700',
      titleColor: 'text-emerald-700 dark:text-emerald-400',
      ringFocus: 'focus-visible:ring-emerald-500',
    },
  ];

  return (
    <section
      aria-label={titulo}
      className="space-y-4 tabular-nums"
    >
      {/* Fila Superior: Opcional Tarjeta Grande (Citas del Período + 4 cajas fuera del semáforo) + Semáforo Real de Tránsito */}
      <div className={`grid grid-cols-1 ${heroAside ? 'xl:grid-cols-12' : ''} gap-5 items-stretch`}>
        {heroAside && (
          <div className="xl:col-span-4 flex flex-col">{heroAside}</div>
        )}

        {/* Tarjeta del Semáforo Estilo Real */}
        <div
          className={`${
            heroAside ? 'xl:col-span-8' : ''
          } bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4`}
        >
          {/* Header Semáforo */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                {titulo}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Toca cualquier luz del semáforo para ver el detalle de leads clasificados.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                En semáforo: <strong className="text-slate-900 dark:text-white">{grupos.totalSemaforo}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Adelantadas: <strong className="text-sky-600 dark:text-sky-400">{grupos.adelantadas}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Otro día: <strong className="text-indigo-600 dark:text-indigo-400">{grupos.otroDia}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                No llamó: <strong className="text-purple-600 dark:text-purple-400">{grupos.noLlamo}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Pendientes: <strong className="text-slate-700 dark:text-slate-300">{grupos.pendientes}</strong>
              </span>
            </div>
          </div>

          {/* Cuerpo del Semáforo: Carcasa Real Vertical + Paneles Alineados */}
          <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-5">
            {/* Carcasa Física de Semáforo de Tránsito */}
            <div className="relative flex flex-col items-center justify-center shrink-0">
              {/* Soporte superior */}
              <div className="w-8 h-2.5 bg-slate-700 dark:bg-slate-700 rounded-t-md border-x border-t border-slate-600" />
              {/* Caja del Semáforo */}
              <div className="relative bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 border-[3px] border-slate-700 rounded-[28px] px-3.5 py-4 shadow-xl flex sm:flex-col items-center gap-3.5">
                {/* Tornillos decorativos de carcasa */}
                <span className="hidden sm:block absolute top-2 left-2.5 w-1.5 h-1.5 rounded-full bg-slate-600" />
                <span className="hidden sm:block absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-slate-600" />
                <span className="hidden sm:block absolute bottom-2 left-2.5 w-1.5 h-1.5 rounded-full bg-slate-600" />
                <span className="hidden sm:block absolute bottom-2 right-2.5 w-1.5 h-1.5 rounded-full bg-slate-600" />

                {luces.map((luz) => {
                  const activo = colorActivo === luz.key;
                  const dimmed = colorActivo !== null && !activo;
                  return (
                    <div key={luz.key} className="relative flex flex-col items-center">
                      {/* Visera / capucha del semáforo */}
                      <div className="w-14 h-2.5 -mb-1.5 rounded-t-full bg-slate-950 border-t-2 border-x border-slate-600/80 z-10 pointer-events-none" />
                      {/* Cavidad y lente luminoso */}
                      <button
                        type="button"
                        onClick={() => toggleColor(luz.key)}
                        aria-pressed={activo}
                        aria-label={`${luz.titulo}: ${luz.count} (${luz.pct}%)`}
                        className={`relative w-16 h-16 rounded-full bg-slate-950 p-1.5 border border-slate-700 flex items-center justify-center cursor-pointer transition-all duration-200 focus-visible:outline-none ${luz.ringFocus} focus-visible:ring-2`}
                      >
                        <span
                          className={`w-full h-full rounded-full flex items-center justify-center font-black text-sm tracking-tight transition-all duration-200 ${
                            luz.key === 'AMARILLO' ? 'text-amber-950' : 'text-white'
                          } ${activo ? luz.lensActive : luz.lensIdle} ${
                            dimmed ? 'opacity-45 grayscale-[30%]' : ''
                          }`}
                        >
                          {luz.pct}%
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
              {/* Poste metálico inferior */}
              <div className="w-4 h-4 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-800 border-x border-slate-600" />
              <div className="w-12 h-1.5 bg-slate-700 rounded-full" />
            </div>

            {/* 3 Filas Alineadas con Cada Luz del Semáforo */}
            <div className="flex-1 w-full grid grid-rows-3 gap-3">
              {luces.map((luz) => {
                const activo = colorActivo === luz.key;
                return (
                  <button
                    key={luz.key}
                    type="button"
                    onClick={() => toggleColor(luz.key)}
                    aria-pressed={activo}
                    className={`group w-full flex items-center justify-between gap-4 px-4 py-3 rounded-xl border text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${luz.ringFocus} ${
                      activo ? luz.rowActive : luz.rowHover
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span
                        className={`w-3.5 h-3.5 rounded-full shrink-0 ${
                          luz.key === 'ROJO'
                            ? 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]'
                            : luz.key === 'AMARILLO'
                            ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.7)]'
                            : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-extrabold ${luz.titleColor}`}>
                            {luz.titulo}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {luz.pct}%
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {luz.subtitulo}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                        {luz.count}
                      </span>
                      <span className={`text-xs font-bold flex items-center gap-1 whitespace-nowrap ${luz.titleColor}`}>
                        {activo ? (
                          <>
                            Ocultar <ChevronUp className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            Ver detalle <ChevronDown className="h-3.5 w-3.5" />
                          </>
                        )}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Despliegue Interactivo del Detalle del Color Seleccionado */}
      {colorActivo && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${infoColorActivo.badgeClass}`}
                >
                  {infoColorActivo.titulo}
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {listaActiva.length} registros mostrados
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {infoColorActivo.subtitulo}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={busquedaDetalle}
                  onChange={(e) => setBusquedaDetalle(e.target.value)}
                  placeholder="Buscar prospecto, horario..."
                  className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 w-48"
                />
              </div>

              <select
                value={filtroAsesorDetalle}
                onChange={(e) => setFiltroAsesorDetalle(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="TODOS">Todos los ejecutivos ({asesoresEnGrupo.length})</option>
                {asesoresEnGrupo.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleExportarGrupo}
                disabled={exportandoGrupo || listaActiva.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{exportandoGrupo ? 'Exportando...' : 'Excel grupo'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportarGrupoPdf}
                disabled={exportandoGrupoPdf || listaActiva.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>{exportandoGrupoPdf ? 'PDF...' : 'PDF grupo'}</span>
              </button>

              <button
                type="button"
                onClick={() => setColorActivo(null)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                title="Cerrar detalle del semáforo"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cerrar</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[420px] border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-950 text-[11px] uppercase font-bold text-slate-600 dark:text-slate-400 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">Prospecto / Código</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Teléfono</th>
                  <th className="py-2.5 px-2 whitespace-nowrap text-center">País</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Ejecutivo</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Horario Ingreso</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Tipo Reunión</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Objetivo</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Llamada Real / Canal</th>
                  <th className="py-2.5 px-3 whitespace-nowrap text-right">Desfase</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Tipificación</th>
                  <th className="py-2.5 px-3">Diagnóstico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {listaActiva.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      No hay leads clasificados con los filtros seleccionados en esta categoría.
                    </td>
                  </tr>
                ) : (
                  listaActiva.map((item) => {
                    const paisStr = String(item.pais || item.cita?.pais || 'SV').toUpperCase();
                    const tipoStr = normalizarTipoReunion(item.cita?.tipo_reunion);
                    const horarioIng =
                      item.horario_ingreso_tipo ||
                      clasificarHorarioIngreso(obtenerTimestampCreacionLead(item.cita), hIni, hFin);
                    const tipif =
                      ETIQUETA_TIPIFICACION[item.estado_cumplimiento] || item.estado_cumplimiento;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white max-w-[200px] truncate">
                            {item.prospecto_nombre}
                          </div>
                          {item.cita?.codigo_prospecto && (
                            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                              {item.cita.codigo_prospecto}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                          {item.telefono || 'Sin número'}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold whitespace-nowrap">
                          {paisStr === 'GT' ? '🇬🇹 GT' : '🇸🇻 SV'}
                        </td>
                        <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                          {item.vendedor_nombre || 'Sin Asignar'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${claseBadgeHorarioIngreso(horarioIng)}`}
                          >
                            {horarioIng}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {tipoStr}
                        </td>
                        <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                          <div>{obtenerFechaObjetivoStr(item)}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {obtenerHoraObjetivoStr(item)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                          {item.fecha_llamada ? (
                            <div>
                              <div>{item.fecha_llamada.replace('T', ' ').slice(0, 16)}</div>
                              <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-sans font-semibold">
                                {item.canal_utilizado || 'Llamada'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400 font-sans font-semibold">
                              Sin llamada
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                          {item.desfase_minutos !== undefined
                            ? `${item.desfase_minutos > 0 ? `+${item.desfase_minutos}` : item.desfase_minutos}m`
                            : '-'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${
                              colorActivo === 'VERDE'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/50'
                                : colorActivo === 'AMARILLO'
                                ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/50'
                                : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/50'
                            }`}
                          >
                            {tipif}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 min-w-[220px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">
                              {item.explicacion}
                            </span>
                            {item.llamada && onVerTranscripcion && (
                              <button
                                type="button"
                                onClick={() => onVerTranscripcion(item)}
                                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold cursor-pointer"
                              >
                                <Headphones className="h-3 w-3" /> Consultar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

