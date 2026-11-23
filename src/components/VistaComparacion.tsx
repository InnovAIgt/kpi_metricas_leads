import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Calendar,
  CalendarCheck,
  Download,
  FileText,
  FilterX,
  MessageSquare,
  Phone,
  PhoneCall,
  RotateCcw,
  Smartphone,
  TrendingDown,
  TrendingUp,
  User,
  UserPlus,
  Users,
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
import {
  formatLocalDate,
  getMesActualInfo,
  getMesAnteriorInfo,
  getRangoDefaultLeads,
  getRangoMesAnterior,
} from '../utils/dateHelpers';
import {
  coincideAsesorFiltro,
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
  citasActivas: Cita[];
  llamadas: Llamada[];
  catalogo: any[];
  parametros?: ParametrosAuditoria;
  modoLeads: ModoLeads;
  onVerTranscripcion?: (cruce: CruceAuditoria) => void;
}

interface FiltroEscenario {
  pais: 'TODOS' | 'SV' | 'GT';
  asesor: string;
  fechaInicio: string;
  fechaFin: string;
}

interface EscenarioCalculado {
  filtro: FiltroEscenario;
  crucesPeriodo: CruceAuditoria[];
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
  pctAmarilloSemaforo: number;
  pctRojoSemaforo: number;
  pctCumplimientoAuditables: number;
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

function getRangoUltimosNDias(dias: number): { inicio: string; fin: string } {
  const hoy = new Date();
  const ini = new Date(hoy);
  ini.setDate(hoy.getDate() - Math.max(0, dias - 1));
  return {
    inicio: formatLocalDate(ini),
    fin: formatLocalDate(hoy),
  };
}

function formatearPaisLabel(pais: 'TODOS' | 'SV' | 'GT'): string {
  if (pais === 'SV') return 'El Salvador (SV)';
  if (pais === 'GT') return 'Guatemala (GT)';
  return 'Todos Países (SV + GT)';
}

function calcularDatosEscenario(
  filtro: FiltroEscenario,
  crucesTodos: CruceAuditoria[],
  llamadas: Llamada[],
  catalogo: any[],
  parametros: ParametrosAuditoria
): EscenarioCalculado {
  const crucesPeriodo = crucesTodos.filter((c) => {
    if (filtro.fechaInicio || filtro.fechaFin) {
      const f = extraerFechaStr(c);
      if (!f) return false;
      if (filtro.fechaInicio && f < filtro.fechaInicio) return false;
      if (filtro.fechaFin && f > filtro.fechaFin) return false;
    }
    return true;
  });

  const asesoresDisponibles = obtenerEjecutivosPorPais(
    catalogo,
    crucesPeriodo,
    filtro.pais
  );

  const crucesFiltrados = crucesPeriodo.filter((c) => {
    if (filtro.pais !== 'TODOS') {
      const p = String(c.pais || c.cita?.pais || 'SV').toUpperCase();
      if (p !== filtro.pais) return false;
    }
    if (filtro.asesor && filtro.asesor !== 'TODOS') {
      if (!coincideAsesorFiltro(filtro.asesor, c.vendedor_nombre, catalogo)) {
        return false;
      }
    }
    return true;
  });

  const llamadasPeriodo = llamadas.filter((ll) => {
    if (filtro.pais !== 'TODOS') {
      const pCall = String(ll.pais || 'SV').toUpperCase();
      if (pCall !== filtro.pais) return false;
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
      ? 'Histórico Completo'
      : `${filtro.fechaInicio || 'Inicio'} → ${filtro.fechaFin || 'Hoy'}`;

  return {
    filtro,
    crucesPeriodo,
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
    pctAmarilloSemaforo: totalSemaforo > 0 ? Math.round((amarillo / denomSem) * 100) : 0,
    pctRojoSemaforo: totalSemaforo > 0 ? Math.round((rojo / denomSem) * 100) : 0,
    pctCumplimientoAuditables:
      auditables > 0 ? Math.round((verde / auditables) * 100) : 0,
    desfasePromedioMin:
      countDesfase > 0 ? Number((sumaDesfase / countDesfase).toFixed(1)) : 0,
    horarioCounts,
    etiquetaRango,
    etiquetaEjecutivo:
      filtro.asesor === 'TODOS' ? 'Todos los ejecutivos' : filtro.asesor,
    etiquetaPais: formatearPaisLabel(filtro.pais),
  };
}

interface PanelEscenarioProps {
  lado: 'A' | 'B';
  tituloBadge: string;
  subtituloRol: string;
  esCalificado: boolean;
  datos: EscenarioCalculado;
  onChangeFiltro: (nuevo: FiltroEscenario) => void;
  parametros: ParametrosAuditoria;
  onVerTranscripcion?: (cruce: CruceAuditoria) => void;
}

const PanelEscenario: React.FC<PanelEscenarioProps> = ({
  lado,
  tituloBadge,
  subtituloRol,
  esCalificado,
  datos,
  onChangeFiltro,
  parametros,
  onVerTranscripcion,
}) => {
  const esA = lado === 'A';
  const mesActual = useMemo(() => getMesActualInfo(), []);
  const mesAnterior = useMemo(() => getMesAnteriorInfo(), []);

  // Mantener coherencia cuando cambia el país y el ejecutivo seleccionado ya no pertenece a ese país
  useEffect(() => {
    if (
      datos.filtro.asesor !== 'TODOS' &&
      !datos.asesoresDisponibles.some((a) =>
        coincideAsesorFiltro(a, datos.filtro.asesor)
      )
    ) {
      onChangeFiltro({ ...datos.filtro, asesor: 'TODOS' });
    }
  }, [datos.asesoresDisponibles, datos.filtro, onChangeFiltro]);

  const aplicarRangoRapido = (tipo: 'mes_actual' | 'mes_anterior' | '7d' | 'hoy' | 'todo') => {
    if (tipo === 'mes_actual') {
      const r = getRangoDefaultLeads();
      onChangeFiltro({ ...datos.filtro, fechaInicio: r.inicio, fechaFin: r.fin });
    } else if (tipo === 'mes_anterior') {
      const r = getRangoMesAnterior();
      onChangeFiltro({ ...datos.filtro, fechaInicio: r.inicio, fechaFin: r.fin });
    } else if (tipo === '7d') {
      const r = getRangoUltimosNDias(7);
      onChangeFiltro({ ...datos.filtro, fechaInicio: r.inicio, fechaFin: r.fin });
    } else if (tipo === 'hoy') {
      const hoy = formatLocalDate(new Date());
      onChangeFiltro({ ...datos.filtro, fechaInicio: hoy, fechaFin: hoy });
    } else {
      onChangeFiltro({ ...datos.filtro, fechaInicio: '', fechaFin: '' });
    }
  };

  const esPreset = (tipo: 'mes_actual' | 'mes_anterior' | '7d' | 'hoy' | 'todo') => {
    const { fechaInicio, fechaFin } = datos.filtro;
    if (tipo === 'mes_actual') {
      const r = getRangoDefaultLeads();
      return fechaInicio === r.inicio && fechaFin === r.fin;
    }
    if (tipo === 'mes_anterior') {
      const r = getRangoMesAnterior();
      return fechaInicio === r.inicio && fechaFin === r.fin;
    }
    if (tipo === '7d') {
      const r = getRangoUltimosNDias(7);
      return fechaInicio === r.inicio && fechaFin === r.fin;
    }
    if (tipo === 'hoy') {
      const hoy = formatLocalDate(new Date());
      return fechaInicio === hoy && fechaFin === hoy;
    }
    return !fechaInicio && !fechaFin;
  };

  const { conteos, canales } = datos;
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
      {/* Cabecera distintiva del Escenario (A vs B) */}
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
              esA
                ? 'bg-indigo-600 text-white'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {tituloBadge}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {datos.etiquetaEjecutivo}
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
              {subtituloRol} · {datos.etiquetaPais} · {datos.etiquetaRango}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono font-bold">
          <span
            className={`px-2.5 py-1 rounded-lg border ${
              esA
                ? 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                : 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {conteos.total} {esCalificado ? 'citas' : 'leads'}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-5 flex-1 flex flex-col">
        {/* Controles Independientes del Escenario */}
        <div className="bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3">
          {/* Fila 1: País + Ejecutivo */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
            {/* País */}
            <div className="sm:col-span-5 flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
              {(['TODOS', 'SV', 'GT'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onChangeFiltro({ ...datos.filtro, pais: p })}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                    datos.filtro.pais === p
                      ? esA
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {p === 'TODOS' ? 'Todos' : p === 'SV' ? '🇸🇻 SV' : '🇬🇹 GT'}
                </button>
              ))}
            </div>

            {/* Ejecutivo */}
            <div className="sm:col-span-7 flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5">
              <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={datos.filtro.asesor}
                onChange={(e) =>
                  onChangeFiltro({ ...datos.filtro, asesor: e.target.value })
                }
                aria-label={`Ejecutivo ${tituloBadge}`}
                className="w-full bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer truncate"
              >
                <option value="TODOS">
                  Todos los ejecutivos ({datos.asesoresDisponibles.length})
                </option>
                {datos.asesoresDisponibles.map((as) => (
                  <option key={as} value={as}>
                    {as}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fila 2: Rango de Fechas */}
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">
                Desde
              </span>
              <input
                type="date"
                value={datos.filtro.fechaInicio}
                onChange={(e) =>
                  onChangeFiltro({ ...datos.filtro, fechaInicio: e.target.value })
                }
                className="w-full bg-transparent font-mono text-xs text-slate-800 dark:text-slate-200 outline-none"
              />
            </label>

            <label className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">
                Hasta
              </span>
              <input
                type="date"
                value={datos.filtro.fechaFin}
                onChange={(e) =>
                  onChangeFiltro({ ...datos.filtro, fechaFin: e.target.value })
                }
                className="w-full bg-transparent font-mono text-xs text-slate-800 dark:text-slate-200 outline-none"
              />
            </label>
          </div>

          {/* Fila 3: Presets Rápidos de Fecha */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400 mr-0.5 shrink-0" />
            {(
              [
                { id: 'mes_actual', label: `${mesActual.nombreMes} (Al día)` },
                { id: 'mes_anterior', label: `${mesAnterior.nombreMes}` },
                { id: '7d', label: 'Últimos 7 días' },
                { id: 'hoy', label: 'Hoy' },
                { id: 'todo', label: 'Todo' },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => aplicarRangoRapido(btn.id)}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
                  esPreset(btn.id)
                    ? esA
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Estado Vacío o Dashboard del Escenario */}
        {conteos.total === 0 ? (
          <div className="flex-1 min-h-[320px] flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/30 space-y-3">
            <FilterX className="h-10 w-10 text-slate-400" />
            <div className="space-y-1 max-w-sm">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Sin {esCalificado ? 'citas' : 'leads'} en {tituloBadge}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No se encontraron registros para <strong>{datos.etiquetaEjecutivo}</strong> en{' '}
                <strong>{datos.etiquetaPais}</strong> dentro del rango{' '}
                <strong>{datos.etiquetaRango}</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const r = getRangoDefaultLeads();
                onChangeFiltro({
                  pais: 'TODOS',
                  asesor: 'TODOS',
                  fechaInicio: r.inicio,
                  fechaFin: r.fin,
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restablecer filtros de {tituloBadge}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tarjeta Principal: Citas/Leads del Período + 4 Cuadros fuera del Semáforo */}
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

              {/* Los 4 cuadros fuera del semáforo */}
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

              {/* Barra Apilada compacta + Llamadas detectadas en el período */}
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
              paisFiltro={datos.filtro.pais}
              asesorFiltro={
                datos.filtro.asesor !== 'TODOS' ? datos.filtro.asesor : undefined
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
  const mesActual = useMemo(() => getMesActualInfo(), []);
  const mesAnterior = useMemo(() => getMesAnteriorInfo(), []);

  // Por defecto: Escenario A = Mes Anterior (Pasado), Escenario B = Mes Actual al día (Presente)
  const [filtroA, setFiltroA] = useState<FiltroEscenario>(() => {
    const ant = getRangoMesAnterior();
    return {
      pais: 'TODOS',
      asesor: 'TODOS',
      fechaInicio: ant.inicio,
      fechaFin: ant.fin,
    };
  });

  const [filtroB, setFiltroB] = useState<FiltroEscenario>(() => {
    const act = getRangoDefaultLeads();
    return {
      pais: 'TODOS',
      asesor: 'TODOS',
      fechaInicio: act.inicio,
      fechaFin: act.fin,
    };
  });

  const [modoGrafica, setModoGrafica] = useState<'porcentaje' | 'cantidad'>(
    'porcentaje'
  );
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);

  const datosA = useMemo(
    () => calcularDatosEscenario(filtroA, crucesTodos, llamadas, catalogo, parametros),
    [filtroA, crucesTodos, llamadas, catalogo, parametros]
  );

  const datosB = useMemo(
    () => calcularDatosEscenario(filtroB, crucesTodos, llamadas, catalogo, parametros),
    [filtroB, crucesTodos, llamadas, catalogo, parametros]
  );

  const listaEjecutivosGlobal = useMemo(
    () => obtenerEjecutivosPorPais(catalogo, crucesTodos, 'TODOS'),
    [catalogo, crucesTodos]
  );

  // Presets de Comparación Rápida
  const aplicarPreset = (
    preset:
      | 'pasado_presente'
      | 'mismo_ejecutivo_periodos'
      | 'ejecutivo_vs_ejecutivo'
      | 'paises_sv_gt'
      | '7d_vs_mes'
  ) => {
    const rAnt = getRangoMesAnterior();
    const rAct = getRangoDefaultLeads();
    const r7d = getRangoUltimosNDias(7);

    if (preset === 'pasado_presente') {
      setFiltroA({
        pais: 'TODOS',
        asesor: 'TODOS',
        fechaInicio: rAnt.inicio,
        fechaFin: rAnt.fin,
      });
      setFiltroB({
        pais: 'TODOS',
        asesor: 'TODOS',
        fechaInicio: rAct.inicio,
        fechaFin: rAct.fin,
      });
      return;
    }

    if (preset === 'mismo_ejecutivo_periodos') {
      const ejec =
        filtroB.asesor !== 'TODOS'
          ? filtroB.asesor
          : filtroA.asesor !== 'TODOS'
          ? filtroA.asesor
          : listaEjecutivosGlobal[0] || 'TODOS';
      setFiltroA({
        pais: 'TODOS',
        asesor: ejec,
        fechaInicio: rAnt.inicio,
        fechaFin: rAnt.fin,
      });
      setFiltroB({
        pais: 'TODOS',
        asesor: ejec,
        fechaInicio: rAct.inicio,
        fechaFin: rAct.fin,
      });
      return;
    }

    if (preset === 'ejecutivo_vs_ejecutivo') {
      const ini = filtroB.fechaInicio || rAct.inicio;
      const fin = filtroB.fechaFin || rAct.fin;
      const e1 =
        filtroA.asesor !== 'TODOS'
          ? filtroA.asesor
          : listaEjecutivosGlobal[0] || 'TODOS';
      const e2 =
        filtroB.asesor !== 'TODOS' && filtroB.asesor !== e1
          ? filtroB.asesor
          : listaEjecutivosGlobal.find((e) => e !== e1) || e1;
      setFiltroA({
        pais: 'TODOS',
        asesor: e1,
        fechaInicio: ini,
        fechaFin: fin,
      });
      setFiltroB({
        pais: 'TODOS',
        asesor: e2,
        fechaInicio: ini,
        fechaFin: fin,
      });
      return;
    }

    if (preset === 'paises_sv_gt') {
      const ini = filtroB.fechaInicio || rAct.inicio;
      const fin = filtroB.fechaFin || rAct.fin;
      setFiltroA({
        pais: 'SV',
        asesor: 'TODOS',
        fechaInicio: ini,
        fechaFin: fin,
      });
      setFiltroB({
        pais: 'GT',
        asesor: 'TODOS',
        fechaInicio: ini,
        fechaFin: fin,
      });
      return;
    }

    if (preset === '7d_vs_mes') {
      setFiltroA({
        pais: filtroA.pais,
        asesor: filtroA.asesor,
        fechaInicio: r7d.inicio,
        fechaFin: r7d.fin,
      });
      setFiltroB({
        pais: filtroB.pais,
        asesor: filtroB.asesor,
        fechaInicio: rAct.inicio,
        fechaFin: rAct.fin,
      });
    }
  };

  const intercambiarEscenarios = () => {
    setFiltroA(filtroB);
    setFiltroB(filtroA);
  };

  // Métricas comparativas B vs A (deltas)
  const deltas = useMemo(() => {
    const items = [
      {
        label: '% A Tiempo (Semáforo)',
        valA: datosA.pctVerdeSemaforo,
        valB: datosB.pctVerdeSemaforo,
        suffix: '%',
        deltaSuffix: ' pts',
        mayorEsMejor: true,
      },
      {
        label: esCalificado ? 'Total Citas' : 'Total Leads',
        valA: datosA.conteos.total,
        valB: datosB.conteos.total,
        suffix: '',
        deltaSuffix: '',
        mayorEsMejor: null as boolean | null,
      },
      {
        label: 'A Tiempo (Verde)',
        valA: datosA.conteos.verde,
        valB: datosB.conteos.verde,
        suffix: '',
        deltaSuffix: '',
        mayorEsMejor: true,
      },
      {
        label: 'Tarde Leve (Amarillo)',
        valA: datosA.conteos.amarillo,
        valB: datosB.conteos.amarillo,
        suffix: '',
        deltaSuffix: '',
        mayorEsMejor: false,
      },
      {
        label: 'Tarde Grave (Rojo)',
        valA: datosA.conteos.rojo,
        valB: datosB.conteos.rojo,
        suffix: '',
        deltaSuffix: '',
        mayorEsMejor: false,
      },
      {
        label: 'No Llamó',
        valA: datosA.conteos.noLlamo,
        valB: datosB.conteos.noLlamo,
        suffix: '',
        deltaSuffix: '',
        mayorEsMejor: false,
      },
    ];
    return items.map((it) => {
      const diff = Number((it.valB - it.valA).toFixed(1));
      const mejora =
        it.mayorEsMejor === null || diff === 0
          ? null
          : it.mayorEsMejor
          ? diff > 0
          : diff < 0;
      return { ...it, diff, mejora };
    });
  }, [datosA, datosB, esCalificado]);

  // Datos para gráfica de barras agrupadas (A vs B)
  const datosGraficaBarras = useMemo(() => {
    const pctOver = (val: number, total: number) =>
      total > 0 ? Math.round((val / total) * 100) : 0;

    return [
      {
        label: 'A Tiempo',
        sub: 'Verde',
        aPct: datosA.pctVerdeSemaforo,
        bPct: datosB.pctVerdeSemaforo,
        aCant: datosA.conteos.verde,
        bCant: datosB.conteos.verde,
      },
      {
        label: 'Tarde Leve',
        sub: 'Amarillo',
        aPct: datosA.pctAmarilloSemaforo,
        bPct: datosB.pctAmarilloSemaforo,
        aCant: datosA.conteos.amarillo,
        bCant: datosB.conteos.amarillo,
      },
      {
        label: 'Tarde Grave',
        sub: 'Rojo',
        aPct: datosA.pctRojoSemaforo,
        bPct: datosB.pctRojoSemaforo,
        aCant: datosA.conteos.rojo,
        bCant: datosB.conteos.rojo,
      },
      {
        label: 'No Llamó',
        sub: 'Sin gestión',
        aPct: pctOver(datosA.conteos.noLlamo, datosA.conteos.total),
        bPct: pctOver(datosB.conteos.noLlamo, datosB.conteos.total),
        aCant: datosA.conteos.noLlamo,
        bCant: datosB.conteos.noLlamo,
      },
      {
        label: 'Otro Día',
        sub: 'Reprogramada',
        aPct: pctOver(datosA.conteos.otroDia, datosA.conteos.total),
        bPct: pctOver(datosB.conteos.otroDia, datosB.conteos.total),
        aCant: datosA.conteos.otroDia,
        bCant: datosB.conteos.otroDia,
      },
    ];
  }, [datosA, datosB]);

  const maxValorGrafica = useMemo(() => {
    if (modoGrafica === 'porcentaje') return 100;
    const maxVal = Math.max(
      1,
      ...datosGraficaBarras.flatMap((d) => [d.aCant, d.bCant])
    );
    return Math.ceil(maxVal * 1.15);
  }, [datosGraficaBarras, modoGrafica]);

  // Construcción de libro Excel / PDF comparativo
  const construirLibroComparacion = (): ExcelSheetConfig<any>[] => {
    const modoLabel = formatearAlcanceLeads(!esCalificado, 'TODOS');
    const filasResumen = [
      {
        metrica: 'País Seleccionado',
        escenarioA: datosA.etiquetaPais,
        escenarioB: datosB.etiquetaPais,
        diferencia: datosA.etiquetaPais === datosB.etiquetaPais ? 'Mismo país' : `${datosA.filtro.pais} vs ${datosB.filtro.pais}`,
      },
      {
        metrica: 'Ejecutivo',
        escenarioA: datosA.etiquetaEjecutivo,
        escenarioB: datosB.etiquetaEjecutivo,
        diferencia: datosA.etiquetaEjecutivo === datosB.etiquetaEjecutivo ? 'Mismo ejecutivo' : 'Comparativa ejecutivos',
      },
      {
        metrica: 'Rango de Fechas',
        escenarioA: datosA.etiquetaRango,
        escenarioB: datosB.etiquetaRango,
        diferencia: datosA.etiquetaRango === datosB.etiquetaRango ? 'Mismo período' : 'Períodos distintos',
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
      {
        metrica: 'Llamadas Período (Total)',
        escenarioA: datosA.llamadasPeriodo.length,
        escenarioB: datosB.llamadasPeriodo.length,
        diferencia: datosB.llamadasPeriodo.length - datosA.llamadasPeriodo.length,
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
        subtitle: `Escenario A (${datosA.etiquetaEjecutivo} · ${datosA.etiquetaRango}) vs Escenario B (${datosB.etiquetaEjecutivo} · ${datosB.etiquetaRango})`,
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

  const segmentosA = [
    { key: 'verde', count: datosA.conteos.verde, color: 'bg-emerald-500', label: 'A Tiempo' },
    { key: 'amarillo', count: datosA.conteos.amarillo, color: 'bg-amber-400', label: 'Tarde Leve' },
    { key: 'rojo', count: datosA.conteos.rojo, color: 'bg-rose-500', label: 'Tarde Grave' },
    { key: 'adelantada', count: datosA.conteos.adelantada, color: 'bg-sky-500', label: 'Adelantada' },
    { key: 'otroDia', count: datosA.conteos.otroDia, color: 'bg-indigo-500', label: 'Otro Día' },
    { key: 'noLlamo', count: datosA.conteos.noLlamo, color: 'bg-purple-500', label: 'No Llamó' },
    { key: 'pendiente', count: datosA.conteos.pendiente, color: 'bg-slate-400 dark:bg-slate-600', label: 'Pendiente' },
  ];

  const segmentosB = [
    { key: 'verde', count: datosB.conteos.verde, color: 'bg-emerald-500', label: 'A Tiempo' },
    { key: 'amarillo', count: datosB.conteos.amarillo, color: 'bg-amber-400', label: 'Tarde Leve' },
    { key: 'rojo', count: datosB.conteos.rojo, color: 'bg-rose-500', label: 'Tarde Grave' },
    { key: 'adelantada', count: datosB.conteos.adelantada, color: 'bg-sky-500', label: 'Adelantada' },
    { key: 'otroDia', count: datosB.conteos.otroDia, color: 'bg-indigo-500', label: 'Otro Día' },
    { key: 'noLlamo', count: datosB.conteos.noLlamo, color: 'bg-purple-500', label: 'No Llamó' },
    { key: 'pendiente', count: datosB.conteos.pendiente, color: 'bg-slate-400 dark:bg-slate-600', label: 'Pendiente' },
  ];

  return (
    <div className="space-y-6 tabular-nums">
      {/* Encabezado Superior de Comparación + Presets Rápidos */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${
                  esCalificado
                    ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-500/40'
                    : 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/80 dark:text-cyan-300 dark:border-cyan-500/40'
                }`}
              >
                {esCalificado ? 'Leads Calificados (Citas)' : 'Leads No Calificados (Directos)'}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                Herramientas · Comparación Dual
              </span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Comparación de Desempeño · Escenario A vs Escenario B
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Pantalla dividida para contrastar en paralelo el mismo ejecutivo en fechas distintas, dos ejecutivos o el equipo completo (pasado vs presente).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={intercambiarEscenarios}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
              title="Intercambiar los filtros y datos entre Escenario A y Escenario B"
            >
              <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-500" />
              <span>Intercambiar A ⇄ B</span>
            </button>

            <button
              type="button"
              onClick={handleExportarExcel}
              disabled={exportandoExcel}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{exportandoExcel ? 'Generando...' : 'Descargar Excel'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportarPdf}
              disabled={exportandoPdf}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>{exportandoPdf ? 'Generando...' : 'Descargar PDF'}</span>
            </button>
          </div>
        </div>

        {/* Presets de Escenario en 1 clic */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
            Modos rápidos:
          </span>
          <button
            type="button"
            onClick={() => aplicarPreset('pasado_presente')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <Calendar className="h-3.5 w-3.5 text-indigo-500" />
            <span>
              Pasado ({mesAnterior.nombreMes}) vs Presente ({mesActual.nombreMes})
            </span>
          </button>

          <button
            type="button"
            onClick={() => aplicarPreset('mismo_ejecutivo_periodos')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <User className="h-3.5 w-3.5 text-cyan-500" />
            <span>Mismo Ejecutivo · Mes Ant. vs Actual</span>
          </button>

          <button
            type="button"
            onClick={() => aplicarPreset('ejecutivo_vs_ejecutivo')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <Users className="h-3.5 w-3.5 text-emerald-500" />
            <span>Ejecutivo vs Ejecutivo (Mismo Período)</span>
          </button>

          <button
            type="button"
            onClick={() => aplicarPreset('7d_vs_mes')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <PhoneCall className="h-3.5 w-3.5 text-amber-500" />
            <span>Últimos 7 días vs Mes Actual</span>
          </button>

          <button
            type="button"
            onClick={() => aplicarPreset('paises_sv_gt')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <span>🇸🇻 SV vs 🇬🇹 GT (Mismo Período)</span>
          </button>
        </div>
      </div>

      {/* Banda Resumen Cara a Cara + Gráficas Comparativas */}
      <div className="space-y-5">
        {/* Tarjetas Delta B vs A */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {deltas.map((d) => {
            const signo = d.diff > 0 ? '+' : '';
            const colorDelta =
              d.mejora === null
                ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                : d.mejora
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300';

            return (
              <div
                key={d.label}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex flex-col justify-between gap-2"
              >
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                  {d.label}
                </span>

                <div className="flex items-baseline justify-between gap-2 font-mono">
                  <div>
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 block">
                      A
                    </span>
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {d.valA}
                      {d.suffix}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">vs</span>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">
                      B
                    </span>
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {d.valB}
                      {d.suffix}
                    </span>
                  </div>
                </div>

                <div
                  className={`flex items-center justify-between px-2 py-1 rounded-lg text-[11px] font-mono font-bold ${colorDelta}`}
                >
                  <span>Dif. B vs A</span>
                  <span className="inline-flex items-center gap-1">
                    {d.diff > 0 && <TrendingUp className="h-3 w-3" />}
                    {d.diff < 0 && <TrendingDown className="h-3 w-3" />}
                    {signo}
                    {d.diff}
                    {d.deltaSuffix}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Gráficas Comparativas Organizadas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Gráfica 1: Barras Agrupadas SVG (Escenario A vs Escenario B) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Comparativa Visual por Categoría (A vs B)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Contraste directo de resultados entre ambos escenarios
                </p>
              </div>
              <div className="flex items-center bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setModoGrafica('porcentaje')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                    modoGrafica === 'porcentaje'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  % Proporción
                </button>
                <button
                  type="button"
                  onClick={() => setModoGrafica('cantidad')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                    modoGrafica === 'cantidad'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  # Cantidad
                </button>
              </div>
            </div>

            {/* Leyenda */}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-indigo-500 inline-block" />
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Escenario A: {datosA.etiquetaEjecutivo} ({datosA.etiquetaRango})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-emerald-500 inline-block" />
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Escenario B: {datosB.etiquetaEjecutivo} ({datosB.etiquetaRango})
                </span>
              </div>
            </div>

            {/* SVG Grouped Bar Chart */}
            <div className="w-full overflow-x-auto">
              <svg
                viewBox="0 0 600 220"
                className="w-full h-52 min-w-[440px]"
                role="img"
                aria-label="Gráfica comparativa entre Escenario A y Escenario B"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
                  const y = 175 - frac * 145;
                  const valLabel = Math.round(maxValorGrafica * frac);
                  return (
                    <g key={idx}>
                      <line
                        x1="40"
                        y1={y}
                        x2="585"
                        y2={y}
                        stroke="currentColor"
                        className="text-slate-200 dark:text-slate-800"
                        strokeDasharray={frac === 0 ? undefined : '3 3'}
                        strokeWidth="1"
                      />
                      <text
                        x="34"
                        y={y + 4}
                        textAnchor="end"
                        className="fill-slate-400 text-[10px] font-mono"
                      >
                        {valLabel}
                        {modoGrafica === 'porcentaje' ? '%' : ''}
                      </text>
                    </g>
                  );
                })}

                {datosGraficaBarras.map((g, idx) => {
                  const xGrupo = 58 + idx * 106;
                  const valA = modoGrafica === 'porcentaje' ? g.aPct : g.aCant;
                  const valB = modoGrafica === 'porcentaje' ? g.bPct : g.bCant;
                  const hA = Math.max(2, (valA / maxValorGrafica) * 145);
                  const hB = Math.max(2, (valB / maxValorGrafica) * 145);

                  return (
                    <g key={g.label}>
                      {/* Barra A (Indigo) */}
                      <rect
                        x={xGrupo}
                        y={175 - hA}
                        width="32"
                        height={hA}
                        rx="4"
                        className="fill-indigo-500"
                      >
                        <title>{`Escenario A · ${g.label}: ${g.aCant} (${g.aPct}%)`}</title>
                      </rect>
                      <text
                        x={xGrupo + 16}
                        y={170 - hA}
                        textAnchor="middle"
                        className="fill-indigo-600 dark:fill-indigo-300 text-[10px] font-bold font-mono"
                      >
                        {valA}
                        {modoGrafica === 'porcentaje' ? '%' : ''}
                      </text>

                      {/* Barra B (Emerald) */}
                      <rect
                        x={xGrupo + 38}
                        y={175 - hB}
                        width="32"
                        height={hB}
                        rx="4"
                        className="fill-emerald-500"
                      >
                        <title>{`Escenario B · ${g.label}: ${g.bCant} (${g.bPct}%)`}</title>
                      </rect>
                      <text
                        x={xGrupo + 54}
                        y={170 - hB}
                        textAnchor="middle"
                        className="fill-emerald-600 dark:fill-emerald-300 text-[10px] font-bold font-mono"
                      >
                        {valB}
                        {modoGrafica === 'porcentaje' ? '%' : ''}
                      </text>

                      {/* Etiqueta Eje X */}
                      <text
                        x={xGrupo + 35}
                        y="194"
                        textAnchor="middle"
                        className="fill-slate-700 dark:fill-slate-200 text-[11px] font-bold"
                      >
                        {g.label}
                      </text>
                      <text
                        x={xGrupo + 35}
                        y="208"
                        textAnchor="middle"
                        className="fill-slate-400 text-[9px]"
                      >
                        {g.sub}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Gráfica 2: Distribución Proporcional Apilada + Canales + Desfase */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Composición 100% del Embudo · A vs B
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Proporción exacta sobre los registros totales de cada lado
              </p>
            </div>

            <div className="space-y-4">
              {/* Barra Escenario A */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-indigo-700 dark:text-indigo-300">
                    Escenario A · {datosA.etiquetaEjecutivo}
                  </span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    {datosA.conteos.total} registros · {datosA.pctVerdeSemaforo}% Verde
                  </span>
                </div>
                <div className="h-5 w-full rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex">
                  {segmentosA.map((s) => {
                    if (s.count === 0) return null;
                    const w = (s.count / Math.max(1, datosA.conteos.total)) * 100;
                    return (
                      <div
                        key={s.key}
                        style={{ width: `${w}%` }}
                        className={`${s.color} h-full`}
                        title={`A · ${s.label}: ${s.count} (${Math.round(w)}%)`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Barra Escenario B */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">
                    Escenario B · {datosB.etiquetaEjecutivo}
                  </span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    {datosB.conteos.total} registros · {datosB.pctVerdeSemaforo}% Verde
                  </span>
                </div>
                <div className="h-5 w-full rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex">
                  {segmentosB.map((s) => {
                    if (s.count === 0) return null;
                    const w = (s.count / Math.max(1, datosB.conteos.total)) * 100;
                    return (
                      <div
                        key={s.key}
                        style={{ width: `${w}%` }}
                        className={`${s.color} h-full`}
                        title={`B · ${s.label}: ${s.count} (${Math.round(w)}%)`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Leyenda común */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" /> A Tiempo
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-amber-400" /> Tarde Leve
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-rose-500" /> Tarde Grave
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-sky-500" /> Adelantada
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-indigo-500" /> Otro Día
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-purple-500" /> No Llamó
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-slate-400 dark:bg-slate-600" /> Pendiente
                </span>
              </div>
            </div>

            {/* Desfase Medio & Llamadas Multicanal A vs B */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-center font-mono">
              <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-2">
                <span className="block text-[10px] font-sans font-bold uppercase text-slate-400">
                  Desfase Medio
                </span>
                <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                  {datosA.desfasePromedioMin}m
                </span>
                <span className="text-[10px] text-slate-400 mx-1">/</span>
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                  {datosB.desfasePromedioMin}m
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-2">
                <span className="block text-[10px] font-sans font-bold uppercase text-slate-400">
                  PBX (A / B)
                </span>
                <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                  {datosA.canales.PBX}
                </span>
                <span className="text-[10px] text-slate-400 mx-1">/</span>
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                  {datosB.canales.PBX}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-2">
                <span className="block text-[10px] font-sans font-bold uppercase text-slate-400">
                  Celular (A / B)
                </span>
                <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                  {datosA.canales.Celular}
                </span>
                <span className="text-[10px] text-slate-400 mx-1">/</span>
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                  {datosB.canales.Celular}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-2">
                <span className="block text-[10px] font-sans font-bold uppercase text-slate-400">
                  WhatsApp (A / B)
                </span>
                <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                  {datosA.canales.WhatsApp}
                </span>
                <span className="text-[10px] text-slate-400 mx-1">/</span>
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                  {datosB.canales.WhatsApp}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-2 col-span-2 sm:col-span-1">
                <span className="block text-[10px] font-sans font-bold uppercase text-slate-400">
                  Teams (A / B)
                </span>
                <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                  {datosA.canales.Teams}
                </span>
                <span className="text-[10px] text-slate-400 mx-1">/</span>
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                  {datosB.canales.Teams}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PANTALLA DIVIDIDA EN 2 (ESCENARIO A | DIVISOR VS | ESCENARIO B) */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4 items-stretch">
        {/* MITAD IZQUIERDA: ESCENARIO A */}
        <PanelEscenario
          lado="A"
          tituloBadge="Escenario A"
          subtituloRol="Base / Pasado"
          esCalificado={esCalificado}
          datos={datosA}
          onChangeFiltro={setFiltroA}
          parametros={parametros}
          onVerTranscripcion={onVerTranscripcion}
        />

        {/* DIVISOR CENTRAL MUY NOTORIO EN PANTALLA */}
        <div className="flex xl:flex-col items-center justify-center gap-2 py-2 xl:py-6 px-1 select-none">
          <div className="flex-1 h-0.5 xl:h-auto xl:w-0.5 bg-gradient-to-r xl:bg-gradient-to-b from-transparent via-slate-300 dark:via-slate-700 to-slate-300 dark:to-slate-700" />
          <div className="px-2.5 py-1.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black tracking-widest shadow-md border-2 border-slate-200 dark:border-slate-700">
            VS
          </div>
          <div className="flex-1 h-0.5 xl:h-auto xl:w-0.5 bg-gradient-to-r xl:bg-gradient-to-b from-slate-300 dark:from-slate-700 via-slate-300 dark:via-slate-700 to-transparent" />
        </div>

        {/* MITAD DERECHA: ESCENARIO B */}
        <PanelEscenario
          lado="B"
          tituloBadge="Escenario B"
          subtituloRol="Comparado / Presente"
          esCalificado={esCalificado}
          datos={datosB}
          onChangeFiltro={setFiltroB}
          parametros={parametros}
          onVerTranscripcion={onVerTranscripcion}
        />
      </div>
    </div>
  );
};
