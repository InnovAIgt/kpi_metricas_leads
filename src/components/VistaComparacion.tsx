import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Calendar,
  CalendarCheck,
  Download,
  FileText,
  FilterX,
  Globe2,
  MessageSquare,
  Phone,
  RotateCcw,
  Smartphone,
  User,
  UserPlus,
  Video,
} from 'lucide-react';
import {
  Cita,
  CruceAuditoria,
  Llamada,
  ModoLeads,
  ParametrosAuditoria,
} from '../types';
import { PARAMETROS_DEFAULT } from '../data/mockData';
import { formatLocalDate } from '../utils/dateHelpers';
import {
  CodigoPais,
  coincideAsesorFiltro,
  normalizarCodigoPais,
  obtenerEjecutivosPorPais,
} from '../utils/paisHelpers';
import {
  clasificarHorarioIngreso,
  obtenerTimestampCreacionLead,
} from '../utils/matchingEngine';
import { SemaforoCumplimiento } from './SemaforoCumplimiento';
import { ExcelSheetConfig, exportarLibroExcel } from '../utils/excelExport';
import { exportarLibroPdf } from '../utils/pdfExport';
import {
  etiquetaSemaforoCruce,
  formatearAlcanceLeads,
  obtenerCanalLlamadaLabel,
} from '../utils/kpiExcelBuilder';

interface VistaComparacionProps {
  crucesTodos: CruceAuditoria[];
  citasActivas?: Cita[];
  llamadas: Llamada[];
  catalogo: any[];
  parametros?: ParametrosAuditoria;
  modoLeads: ModoLeads;
  onVerTranscripcion?: (cruce: CruceAuditoria) => void;
}

type FiltroPaisGlobal = 'TODOS' | 'SV' | 'GT' | 'SV_VS_GT';

interface FiltroEscenario {
  asesor: string; // '' = sin seleccionar (por defecto), 'TODOS' = todos, o nombre específico
  fechaInicio: string;
  fechaFin: string;
}

interface EscenarioCalculado {
  activo: boolean;
  paisEfectivo: 'TODOS' | 'SV' | 'GT';
  filtro: FiltroEscenario;
  crucesFiltrados: CruceAuditoria[];
  asesoresDisponibles: string[];
  llamadasPeriodo: Llamada[];
  canales: { PBX: number; Celular: number; WhatsApp: number; Teams: number };
  conteos: {
    total: number;
    verde: number;
    amarillo: number;
    rojo: number;
    totalSemaforo: number;
    adelantada: number;
    otroDia: number;
    noLlamo: number;
    pendiente: number;
    auditables: number;
  };
  pctVerdeSemaforo: number;
  desfasePromedioMin: number;
  horarioCounts: {
    laboral: number;
    fueraHorario: number;
    viernesTarde: number;
    finSemana: number;
  };
  etiquetaRango: string;
  etiquetaEjecutivo: string;
  etiquetaPais: string;
}

function extraerFechaStr(cruce: CruceAuditoria): string {
  const raw =
    cruce.fecha_cita ||
    cruce.cita?.fecha_agendada ||
    cruce.cita?.fecha_hora_programada ||
    cruce.cita?.fecha_creado ||
    cruce.cita?.created_at ||
    '';
  const match = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function formatearPaisLabel(pais: 'TODOS' | 'SV' | 'GT'): string {
  if (pais === 'SV') return 'El Salvador (SV)';
  if (pais === 'GT') return 'Guatemala (GT)';
  return 'Todos los Países';
}

function resolverPaisEjecutivo(
  nombreAsesor: string,
  catalogo: any[],
  crucesTodos: CruceAuditoria[]
): CodigoPais | null {
  if (!nombreAsesor || nombreAsesor === 'TODOS') return null;

  for (const cat of catalogo || []) {
    const nom = String(cat?.nombre_ejecutivo || '').trim();
    if (nom && coincideAsesorFiltro(nombreAsesor, nom, catalogo)) {
      const p = normalizarCodigoPais(cat?.pais);
      if (p) return p;
    }
  }

  for (const c of crucesTodos || []) {
    if (c.vendedor_nombre && coincideAsesorFiltro(nombreAsesor, c.vendedor_nombre, catalogo)) {
      const p = normalizarCodigoPais(c.pais || c.cita?.pais);
      if (p) return p;
    }
  }

  return null;
}

function calcularDatosEscenario(
  filtro: FiltroEscenario,
  paisPanel: 'TODOS' | 'SV' | 'GT',
  paisGlobal: FiltroPaisGlobal,
  crucesTodos: CruceAuditoria[],
  llamadas: Llamada[],
  catalogo: any[],
  parametros: ParametrosAuditoria
): EscenarioCalculado {
  const asesoresDisponibles = obtenerEjecutivosPorPais(
    catalogo,
    crucesTodos,
    paisPanel
  );

  const tieneEjecutivo = Boolean(filtro.asesor);
  const tieneFechas = Boolean(filtro.fechaInicio || filtro.fechaFin);
  const activo = tieneEjecutivo || tieneFechas || paisGlobal !== 'TODOS';

  // Si un ejecutivo específico fue elegido en modo global TODOS, mostrar su país real como etiqueta informativa
  const paisEjecutivoReal =
    filtro.asesor && filtro.asesor !== 'TODOS'
      ? resolverPaisEjecutivo(filtro.asesor, catalogo, crucesTodos)
      : null;

  const paisEfectivo: 'TODOS' | 'SV' | 'GT' =
    paisPanel !== 'TODOS' ? paisPanel : paisEjecutivoReal || 'TODOS';

  const crucesFiltrados = !activo
    ? []
    : crucesTodos.filter((c) => {
        if (paisPanel !== 'TODOS') {
          const p = String(c.pais || c.cita?.pais || 'SV').toUpperCase();
          if (p !== paisPanel) return false;
        }
        if (filtro.asesor && filtro.asesor !== 'TODOS') {
          if (!coincideAsesorFiltro(filtro.asesor, c.vendedor_nombre, catalogo)) {
            return false;
          }
        }
        if (filtro.fechaInicio || filtro.fechaFin) {
          const f = extraerFechaStr(c);
          if (!f) return false;
          if (filtro.fechaInicio && f < filtro.fechaInicio) return false;
          if (filtro.fechaFin && f > filtro.fechaFin) return false;
        }
        return true;
      });

  const llamadasPeriodo = !activo
    ? []
    : llamadas.filter((ll) => {
        if (paisPanel !== 'TODOS') {
          const pCall = String(ll.pais || 'SV').toUpperCase();
          if (pCall !== paisPanel) return false;
        }
        if (filtro.asesor && filtro.asesor !== 'TODOS') {
          const cand =
            ll.vendedor_nombre ||
            (ll as any).asesor_nombre ||
            (ll as any).usuario ||
            (ll as any).ejecutivo_nombre ||
            '';
          if (!coincideAsesorFiltro(filtro.asesor, cand, catalogo)) return false;
        }
        if (filtro.fechaInicio || filtro.fechaFin) {
          const match = String(ll.fecha_hora_inicio || '').match(
            /^(\d{4}-\d{2}-\d{2})/
          );
          const f = match ? match[1] : '';
          if (!f) return false;
          if (filtro.fechaInicio && f < filtro.fechaInicio) return false;
          if (filtro.fechaFin && f > filtro.fechaFin) return false;
        }
        return true;
      });

  const canales = { PBX: 0, Celular: 0, WhatsApp: 0, Teams: 0 };
  llamadasPeriodo.forEach((ll) => {
    const ch = ll.canal_tipo || ll.proveedor;
    if (ch === 'PBX') canales.PBX++;
    else if (ch === 'Celular') canales.Celular++;
    else if (ch === 'WhatsApp') canales.WhatsApp++;
    else if (ch === 'Teams') canales.Teams++;
  });

  let verde = 0;
  let amarillo = 0;
  let rojo = 0;
  let adelantada = 0;
  let otroDia = 0;
  let noLlamo = 0;
  let pendiente = 0;
  let sumaDesfase = 0;
  let countDesfase = 0;
  const horarioCounts = {
    laboral: 0,
    fueraHorario: 0,
    viernesTarde: 0,
    finSemana: 0,
  };
  const hIni = parametros.horario_laboral_inicio || '08:00';
  const hFin = parametros.horario_laboral_fin || '18:00';

  crucesFiltrados.forEach((c) => {
    const est = c.estado_cumplimiento;
    if (est === 'A_TIEMPO') verde++;
    else if (est === 'TARDE_LEVE' || est === 'LLAMADA_CORTA') amarillo++;
    else if (est === 'TARDE_GRAVE') rojo++;
    else if (est === 'ADELANTADA') adelantada++;
    else if (est === 'LLAMO_OTRO_DIA') otroDia++;
    else if (est === 'NO_LLAMO') noLlamo++;
    else if (est === 'PENDIENTE') pendiente++;

    const hTipo =
      c.horario_ingreso_tipo ||
      clasificarHorarioIngreso(obtenerTimestampCreacionLead(c.cita), hIni, hFin);
    if (hTipo.includes('Fin de Semana')) horarioCounts.finSemana++;
    else if (hTipo.includes('Viernes Tarde')) horarioCounts.viernesTarde++;
    else if (hTipo.includes('Fuera de Horario') || hTipo.includes('Noche')) horarioCounts.fueraHorario++;
    else horarioCounts.laboral++;

    if (typeof c.desfase_minutos === 'number' && Number.isFinite(c.desfase_minutos)) {
      sumaDesfase += Math.abs(c.desfase_minutos);
      countDesfase++;
    }
  });

  const total = crucesFiltrados.length;
  const totalSemaforo = verde + amarillo + rojo;
  const auditables = Math.max(0, total - pendiente);
  const denomSem = Math.max(1, totalSemaforo);

  const etiquetaRango =
    !filtro.fechaInicio && !filtro.fechaFin
      ? 'Todas las fechas'
      : `${filtro.fechaInicio || 'Inicio'} → ${filtro.fechaFin || 'Hoy'}`;

  const etiquetaEjecutivo =
    filtro.asesor === ''
      ? 'Sin ejecutivo seleccionado'
      : filtro.asesor === 'TODOS'
      ? 'Todos los ejecutivos'
      : filtro.asesor;

  return {
    activo,
    paisEfectivo,
    filtro,
    crucesFiltrados,
    asesoresDisponibles,
    llamadasPeriodo,
    canales,
    conteos: {
      total,
      verde,
      amarillo,
      rojo,
      totalSemaforo,
      adelantada,
      otroDia,
      noLlamo,
      pendiente,
      auditables,
    },
    pctVerdeSemaforo: totalSemaforo > 0 ? Math.round((verde / denomSem) * 100) : 0,
    desfasePromedioMin:
      countDesfase > 0 ? Number((sumaDesfase / countDesfase).toFixed(1)) : 0,
    horarioCounts,
    etiquetaRango,
    etiquetaEjecutivo,
    etiquetaPais: formatearPaisLabel(paisEfectivo),
  };
}

interface PanelEscenarioProps {
  lado: 'A' | 'B';
  tituloBadge: string;
  paisPanel: 'TODOS' | 'SV' | 'GT';
  esCalificado: boolean;
  datos: EscenarioCalculado;
  catalogo: any[];
  crucesTodos: CruceAuditoria[];
  onChangeFiltro: (nuevo: FiltroEscenario) => void;
  parametros: ParametrosAuditoria;
  onVerTranscripcion?: (cruce: CruceAuditoria) => void;
}

const PanelEscenario: React.FC<PanelEscenarioProps> = ({
  lado,
  tituloBadge,
  paisPanel,
  esCalificado,
  datos,
  catalogo,
  crucesTodos,
  onChangeFiltro,
  parametros,
  onVerTranscripcion,
}) => {
  const esA = lado === 'A';
  const { conteos, canales } = datos;

  const tieneFiltrosEnPanel = Boolean(
    datos.filtro.asesor || datos.filtro.fechaInicio || datos.filtro.fechaFin
  );

  // Etiquetar el país junto al nombre cuando el selector superior está en "Todos los Países"
  const opcionesEjecutivos = useMemo(() => {
    return datos.asesoresDisponibles.map((nombre) => {
      const p = resolverPaisEjecutivo(nombre, catalogo, crucesTodos);
      return {
        nombre,
        pais: p,
        label: paisPanel === 'TODOS' && p ? `${nombre} (${p})` : nombre,
      };
    });
  }, [datos.asesoresDisponibles, catalogo, crucesTodos, paisPanel]);

  const segmentos = [
    { key: 'verde', label: 'A Tiempo', count: conteos.verde, bar: 'bg-emerald-500' },
    { key: 'amarillo', label: 'Tarde Leve', count: conteos.amarillo, bar: 'bg-amber-400' },
    { key: 'rojo', label: 'Tarde Grave', count: conteos.rojo, bar: 'bg-rose-500' },
    { key: 'adelantada', label: 'Adelantada', count: conteos.adelantada, bar: 'bg-sky-500' },
    { key: 'otroDia', label: 'Otro Día', count: conteos.otroDia, bar: 'bg-indigo-500' },
    { key: 'noLlamo', label: 'No Llamó', count: conteos.noLlamo, bar: 'bg-purple-500' },
    { key: 'pendiente', label: 'Pendiente', count: conteos.pendiente, bar: 'bg-slate-400 dark:bg-slate-600' },
  ];
  const totalBarra = Math.max(1, conteos.total);

  return (
    <div
      className={`rounded-2xl border bg-white dark:bg-slate-900 shadow-xs overflow-hidden flex flex-col ${
        esA
          ? 'border-indigo-200 dark:border-indigo-800/70'
          : 'border-emerald-200 dark:border-emerald-800/70'
      }`}
    >
      {/* Cabecera de la Tabla Comparativa */}
      <div
        className={`px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-2 ${
          esA
            ? 'bg-indigo-50/80 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800/60'
            : 'bg-emerald-50/80 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-black tracking-wide uppercase shrink-0 ${
              esA ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'
            }`}
          >
            {tituloBadge}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {datos.etiquetaEjecutivo}
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
              {datos.etiquetaPais} · {datos.etiquetaRango}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono font-bold">
          {datos.activo && (
            <span
              className={`px-2.5 py-1 rounded-lg border ${
                esA
                  ? 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                  : 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {conteos.total} {esCalificado ? 'citas' : 'leads'}
            </span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5 flex-1 flex flex-col">
        {/* Filtros Propios de Este Lado: Ejecutivo + Rango de Fechas (Desde / Hasta) */}
        <div className="bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3">
          {/* Selector de Ejecutivo (sin filtro de país adentro) */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2">
              <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={datos.filtro.asesor}
                onChange={(e) =>
                  onChangeFiltro({ ...datos.filtro, asesor: e.target.value })
                }
                aria-label={`Ejecutivo ${tituloBadge}`}
                className="w-full bg-white dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none cursor-pointer truncate"
              >
                <option
                  value=""
                  className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                >
                  -- Seleccionar ejecutivo --
                </option>
                <option
                  value="TODOS"
                  className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                >
                  Todos los ejecutivos ({opcionesEjecutivos.length})
                </option>
                {opcionesEjecutivos.map((op) => (
                  <option
                    key={op.nombre}
                    value={op.nombre}
                    className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {op.label}
                  </option>
                ))}
              </select>
            </div>

            {tieneFiltrosEnPanel && (
              <button
                type="button"
                onClick={() =>
                  onChangeFiltro({ asesor: '', fechaInicio: '', fechaFin: '' })
                }
                title={`Limpiar filtros de ${tituloBadge}`}
                className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Limpiar</span>
              </button>
            )}
          </div>

          {/* Rango de Fechas Desde / Hasta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="flex items-center gap-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 shrink-0">
                Desde
              </span>
              <input
                type="date"
                value={datos.filtro.fechaInicio}
                onChange={(e) =>
                  onChangeFiltro({ ...datos.filtro, fechaInicio: e.target.value })
                }
                className="w-full bg-transparent font-mono text-xs text-slate-900 dark:text-slate-100 outline-none"
              />
            </label>

            <label className="flex items-center gap-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 shrink-0">
                Hasta
              </span>
              <input
                type="date"
                value={datos.filtro.fechaFin}
                onChange={(e) =>
                  onChangeFiltro({ ...datos.filtro, fechaFin: e.target.value })
                }
                className="w-full bg-transparent font-mono text-xs text-slate-900 dark:text-slate-100 outline-none"
              />
            </label>
          </div>
        </div>

        {/* Estado Inicial en Blanco / Sin Selección, Sin Registros, o Tablita + Semáforo */}
        {!datos.activo ? (
          <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-950/30 space-y-2.5">
            <User className="h-9 w-9 text-slate-400" />
            <div className="space-y-1 max-w-sm">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {tituloBadge} en blanco
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Elige un ejecutivo específico (o <strong>Todos los ejecutivos</strong>), un rango de fechas <strong>Desde / Hasta</strong>, o selecciona un país arriba para cargar la información.
              </p>
            </div>
          </div>
        ) : conteos.total === 0 ? (
          <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/30 space-y-3">
            <FilterX className="h-10 w-10 text-slate-400" />
            <div className="space-y-1 max-w-sm">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Sin {esCalificado ? 'citas' : 'leads'} en {tituloBadge}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No se encontraron registros para <strong>{datos.etiquetaEjecutivo}</strong> en{' '}
                <strong>{datos.etiquetaPais}</strong> ({datos.etiquetaRango}).
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onChangeFiltro({ asesor: '', fechaInicio: '', fechaFin: '' })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Limpiar filtros de {tituloBadge}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tarjeta Resumen del Lado: Total Citas/Leads + 4 Cuadros + Canales + Horario */}
            <div className="bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`p-3 rounded-xl border ${
                      esCalificado
                        ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/50 text-amber-600 dark:text-amber-400'
                        : 'bg-cyan-50 dark:bg-cyan-950/60 border-cyan-200 dark:border-cyan-800/50 text-cyan-600 dark:text-cyan-400'
                    }`}
                  >
                    {esCalificado ? (
                      <CalendarCheck className="h-5 w-5" />
                    ) : (
                      <UserPlus className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                      {esCalificado ? 'Citas del Período' : 'Leads del Período'}
                    </span>
                    <div className="flex items-baseline gap-2.5">
                      <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
                        {conteos.total}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        ({conteos.auditables} auditables)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                      % A Tiempo (Semáforo)
                    </span>
                    <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                      {datos.pctVerdeSemaforo}%
                    </span>
                  </div>
                  <div className="h-9 w-px bg-slate-200 dark:bg-slate-800" />
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                      Desfase Medio
                    </span>
                    <span className="text-xl font-black font-mono text-slate-900 dark:text-white">
                      {datos.desfasePromedioMin}m
                    </span>
                  </div>
                </div>
              </div>

              {/* 4 cuadros fuera del semáforo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-white dark:bg-slate-900 rounded-xl py-2 px-2 border border-slate-200 dark:border-slate-800">
                  <span className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    Pendientes
                  </span>
                  <span className="text-base font-extrabold font-mono text-slate-700 dark:text-slate-200">
                    {conteos.pendiente}
                  </span>
                </div>
                <div className="bg-purple-50/70 dark:bg-purple-950/30 rounded-xl py-2 px-2 border border-purple-200/80 dark:border-purple-800/50">
                  <span className="block text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300">
                    No Llamó
                  </span>
                  <span className="text-base font-extrabold font-mono text-purple-700 dark:text-purple-300">
                    {conteos.noLlamo}
                  </span>
                </div>
                <div className="bg-indigo-50/70 dark:bg-indigo-950/30 rounded-xl py-2 px-2 border border-indigo-200/80 dark:border-indigo-800/50">
                  <span className="block text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300">
                    Otro Día
                  </span>
                  <span className="text-base font-extrabold font-mono text-indigo-700 dark:text-indigo-300">
                    {conteos.otroDia}
                  </span>
                </div>
                <div className="bg-sky-50/70 dark:bg-sky-950/30 rounded-xl py-2 px-2 border border-sky-200/80 dark:border-sky-800/50">
                  <span className="block text-[10px] font-bold uppercase text-sky-700 dark:text-sky-300">
                    Adelantadas
                  </span>
                  <span className="text-base font-extrabold font-mono text-sky-700 dark:text-sky-300">
                    {conteos.adelantada}
                  </span>
                </div>
              </div>

              {/* Barra Apilada + Canales + Horario Ingreso */}
              <div className="space-y-2 pt-1">
                <div className="h-2.5 w-full rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 flex">
                  {segmentos.map((seg) => {
                    if (seg.count === 0) return null;
                    const w = (seg.count / totalBarra) * 100;
                    return (
                      <div
                        key={seg.key}
                        style={{ width: `${w}%` }}
                        className={`${seg.bar} h-full`}
                        title={`${seg.label}: ${seg.count} (${Math.round(w)}%)`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="font-semibold">
                    Llamadas período:{' '}
                    <strong className="font-mono text-slate-900 dark:text-white">
                      {datos.llamadasPeriodo.length}
                    </strong>
                  </span>
                  <div className="flex flex-wrap items-center gap-3 font-mono">
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3 text-indigo-500" /> PBX {canales.PBX}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Smartphone className="h-3 w-3 text-sky-500" /> Cel {canales.Celular}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3 w-3 text-emerald-500" /> WA {canales.WhatsApp}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Video className="h-3 w-3 text-purple-500" /> Teams {canales.Teams}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1 border-t border-slate-200/70 dark:border-slate-800/80 text-slate-600 dark:text-slate-400">
                  <span className="font-semibold">Ingreso leads:</span>
                  <div className="flex flex-wrap items-center gap-2.5 font-mono">
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Laboral {datos.horarioCounts.laboral}
                    </span>
                    <span className="text-indigo-700 dark:text-indigo-400">
                      Fuera/Noche {datos.horarioCounts.fueraHorario}
                    </span>
                    <span className="text-amber-700 dark:text-amber-400">
                      Vie ≥16:30 {datos.horarioCounts.viernesTarde}
                    </span>
                    <span className="text-sky-700 dark:text-sky-400">
                      Fin Sem. {datos.horarioCounts.finSemana}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Semáforo Real Interactivo para este Escenario */}
            <SemaforoCumplimiento
              cruces={datos.crucesFiltrados}
              esNoCalificado={!esCalificado}
              paisFiltro={datos.paisEfectivo}
              asesorFiltro={
                datos.filtro.asesor && datos.filtro.asesor !== 'TODOS'
                  ? datos.filtro.asesor
                  : undefined
              }
              parametros={parametros}
              onVerTranscripcion={onVerTranscripcion}
              titulo={`Semáforo ${tituloBadge} · ${datos.etiquetaEjecutivo}`}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const VistaComparacion: React.FC<VistaComparacionProps> = ({
  crucesTodos,
  llamadas,
  catalogo,
  parametros = PARAMETROS_DEFAULT,
  modoLeads,
  onVerTranscripcion,
}) => {
  const esCalificado = modoLeads === 'calificados';

  // Filtro global de país ARRIBA: 'TODOS' | 'SV' | 'GT' | 'SV_VS_GT'
  const [paisGlobal, setPaisGlobal] = useState<FiltroPaisGlobal>('TODOS');

  // Por defecto arranca en BLANCO sin seleccionar nada automáticamente
  const [filtroA, setFiltroA] = useState<FiltroEscenario>({
    asesor: '',
    fechaInicio: '',
    fechaFin: '',
  });

  const [filtroB, setFiltroB] = useState<FiltroEscenario>({
    asesor: '',
    fechaInicio: '',
    fechaFin: '',
  });

  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);

  const paisPanelA: 'TODOS' | 'SV' | 'GT' =
    paisGlobal === 'SV_VS_GT' ? 'SV' : paisGlobal === 'SV' ? 'SV' : paisGlobal === 'GT' ? 'GT' : 'TODOS';
  const paisPanelB: 'TODOS' | 'SV' | 'GT' =
    paisGlobal === 'SV_VS_GT' ? 'GT' : paisGlobal === 'SV' ? 'SV' : paisGlobal === 'GT' ? 'GT' : 'TODOS';

  const datosA = useMemo(
    () =>
      calcularDatosEscenario(
        filtroA,
        paisPanelA,
        paisGlobal,
        crucesTodos,
        llamadas,
        catalogo,
        parametros
      ),
    [filtroA, paisPanelA, paisGlobal, crucesTodos, llamadas, catalogo, parametros]
  );

  const datosB = useMemo(
    () =>
      calcularDatosEscenario(
        filtroB,
        paisPanelB,
        paisGlobal,
        crucesTodos,
        llamadas,
        catalogo,
        parametros
      ),
    [filtroB, paisPanelB, paisGlobal, crucesTodos, llamadas, catalogo, parametros]
  );

  // Si cambia el país arriba y el ejecutivo elegido en A o B ya no pertenece a ese país, limpiarlo automáticamente
  useEffect(() => {
    if (
      filtroA.asesor &&
      filtroA.asesor !== 'TODOS' &&
      !datosA.asesoresDisponibles.some((a) => coincideAsesorFiltro(a, filtroA.asesor, catalogo))
    ) {
      setFiltroA((prev) => ({ ...prev, asesor: '' }));
    }
  }, [paisPanelA, datosA.asesoresDisponibles, filtroA.asesor, catalogo]);

  useEffect(() => {
    if (
      filtroB.asesor &&
      filtroB.asesor !== 'TODOS' &&
      !datosB.asesoresDisponibles.some((a) => coincideAsesorFiltro(a, filtroB.asesor, catalogo))
    ) {
      setFiltroB((prev) => ({ ...prev, asesor: '' }));
    }
  }, [paisPanelB, datosB.asesoresDisponibles, filtroB.asesor, catalogo]);

  const intercambiarEscenarios = () => {
    setFiltroA(filtroB);
    setFiltroB(filtroA);
  };

  const limpiarTodo = () => {
    setPaisGlobal('TODOS');
    setFiltroA({ asesor: '', fechaInicio: '', fechaFin: '' });
    setFiltroB({ asesor: '', fechaInicio: '', fechaFin: '' });
  };

  const tieneAlgoActivo = datosA.activo || datosB.activo;

  // Construcción de libro Excel / PDF comparativo
  const construirLibroComparacion = (): ExcelSheetConfig<any>[] => {
    const modoLabel = formatearAlcanceLeads(!esCalificado, 'TODOS');
    const filasResumen = [
      {
        metrica: 'País',
        escenarioA: datosA.etiquetaPais,
        escenarioB: datosB.etiquetaPais,
        diferencia:
          datosA.etiquetaPais === datosB.etiquetaPais
            ? 'Mismo país'
            : `${datosA.paisEfectivo} vs ${datosB.paisEfectivo}`,
      },
      {
        metrica: 'Ejecutivo',
        escenarioA: datosA.etiquetaEjecutivo,
        escenarioB: datosB.etiquetaEjecutivo,
        diferencia:
          datosA.etiquetaEjecutivo === datosB.etiquetaEjecutivo
            ? 'Mismo ejecutivo'
            : 'Comparativa ejecutivos',
      },
      {
        metrica: 'Rango de Fechas',
        escenarioA: datosA.etiquetaRango,
        escenarioB: datosB.etiquetaRango,
        diferencia:
          datosA.etiquetaRango === datosB.etiquetaRango ? 'Mismo período' : 'Períodos distintos',
      },
      {
        metrica: esCalificado ? 'Total Citas' : 'Total Leads',
        escenarioA: datosA.conteos.total,
        escenarioB: datosB.conteos.total,
        diferencia: datosB.conteos.total - datosA.conteos.total,
      },
      {
        metrica: '% A Tiempo (Semáforo)',
        escenarioA: `${datosA.pctVerdeSemaforo}%`,
        escenarioB: `${datosB.pctVerdeSemaforo}%`,
        diferencia: `${datosB.pctVerdeSemaforo - datosA.pctVerdeSemaforo >= 0 ? '+' : ''}${datosB.pctVerdeSemaforo - datosA.pctVerdeSemaforo} pts`,
      },
      {
        metrica: 'A Tiempo (Verde)',
        escenarioA: datosA.conteos.verde,
        escenarioB: datosB.conteos.verde,
        diferencia: datosB.conteos.verde - datosA.conteos.verde,
      },
      {
        metrica: 'Tarde Leve (Amarillo)',
        escenarioA: datosA.conteos.amarillo,
        escenarioB: datosB.conteos.amarillo,
        diferencia: datosB.conteos.amarillo - datosA.conteos.amarillo,
      },
      {
        metrica: 'Tarde Grave (Rojo)',
        escenarioA: datosA.conteos.rojo,
        escenarioB: datosB.conteos.rojo,
        diferencia: datosB.conteos.rojo - datosA.conteos.rojo,
      },
      {
        metrica: 'No Llamó',
        escenarioA: datosA.conteos.noLlamo,
        escenarioB: datosB.conteos.noLlamo,
        diferencia: datosB.conteos.noLlamo - datosA.conteos.noLlamo,
      },
      {
        metrica: 'Otro Día',
        escenarioA: datosA.conteos.otroDia,
        escenarioB: datosB.conteos.otroDia,
        diferencia: datosB.conteos.otroDia - datosA.conteos.otroDia,
      },
      {
        metrica: 'Adelantadas',
        escenarioA: datosA.conteos.adelantada,
        escenarioB: datosB.conteos.adelantada,
        diferencia: datosB.conteos.adelantada - datosA.conteos.adelantada,
      },
      {
        metrica: 'Pendientes',
        escenarioA: datosA.conteos.pendiente,
        escenarioB: datosB.conteos.pendiente,
        diferencia: datosB.conteos.pendiente - datosA.conteos.pendiente,
      },
      {
        metrica: 'Desfase Medio (min)',
        escenarioA: datosA.desfasePromedioMin,
        escenarioB: datosB.desfasePromedioMin,
        diferencia: Number((datosB.desfasePromedioMin - datosA.desfasePromedioMin).toFixed(1)),
      },
    ];

    const colsDetalle = [
      {
        header: 'Semáforo',
        key: 'semaforo',
        width: 22,
        value: (c: CruceAuditoria) => etiquetaSemaforoCruce(c.estado_cumplimiento).etiquetaSemaforo,
        semantic: 'semaforo' as const,
        align: 'center' as const,
      },
      { header: 'Código', key: 'codigo', width: 15, value: (c: CruceAuditoria) => c.cita?.codigo_prospecto || c.id },
      { header: 'Prospecto', key: 'prospecto_nombre', width: 26 },
      { header: 'Teléfono', key: 'telefono', width: 15 },
      { header: 'País', key: 'pais', width: 10, value: (c: CruceAuditoria) => String(c.pais || c.cita?.pais || 'SV').toUpperCase(), align: 'center' as const },
      { header: 'Ejecutivo', key: 'vendedor_nombre', width: 24 },
      { header: 'Fecha', key: 'fecha', width: 14, value: (c: CruceAuditoria) => extraerFechaStr(c) || 'N/D', align: 'center' as const },
      { header: 'Canal', key: 'canal', width: 14, value: (c: CruceAuditoria) => obtenerCanalLlamadaLabel(c), align: 'center' as const },
      { header: 'Desfase (min)', key: 'desfase_minutos', width: 14, value: (c: CruceAuditoria) => c.desfase_minutos ?? '-', align: 'right' as const },
    ];

    return [
      {
        name: 'Resumen Comparativo',
        title: `Comparación A vs B — ${modoLabel}`,
        subtitle: `Escenario A (${datosA.etiquetaEjecutivo} · ${datosA.etiquetaPais} · ${datosA.etiquetaRango}) vs Escenario B (${datosB.etiquetaEjecutivo} · ${datosB.etiquetaPais} · ${datosB.etiquetaRango})`,
        accentHex: '4F46E5',
        columns: [
          { header: 'Indicador / Métrica', key: 'metrica', width: 30 },
          { header: `Escenario A (${datosA.etiquetaEjecutivo})`, key: 'escenarioA', width: 28, align: 'right' },
          { header: `Escenario B (${datosB.etiquetaEjecutivo})`, key: 'escenarioB', width: 28, align: 'right' },
          { header: 'Diferencia (B - A)', key: 'diferencia', width: 24, align: 'right' },
        ],
        rows: filasResumen,
      },
      {
        name: 'Detalle Escenario A',
        title: `Detalle Escenario A — ${datosA.etiquetaEjecutivo} (${datosA.etiquetaPais})`,
        subtitle: `Período: ${datosA.etiquetaRango} · Registros: ${datosA.crucesFiltrados.length}`,
        accentHex: '4F46E5',
        columns: colsDetalle,
        rows: datosA.crucesFiltrados,
      },
      {
        name: 'Detalle Escenario B',
        title: `Detalle Escenario B — ${datosB.etiquetaEjecutivo} (${datosB.etiquetaPais})`,
        subtitle: `Período: ${datosB.etiquetaRango} · Registros: ${datosB.crucesFiltrados.length}`,
        accentHex: '059669',
        columns: colsDetalle,
        rows: datosB.crucesFiltrados,
      },
    ];
  };

  const handleExportarExcel = async () => {
    setExportandoExcel(true);
    try {
      await exportarLibroExcel(
        `Comparacion_${esCalificado ? 'Calificados' : 'NoCalificados'}_${formatLocalDate()}`,
        construirLibroComparacion()
      );
    } finally {
      setExportandoExcel(false);
    }
  };

  const handleExportarPdf = async () => {
    setExportandoPdf(true);
    try {
      await exportarLibroPdf(
        `Comparacion_${esCalificado ? 'Calificados' : 'NoCalificados'}_${formatLocalDate()}`,
        construirLibroComparacion()
      );
    } finally {
      setExportandoPdf(false);
    }
  };

  const tituloLadoA =
    paisGlobal === 'SV_VS_GT' ? 'El Salvador (A)' : 'Escenario A';
  const tituloLadoB =
    paisGlobal === 'SV_VS_GT' ? 'Guatemala (B)' : 'Escenario B';

  return (
    <div className="space-y-5 tabular-nums">
      {/* Barra Superior Limpia con Selector de País Arriba */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-4 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${
              esCalificado
                ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-500/40'
                : 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/80 dark:text-cyan-300 dark:border-cyan-500/40'
            }`}
          >
            {esCalificado ? 'Leads Calificados (Citas)' : 'Leads No Calificados (Directos)'}
          </span>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Comparación · Herramientas
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Selector de País Arriba */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
            <Globe2 className="h-3.5 w-3.5 text-slate-400 ml-2 shrink-0 hidden sm:block" />
            {(
              [
                { id: 'TODOS', label: 'Todos Países' },
                { id: 'SV', label: 'El Salvador (SV)' },
                { id: 'GT', label: 'Guatemala (GT)' },
                { id: 'SV_VS_GT', label: 'SV vs GT' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPaisGlobal(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  paisGlobal === opt.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={intercambiarEscenarios}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
            title="Intercambiar selecciones entre izquierda y derecha"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-500" />
            <span>Intercambiar</span>
          </button>

          {tieneAlgoActivo && (
            <button
              type="button"
              onClick={limpiarTodo}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-300 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
              title="Restablecer todo en blanco"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Limpiar</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportarExcel}
            disabled={exportandoExcel || !tieneAlgoActivo}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{exportandoExcel ? 'Excel...' : 'Excel'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportarPdf}
            disabled={exportandoPdf || !tieneAlgoActivo}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>{exportandoPdf ? 'PDF...' : 'PDF'}</span>
          </button>
        </div>
      </div>

      {/* PANTALLA DIVIDIDA EN 2 TABLAS COMPARATIVAS */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4 items-stretch">
        <PanelEscenario
          lado="A"
          tituloBadge={tituloLadoA}
          paisPanel={paisPanelA}
          esCalificado={esCalificado}
          datos={datosA}
          catalogo={catalogo}
          crucesTodos={crucesTodos}
          onChangeFiltro={setFiltroA}
          parametros={parametros}
          onVerTranscripcion={onVerTranscripcion}
        />

        <div className="flex xl:flex-col items-center justify-center gap-2 py-2 xl:py-6 px-1 select-none">
          <div className="flex-1 h-0.5 xl:h-auto xl:w-0.5 bg-gradient-to-r xl:bg-gradient-to-b from-transparent via-slate-300 dark:via-slate-700 to-slate-300 dark:to-slate-700" />
          <div className="px-2.5 py-1.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black tracking-widest shadow-md border-2 border-slate-200 dark:border-slate-700">
            VS
          </div>
          <div className="flex-1 h-0.5 xl:h-auto xl:w-0.5 bg-gradient-to-r xl:bg-gradient-to-b from-slate-300 dark:from-slate-700 via-slate-300 dark:via-slate-700 to-transparent" />
        </div>

        <PanelEscenario
          lado="B"
          tituloBadge={tituloLadoB}
          paisPanel={paisPanelB}
          esCalificado={esCalificado}
          datos={datosB}
          catalogo={catalogo}
          crucesTodos={crucesTodos}
          onChangeFiltro={setFiltroB}
          parametros={parametros}
          onVerTranscripcion={onVerTranscripcion}
        />
      </div>
    </div>
  );
};
