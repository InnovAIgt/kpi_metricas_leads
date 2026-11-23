import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Filter,
  Users,
  ChevronRight,
  Clock,
  Phone,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  ExternalLink,
  ChevronDown,
  Info,
  AlertCircle,
  Sparkles,
  Volume2,
  Headphones,
  Download,
  FileText,
} from 'lucide-react';
import { CruceAuditoria, ModoLeads, ParametrosAuditoria } from '../types';
import { PARAMETROS_DEFAULT } from '../data/mockData';
import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import { DateRangeFilter } from './DateRangeFilter';
import {
  getRangoDefaultLeads,
  getMesActualInfo,
  getMesAnteriorInfo,
  formatLocalDate,
} from '../utils/dateHelpers';
import { exportarLibroExcel } from '../utils/excelExport';
import { exportarLibroPdf } from '../utils/pdfExport';
import { construirHojasKpiExcel } from '../utils/kpiExcelBuilder';
import { SemaforoCumplimiento, claseBadgeHorarioIngreso } from './SemaforoCumplimiento';
import { obtenerEjecutivosPorPais, coincideAsesorFiltro } from '../utils/paisHelpers';
import { clasificarHorarioIngreso, obtenerTimestampCreacionLead } from '../utils/matchingEngine';

interface VistaKpiCumplimientoProps {
  cruces: CruceAuditoria[];
  tipoLeadActual?: ModoLeads;
  catalogo?: any[];
  parametros?: ParametrosAuditoria;
  onVerTranscripcion?: (llamada: any) => void;
  onEscucharAudio?: (llamada: any) => void;
}

export const VistaKpiCumplimiento: React.FC<VistaKpiCumplimientoProps> = ({
  cruces,
  tipoLeadActual = 'calificados',
  catalogo = [],
  parametros = PARAMETROS_DEFAULT,
  onVerTranscripcion,
  onEscucharAudio,
}) => {
  const esNoCalificado = tipoLeadActual === 'no_calificados';
  const tolAntes = parametros?.tolerancia_anticipacion_minutos ?? 15;
  const tolDespues = parametros?.tolerancia_retraso_a_tiempo_minutos ?? 20;
  const umbralGrave = parametros?.umbral_retraso_grave_minutos ?? 120;
  const hIni = parametros?.horario_laboral_inicio || '08:00';
  const hFin = parametros?.horario_laboral_fin || '18:00';
  const etiquetaTol = esNoCalificado
    ? `≤${tolDespues} min`
    : tolAntes === tolDespues
    ? `±${tolDespues} min`
    : `-${tolAntes}/+${tolDespues} min`;
  const etiquetaTolCorta = esNoCalificado
    ? `≤${tolDespues}m`
    : tolAntes === tolDespues
    ? `±${tolDespues}m`
    : `-${tolAntes}/+${tolDespues}m`;
  const etiquetaATiempoEstado = `A Tiempo (${etiquetaTol})`;
  const etiquetaAdelantadaEstado = `Adelantada (>${tolAntes}m)`;

  // Filtros globales y de fecha (Por defecto: Del 1 del mes actual hasta Hoy)
  const [busqueda, setBusqueda] = useState('');
  const [exportando, setExportando] = useState(false);
  const [fechaInicio, setFechaInicio] = useState(() => getRangoDefaultLeads().inicio);
  const [fechaFin, setFechaFin] = useState(() => getRangoDefaultLeads().fin);

  // Vendedor/ejecutivo seleccionado para filtrar todo el módulo
  const [vendedorSeleccionado, setVendedorSeleccionado] = useState<string | null>(null);

  // Fila enfocada / resaltada al hacer clic para inspeccionar por qué no cumplió
  const [leadEnfocadoId, setLeadEnfocadoId] = useState<string | null>(null);

  // Filtro superior de País ('TODOS' | 'SV' | 'GT')
  const [paisFiltro, setPaisFiltro] = useState<'TODOS' | 'SV' | 'GT'>('TODOS');

  // Filtros dinámicos por columna (checklist y valores seleccionados)
  const [filtrosColumnas, setFiltrosColumnas] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setFiltrosColumnas({});
    setPaisFiltro('TODOS');
    setVendedorSeleccionado(null);
    setLeadEnfocadoId(null);
  }, [tipoLeadActual]);

  const handleCambiarFiltroColumna = (clave: string, seleccionados: string[]) => {
    setFiltrosColumnas((prev) => ({
      ...prev,
      [clave]: seleccionados,
    }));
  };

  // Solo cruces con citas
  const crucesCitas = useMemo(() => {
    return cruces.filter((c) => !!c.cita);
  }, [cruces]);

  const tieneFiltroFechas = Boolean(fechaInicio || fechaFin);

  // Aplicar rango de fechas y país (antes de filtrar ejecutivo para poblar selector dinámico)
  const crucesSoloFechaPais = useMemo(() => {
    return crucesCitas.filter((c) => {
      if (paisFiltro !== 'TODOS') {
        const paisLead = String(c.pais || c.cita?.pais || 'SV').toUpperCase();
        if (paisLead !== paisFiltro) return false;
      }
      if (!fechaInicio && !fechaFin) return true;
      const f1 = c.fecha_cita ? c.fecha_cita.slice(0, 10) : '';
      const f2 = c.cita?.fecha_agendada || '';
      const f3 = c.cita?.fecha_creado ? c.cita.fecha_creado.slice(0, 10) : '';
      const f4 = c.cita?.created_at ? c.cita.created_at.slice(0, 10) : '';

      const fechas = [f1, f2, f3, f4].filter(Boolean);
      if (fechas.length === 0) return true;

      return fechas.some((f) => {
        if (fechaInicio && f < fechaInicio) return false;
        if (fechaFin && f > fechaFin) return false;
        return true;
      });
    });
  }, [crucesCitas, fechaInicio, fechaFin, paisFiltro]);

  // Ejecutivos disponibles según país seleccionado
  const asesoresDisponibles = useMemo(() => {
    return obtenerEjecutivosPorPais(catalogo, crucesSoloFechaPais, paisFiltro);
  }, [catalogo, crucesSoloFechaPais, paisFiltro]);

  // Si cambia el país y el ejecutivo seleccionado no pertenece al nuevo país, resetear
  useEffect(() => {
    if (
      vendedorSeleccionado &&
      !asesoresDisponibles.some((a) => coincideAsesorFiltro(a, vendedorSeleccionado, catalogo))
    ) {
      setVendedorSeleccionado(null);
    }
  }, [paisFiltro, asesoresDisponibles, vendedorSeleccionado, catalogo]);

  // Cruces finales filtrados por fechas + país + ejecutivo
  const crucesConFecha = useMemo(() => {
    if (!vendedorSeleccionado) return crucesSoloFechaPais;
    return crucesSoloFechaPais.filter((c) =>
      coincideAsesorFiltro(vendedorSeleccionado, c.vendedor_nombre || 'Sin Asignar', catalogo)
    );
  }, [crucesSoloFechaPais, vendedorSeleccionado, catalogo]);

  // Agrupar por vendedor para las tarjetas comparativas (también respetando el filtro de ejecutivo)
  const vendedoresAgrupados = useMemo(() => {
    const mapa = new Map<
      string,
      {
        nombre: string;
        cruces: CruceAuditoria[];
        total: number;
        aTiempo: number;
        tardeLeve: number;
        tardeGrave: number;
        llamoOtroDia: number;
        noLlamo: number;
        pendientes: number;
        adelantada: number;
        pctCumplimiento: number;
      }
    >();

    crucesConFecha.forEach((c) => {
      const vNombre = c.vendedor_nombre || 'Sin Asignar';
      if (!mapa.has(vNombre)) {
        mapa.set(vNombre, {
          nombre: vNombre,
          cruces: [],
          total: 0,
          aTiempo: 0,
          tardeLeve: 0,
          tardeGrave: 0,
          llamoOtroDia: 0,
          noLlamo: 0,
          pendientes: 0,
          adelantada: 0,
          pctCumplimiento: 0,
        });
      }

      const item = mapa.get(vNombre)!;
      item.cruces.push(c);
      item.total++;

      if (c.estado_cumplimiento === 'A_TIEMPO') {
        item.aTiempo++;
      } else if (c.estado_cumplimiento === 'ADELANTADA') {
        item.adelantada++;
      } else if (
        c.estado_cumplimiento === 'TARDE_LEVE' ||
        c.estado_cumplimiento === 'LLAMADA_CORTA'
      ) {
        item.tardeLeve++;
      } else if (c.estado_cumplimiento === 'TARDE_GRAVE') {
        item.tardeGrave++;
      } else if (c.estado_cumplimiento === 'LLAMO_OTRO_DIA') {
        item.llamoOtroDia++;
      } else if (c.estado_cumplimiento === 'NO_LLAMO') {
        item.noLlamo++;
      } else if (c.estado_cumplimiento === 'PENDIENTE') {
        item.pendientes++;
      }
    });

    mapa.forEach((item) => {
      const enSemaforo = item.aTiempo + item.tardeLeve + item.tardeGrave;
      item.pctCumplimiento =
        enSemaforo > 0 ? Math.round((item.aTiempo / enSemaforo) * 100) : item.total > 0 ? 0 : 0;
    });

    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [crucesConFecha]);

  // Leads a mostrar en la tabla de detalle
  const leadsParaDetalle = useMemo(() => {
    let lista = crucesConFecha;

    // Filtro global de búsqueda
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(
        (c) =>
          c.prospecto_nombre.toLowerCase().includes(q) ||
          c.telefono.includes(q) ||
          (c.vendedor_nombre && c.vendedor_nombre.toLowerCase().includes(q)) ||
          (c.canal_utilizado && c.canal_utilizado.toLowerCase().includes(q)) ||
          (c.horario_ingreso_tipo && c.horario_ingreso_tipo.toLowerCase().includes(q)) ||
          c.explicacion.toLowerCase().includes(q)
      );
    }

    // Filtros por columna checklist
    Object.entries(filtrosColumnas).forEach(([clave, seleccionados]) => {
      if (seleccionados.length === 0) return;
      const activos = seleccionados.filter((s) => s !== '__NINGUNO__');
      if (activos.length === 0) {
        lista = [];
        return;
      }

      lista = lista.filter((fila) => {
        let valorFila = '';
        if (clave === 'prospecto') valorFila = String(fila.prospecto_nombre || '').trim();
        else if (clave === 'telefono') valorFila = String(fila.telefono || '').trim();
        else if (clave === 'vendedor') valorFila = String(fila.vendedor_nombre || 'Sin Asignar').trim();
        else if (clave === 'pais') {
          const p = fila.pais || fila.cita?.pais || 'SV';
          valorFila = p === 'GT' ? 'Guatemala (GT)' : 'El Salvador (SV)';
        }
        else if (clave === 'horario_ingreso') {
          valorFila =
            fila.horario_ingreso_tipo ||
            clasificarHorarioIngreso(obtenerTimestampCreacionLead(fila.cita), hIni, hFin);
        }
        else if (clave === 'canal') valorFila = String(fila.canal_utilizado || 'Sin llamada').trim();
        else if (clave === 'estado') {
          if (fila.estado_cumplimiento === 'A_TIEMPO') valorFila = etiquetaATiempoEstado;
          else if (
            fila.estado_cumplimiento === 'TARDE_LEVE' ||
            fila.estado_cumplimiento === 'LLAMADA_CORTA'
          ) {
            valorFila = 'Tarde Leve (Amarillo)';
          } else if (fila.estado_cumplimiento === 'TARDE_GRAVE') {
            valorFila = 'Tarde Grave (Rojo)';
          } else if (fila.estado_cumplimiento === 'LLAMO_OTRO_DIA') valorFila = 'Llamó Otro Día';
          else if (fila.estado_cumplimiento === 'NO_LLAMO') valorFila = 'No Llamó';
          else if (fila.estado_cumplimiento === 'PENDIENTE') valorFila = 'Pendiente (Próxima)';
          else if (fila.estado_cumplimiento === 'ADELANTADA') valorFila = etiquetaAdelantadaEstado;
        }

        return activos.includes(valorFila);
      });
    });

    // Ordenar de forma descendente por fecha y hora para que los leads de hoy y recientes aparezcan de primero
    return [...lista].sort((a, b) => {
      const fA = a.cita?.fecha_agendada || a.fecha_cita || a.cita?.fecha_hora_programada || a.cita?.created_at || '';
      const hA = a.cita?.hora_agendada || '';
      const fB = b.cita?.fecha_agendada || b.fecha_cita || b.cita?.fecha_hora_programada || b.cita?.created_at || '';
      const hB = b.cita?.hora_agendada || '';
      const strA = `${fA}T${hA}`;
      const strB = `${fB}T${hB}`;
      return strB.localeCompare(strA);
    });
  }, [crucesConFecha, busqueda, filtrosColumnas, etiquetaATiempoEstado, etiquetaAdelantadaEstado, hIni, hFin]);

  // Valores únicos para cada filtro checklist
  const valoresUnicosPorColumna = useMemo(() => {
    const orig = crucesConFecha;

    const estados = new Set<string>();
    const canales = new Set<string>();
    const vendedores = new Set<string>();
    const prospectos = new Set<string>();
    const paises = new Set<string>();
    const horarios = new Set<string>();

    orig.forEach((c) => {
      if (c.prospecto_nombre) prospectos.add(String(c.prospecto_nombre).trim());
      vendedores.add(String(c.vendedor_nombre || 'Sin Asignar').trim());
      canales.add(String(c.canal_utilizado || 'Sin llamada').trim());
      const p = c.pais || c.cita?.pais || 'SV';
      paises.add(p === 'GT' ? 'Guatemala (GT)' : 'El Salvador (SV)');
      horarios.add(
        c.horario_ingreso_tipo ||
          clasificarHorarioIngreso(obtenerTimestampCreacionLead(c.cita), hIni, hFin)
      );

      if (c.estado_cumplimiento === 'A_TIEMPO') estados.add(etiquetaATiempoEstado);
      else if (
        c.estado_cumplimiento === 'TARDE_LEVE' ||
        c.estado_cumplimiento === 'LLAMADA_CORTA'
      ) {
        estados.add('Tarde Leve (Amarillo)');
      } else if (c.estado_cumplimiento === 'TARDE_GRAVE') {
        estados.add('Tarde Grave (Rojo)');
      } else if (c.estado_cumplimiento === 'LLAMO_OTRO_DIA') estados.add('Llamó Otro Día');
      else if (c.estado_cumplimiento === 'NO_LLAMO') estados.add('No Llamó');
      else if (c.estado_cumplimiento === 'PENDIENTE') estados.add('Pendiente (Próxima)');
      else if (c.estado_cumplimiento === 'ADELANTADA') estados.add(etiquetaAdelantadaEstado);
    });

    return {
      prospectos: Array.from(prospectos).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
      vendedores: Array.from(vendedores).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
      paises: Array.from(paises).sort(),
      horarios: Array.from(horarios).sort(),
      canales: Array.from(canales).sort(),
      estados: Array.from(estados).sort(),
    };
  }, [crucesConFecha, etiquetaATiempoEstado, etiquetaAdelantadaEstado, hIni, hFin]);

  // KPIs del conjunto actual
  const total = crucesConFecha.length;
  const aTiempo = crucesConFecha.filter((c) => c.estado_cumplimiento === 'A_TIEMPO').length;
  const tardeLeve = crucesConFecha.filter(
    (c) => c.estado_cumplimiento === 'TARDE_LEVE' || c.estado_cumplimiento === 'LLAMADA_CORTA'
  ).length;
  const tardeGrave = crucesConFecha.filter(
    (c) => c.estado_cumplimiento === 'TARDE_GRAVE'
  ).length;
  const adelantada = crucesConFecha.filter((c) => c.estado_cumplimiento === 'ADELANTADA').length;
  const llamoOtroDia = crucesConFecha.filter(
    (c) => c.estado_cumplimiento === 'LLAMO_OTRO_DIA'
  ).length;
  const noLlamo = crucesConFecha.filter((c) => c.estado_cumplimiento === 'NO_LLAMO').length;
  const pendientes = crucesConFecha.filter((c) => c.estado_cumplimiento === 'PENDIENTE').length;
  const totalSemaforo = aTiempo + tardeLeve + tardeGrave;
  const pctCumplimiento =
    totalSemaforo > 0 ? Math.round((aTiempo / totalSemaforo) * 100) : 0;

  const [exportandoPdf, setExportandoPdf] = useState(false);

  const construirHojasKpi = () => {
    return construirHojasKpiExcel({
      cruces: leadsParaDetalle.length > 0 && busqueda.trim() ? leadsParaDetalle : crucesConFecha,
      parametros,
      esNoCalificado,
      fechaInicio,
      fechaFin,
      paisFiltro,
      asesorFiltro: vendedorSeleccionado,
      extraInfo: busqueda.trim() ? `Búsqueda: "${busqueda.trim()}"` : undefined,
    });
  };

  const handleExportarExcel = async () => {
    setExportando(true);
    try {
      await exportarLibroExcel(
        `KPI_Cumplimiento_${esNoCalificado ? 'NoCalificados' : 'Calificados'}_${paisFiltro}_${fechaInicio || 'inicio'}_${fechaFin || formatLocalDate()}`,
        construirHojasKpi()
      );
    } finally {
      setExportando(false);
    }
  };

  const handleExportarPdf = async () => {
    setExportandoPdf(true);
    try {
      await exportarLibroPdf(
        `KPI_Cumplimiento_${esNoCalificado ? 'NoCalificados' : 'Calificados'}_${paisFiltro}_${fechaInicio || 'inicio'}_${fechaFin || formatLocalDate()}`,
        construirHojasKpi()
      );
    } finally {
      setExportandoPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Resumen General */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs dark:shadow-none">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-rose-500 dark:text-rose-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-wide">
                KPI 1: Cumplimiento de Llamadas {esNoCalificado ? '(Leads No Calificados)' : '(Leads Calificados)'}
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
              {esNoCalificado ? (
                <>
                  Validador: <strong>Verde (A Tiempo)</strong> hasta <strong>{tolDespues} min</strong> (minuto {tolDespues} incluido);{' '}
                  <strong>Amarillo (Tarde Leve)</strong> del minuto {tolDespues + 1} al {umbralGrave - 1};{' '}
                  <strong>Rojo (Tarde Grave)</strong> desde <strong>{umbralGrave} min</strong> (2 horas exactas incluidas). Sáb/Dom y viernes ≥16:30 inician conteo lunes {hIni}.
                </>
              ) : (
                <>
                  Auditoría en tiempo real: <strong>Verde</strong> ventana -{tolAntes}/+{tolDespues} min (minuto {tolDespues} incluido);{' '}
                  <strong>Amarillo (Tarde Leve)</strong> {tolDespues + 1}–{umbralGrave - 1} min;{' '}
                  <strong>Rojo (Tarde Grave)</strong> ≥{umbralGrave} min (2h exactas). Sáb/Dom y viernes ≥16:30 inician lunes {hIni}.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
              {(['TODOS', 'SV', 'GT'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPaisFiltro(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    paisFiltro === p
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {p === 'TODOS' ? 'Todos' : p === 'SV' ? '🇸🇻 SV' : '🇬🇹 GT'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleExportarExcel}
              disabled={exportando || crucesConFecha.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Descargar resumen por asesor y detalle filtrado en Excel (.xlsx)"
            >
              <Download className="h-4 w-4" />
              <span>{exportando ? 'Exportando...' : 'Descargar Excel'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportarPdf}
              disabled={exportandoPdf || crucesConFecha.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Descargar resumen por asesor, detalle y criterios en PDF"
            >
              <FileText className="h-4 w-4" />
              <span>{exportandoPdf ? 'PDF...' : 'Descargar PDF'}</span>
            </button>
            <div className="px-4 py-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl text-right tabular-nums">
              <div className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-300">Tasa A Tiempo (Semáforo)</div>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400">{pctCumplimiento}%</div>
            </div>
          </div>
        </div>

        {/* Métricas Resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 pt-4 tabular-nums">
          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800/80">
            <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">Total Período</span>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{total}</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/25 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/40">
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
              A Tiempo (≤{tolDespues}m)
            </span>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{aTiempo}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/25 p-3 rounded-lg border border-amber-200 dark:border-amber-900/40">
            <span className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
              Tarde Leve ({tolDespues + 1}-{umbralGrave - 1}m)
            </span>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">{tardeLeve}</p>
          </div>
          <div className="bg-rose-50 dark:bg-rose-950/25 p-3 rounded-lg border border-rose-200 dark:border-rose-900/40">
            <span className="text-[11px] text-rose-700 dark:text-rose-300 font-medium">
              Tarde Grave (≥{umbralGrave}m)
            </span>
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-0.5">{tardeGrave}</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-950/25 p-3 rounded-lg border border-purple-200 dark:border-purple-900/40">
            <span className="text-[11px] text-purple-700 dark:text-purple-300 font-medium">No Llamó</span>
            <p className="text-lg font-bold text-purple-600 dark:text-purple-400 mt-0.5">{noLlamo}</p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-950/25 p-3 rounded-lg border border-indigo-200 dark:border-indigo-900/40">
            <span className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium">Otro Día</span>
            <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{llamoOtroDia}</p>
          </div>
          <div className="bg-sky-50 dark:bg-sky-950/30 p-3 rounded-lg border border-sky-200 dark:border-sky-800/50">
            <span className="text-[11px] text-sky-700 dark:text-sky-300 font-medium">Adelantadas</span>
            <p className="text-lg font-bold text-sky-600 dark:text-sky-400 mt-0.5">{adelantada}</p>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-300 dark:border-slate-700">
            <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">Pendientes</span>
            <p className="text-lg font-bold text-slate-700 dark:text-slate-200 mt-0.5">{pendientes}</p>
          </div>
        </div>
      </div>

      {/* 2. Filtro de Fechas + Ejecutivo para esta tabla */}
      <DateRangeFilter
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
        onChangeInicio={setFechaInicio}
        onChangeFin={setFechaFin}
        onLimpiar={() => {
          setFechaInicio('');
          setFechaFin('');
          setVendedorSeleccionado(null);
        }}
        label="Filtrar Auditoría por Fechas"
        asesoresDisponibles={asesoresDisponibles}
        asesorSeleccionado={vendedorSeleccionado || 'TODOS'}
        onChangeAsesor={(v) => setVendedorSeleccionado(v === 'TODOS' ? null : v)}
      />

      {/* Semáforo Interactivo Superior */}
      <SemaforoCumplimiento
        cruces={crucesConFecha}
        esNoCalificado={esNoCalificado}
        paisFiltro={paisFiltro}
        asesorFiltro={vendedorSeleccionado || 'TODOS'}
        parametros={parametros}
        onVerTranscripcion={onVerTranscripcion}
        titulo={`Semáforo KPI 1 · ${esNoCalificado ? 'Leads No Calificados' : 'Leads Calificados'}`}
      />

      {/* Indicador de cobertura y estado de filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-lg text-xs shadow-xs tabular-nums">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
          <Calendar className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          <span>
            {tieneFiltroFechas ? (
              <>
                Mostrando <strong className="text-slate-900 dark:text-white">{crucesConFecha.length}</strong> leads entre{' '}
                <span className="font-mono text-amber-700 dark:text-amber-300 font-bold">{fechaInicio || 'Inicio'}</span> y{' '}
                <span className="font-mono text-amber-700 dark:text-amber-300 font-bold">{fechaFin || 'Hoy'}</span> (de {crucesCitas.length} en total)
              </>
            ) : (
              <>
                Mostrando <strong className="text-slate-900 dark:text-white">{crucesConFecha.length}</strong> prospectos del histórico completo ({vendedoresAgrupados.length} asesores activos)
              </>
            )}
          </span>
        </div>
        {tieneFiltroFechas && (
          <button
            type="button"
            onClick={() => {
              setFechaInicio('');
              setFechaFin('');
            }}
            className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 underline font-semibold cursor-pointer"
          >
            Ver todos los {crucesCitas.length} leads
          </button>
        )}
      </div>

      {/* Banner de ayuda cuando el rango actual no tiene leads */}
      {crucesConFecha.length === 0 && (
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-slate-700 dark:text-slate-300 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                No hay citas agendadas en el rango de fechas {fechaInicio && fechaFin ? `(${fechaInicio} al ${fechaFin})` : ''}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Usa los siguientes botones para consultar otros períodos o el histórico completo:
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const ant = getMesAnteriorInfo();
                    setFechaInicio(ant.inicioMes);
                    setFechaFin(ant.finMes);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-sm cursor-pointer transition-all"
                >
                  Ver Mes Anterior ({getMesAnteriorInfo().nombreMes})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const act = getMesActualInfo();
                    setFechaInicio(act.inicioMes);
                    setFechaFin(act.hoy);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm cursor-pointer transition-all"
                >
                  Mes Actual (Al día)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFechaInicio('');
                    setFechaFin('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer transition-all"
                >
                  Ver Todo el Histórico
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. LISTADO DE VENDEDORES (Haz clic para ver el detalle de sus leads) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs dark:shadow-none">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Vendedores / Asesores ({vendedoresAgrupados.length})
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              — Selecciona un vendedor para inspeccionar el detalle de sus leads
            </span>
          </div>
          {vendedorSeleccionado && (
            <button
              onClick={() => setVendedorSeleccionado(null)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 underline font-medium cursor-pointer"
            >
              Ver todos los vendedores
            </button>
          )}
        </div>

        {/* Tarjetas / Fila de Vendedores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {vendedoresAgrupados.map((v) => {
            const esActivo = vendedorSeleccionado === v.nombre;
            return (
              <div
                key={v.nombre}
                onClick={() =>
                  setVendedorSeleccionado(esActivo ? null : v.nombre)
                }
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  esActivo
                    ? 'bg-indigo-50/90 border-indigo-400 ring-2 ring-indigo-400/30 dark:bg-indigo-950/70 dark:border-indigo-500 dark:ring-indigo-500/30'
                    : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-slate-100/60 dark:bg-slate-950/60 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-slate-900 dark:text-white truncate" title={v.nombre}>
                    {v.nombre}
                  </span>
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      v.pctCumplimiento >= 70
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                        : v.pctCumplimiento >= 40
                        ? 'bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                        : 'bg-rose-50 text-rose-700 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                    }`}
                  >
                    {v.pctCumplimiento}% a tiempo
                  </span>
                </div>

                <div className="grid grid-cols-7 gap-1 text-[10px] text-center pt-1 border-t border-slate-200 dark:border-slate-800/60 font-mono">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Total</span>
                    <span className="text-slate-900 dark:text-white font-bold">{v.total}</span>
                  </div>
                  <div>
                    <span className="text-emerald-600 dark:text-emerald-400 block">Ok</span>
                    <span className="text-emerald-700 dark:text-emerald-300 font-bold">{v.aTiempo}</span>
                  </div>
                  <div>
                    <span className="text-amber-600 dark:text-amber-400 block">Leve</span>
                    <span className="text-amber-700 dark:text-amber-300 font-bold">{v.tardeLeve}</span>
                  </div>
                  <div>
                    <span className="text-rose-600 dark:text-rose-400 block">Grave</span>
                    <span className="text-rose-700 dark:text-rose-300 font-bold">{v.tardeGrave}</span>
                  </div>
                  <div>
                    <span className="text-indigo-600 dark:text-indigo-400 block">Otro D</span>
                    <span className="text-indigo-700 dark:text-indigo-300 font-bold">{v.llamoOtroDia}</span>
                  </div>
                  <div>
                    <span className="text-purple-600 dark:text-purple-400 block">No Llamó</span>
                    <span className="text-purple-700 dark:text-purple-300 font-bold">{v.noLlamo}</span>
                  </div>
                  <div>
                    <span className="text-sky-600 dark:text-sky-400 block">Pend</span>
                    <span className="text-sky-700 dark:text-sky-300 font-bold">{v.pendientes}</span>
                  </div>
                </div>

                <div className="mt-2.5 pt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="text-[10px]">
                    {esActivo ? 'Viendo sus leads abajo ↓' : 'Clic para filtrar leads'}
                  </span>
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform ${
                      esActivo ? 'rotate-90 text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. TABLA DETALLADA DE LEADS CON FILTRO POR COLUMNA & INSPECCIÓN */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs dark:shadow-none space-y-3 p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Detalle de Leads e Incumplimientos</span>
              {vendedorSeleccionado && (
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30">
                  Filtrado por: {vendedorSeleccionado}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Haz clic en cualquier fila para desplegar la auditoría exacta del por qué no cumplió (llamó tarde, llamó antes, o no llamó).
            </p>
          </div>

          {/* Buscador global */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar en todos los campos..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-rose-500 shadow-xs"
            />
          </div>
        </div>

        {/* Tabla con Filtros Dinámicos por Columna (Checklist + Buscador) */}
        <div className="overflow-x-auto max-h-[650px] border border-slate-200 dark:border-slate-800/80 rounded-xl">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-bold sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {/* Columna Prospecto con Filtro */}
                <th className="py-3 px-4 whitespace-nowrap">
                  <ColumnFilterDropdown
                    titulo="Prospecto / Código"
                    clave="prospecto"
                    valoresUnicos={valoresUnicosPorColumna.prospectos}
                    seleccionados={filtrosColumnas.prospecto || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                  />
                </th>

                {/* Teléfono */}
                <th className="py-3 px-4 whitespace-nowrap">Teléfono</th>

                {/* País con Filtro */}
                <th className="py-3 px-3 whitespace-nowrap">
                  <ColumnFilterDropdown
                    titulo="País"
                    clave="pais"
                    valoresUnicos={valoresUnicosPorColumna.paises}
                    seleccionados={filtrosColumnas.pais || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                  />
                </th>

                {/* Vendedor Asignado con Filtro */}
                <th className="py-3 px-4 whitespace-nowrap">
                  <ColumnFilterDropdown
                    titulo="Vendedor"
                    clave="vendedor"
                    valoresUnicos={valoresUnicosPorColumna.vendedores}
                    seleccionados={filtrosColumnas.vendedor || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                  />
                </th>

                {/* Fecha / Hora Agendada o Ingreso */}
                <th className="py-3 px-4 whitespace-nowrap">
                  {esNoCalificado ? 'Hora Ingreso (Lead)' : 'Hora Agendada (Lead)'}
                </th>

                {/* Hora Real de Llamada */}
                <th className="py-3 px-4 whitespace-nowrap">Hora Real (Auditoría)</th>

                {/* Desfase */}
                <th className="py-3 px-4 whitespace-nowrap text-center">
                  {esNoCalificado ? 'Tiempo Respuesta' : 'Desfase'}
                </th>

                {/* Horario de Ingreso */}
                <th className="py-3 px-3 whitespace-nowrap">
                  <ColumnFilterDropdown
                    titulo="Horario Ingreso"
                    clave="horario_ingreso"
                    valoresUnicos={valoresUnicosPorColumna.horarios}
                    seleccionados={filtrosColumnas.horario_ingreso || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                  />
                </th>

                {/* Canal */}
                <th className="py-3 px-4 whitespace-nowrap">
                  <ColumnFilterDropdown
                    titulo="Canal"
                    clave="canal"
                    valoresUnicos={valoresUnicosPorColumna.canales}
                    seleccionados={filtrosColumnas.canal || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                  />
                </th>

                {/* Estado con Filtro Checklist */}
                <th className="py-3 px-4 whitespace-nowrap">
                  <ColumnFilterDropdown
                    titulo={`Cumplimiento (${etiquetaTolCorta})`}
                    clave="estado"
                    valoresUnicos={valoresUnicosPorColumna.estados}
                    seleccionados={filtrosColumnas.estado || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                    alineacion="right"
                  />
                </th>

                <th className="py-3 px-4 whitespace-nowrap text-right">Detalle</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {leadsParaDetalle.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-500 dark:text-slate-400 font-medium">
                    No se encontraron registros que coincidan con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                leadsParaDetalle.map((cruce) => {
                  const estaEnfocado = leadEnfocadoId === cruce.id;
                  const fechaProg = cruce.fecha_cita
                    ? new Date(cruce.fecha_cita).toLocaleString('es-SV', {
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'N/D';

                  const fechaReal = cruce.fecha_llamada
                    ? new Date(cruce.fecha_llamada).toLocaleString('es-SV', {
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Sin registro';

                  return (
                    <React.Fragment key={cruce.id}>
                      <tr
                        onClick={() =>
                          setLeadEnfocadoId(estaEnfocado ? null : cruce.id)
                        }
                        className={`cursor-pointer transition-colors ${
                          estaEnfocado
                            ? 'bg-rose-50/70 dark:bg-rose-950/40 text-slate-900 dark:text-white font-medium'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {/* Prospecto */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {cruce.prospecto_nombre}
                          </div>
                          {cruce.cita?.codigo_prospecto && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                              Cod: {cruce.cita.codigo_prospecto}
                            </span>
                          )}
                        </td>

                        {/* Teléfono */}
                        <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                          {cruce.telefono || 'Sin número'}
                        </td>

                        {/* País */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                              (cruce.pais || cruce.cita?.pais) === 'GT'
                                ? 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800/60'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800/60'
                            }`}
                          >
                            {(cruce.pais || cruce.cita?.pais) === 'GT' ? '🇬🇹 GT' : '🇸🇻 SV'}
                          </span>
                        </td>

                        {/* Vendedor */}
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {cruce.vendedor_nombre}
                          </span>
                        </td>

                        {/* Fecha y Hora de Reunión Agendada */}
                        <td className="py-3 px-4">
                          <div className="font-mono text-slate-900 dark:text-white text-xs font-bold flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
                            <span>{cruce.cita?.fecha_agendada || (cruce.fecha_cita ? cruce.fecha_cita.slice(0, 10) : fechaProg)}</span>
                          </div>
                          <div className="font-mono text-amber-700 dark:text-amber-300 text-[11px] flex items-center gap-1.5 mt-0.5">
                            <Clock className="h-3 w-3 text-amber-500 dark:text-amber-400 shrink-0" />
                            <span>{cruce.cita?.hora_agendada ? cruce.cita.hora_agendada.slice(0, 5) : (cruce.fecha_cita ? cruce.fecha_cita.slice(11, 16) : '09:00')}</span>
                            {cruce.cita?.tipo_reunion && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-sans font-medium ml-1">
                                {cruce.cita.tipo_reunion}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Hora Real */}
                        <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                          {fechaReal}
                        </td>

                        {/* Desfase */}
                        <td className="py-3 px-4 text-center font-mono font-bold tabular-nums">
                          {cruce.desfase_minutos !== undefined ? (
                            <span
                              className={`${
                                cruce.desfase_minutos >= -tolAntes && cruce.desfase_minutos <= tolDespues
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : cruce.desfase_minutos > tolDespues
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {cruce.desfase_minutos > 0 ? `+${cruce.desfase_minutos}` : cruce.desfase_minutos} min
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600">—</span>
                          )}
                        </td>

                        {/* Horario Ingreso */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {(() => {
                            const hTipo =
                              cruce.horario_ingreso_tipo ||
                              clasificarHorarioIngreso(
                                obtenerTimestampCreacionLead(cruce.cita),
                                hIni,
                                hFin
                              );
                            return (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${claseBadgeHorarioIngreso(hTipo)}`}
                              >
                                {hTipo}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Canal */}
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                            {cruce.canal_utilizado || 'Sin Canal'}
                          </span>
                        </td>

                        {/* Estado Cumplimiento */}
                        <td className="py-3 px-4">
                          {cruce.estado_cumplimiento === 'A_TIEMPO' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-500/40">
                              <CheckCircle2 className="h-3 w-3" /> A Tiempo
                            </span>
                          )}
                          {cruce.estado_cumplimiento === 'TARDE_LEVE' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-500/40">
                              <AlertTriangle className="h-3 w-3" /> Tarde Leve
                            </span>
                          )}
                          {cruce.estado_cumplimiento === 'TARDE_GRAVE' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-500/40">
                              <AlertTriangle className="h-3 w-3" /> Tarde Grave
                            </span>
                          )}
                          {cruce.estado_cumplimiento === 'LLAMO_OTRO_DIA' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-300 dark:bg-indigo-950/80 dark:text-indigo-300 dark:border-indigo-500/40">
                              <Calendar className="h-3 w-3" /> Llamó Otro Día
                            </span>
                          )}
                          {cruce.estado_cumplimiento === 'NO_LLAMO' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-300 dark:bg-purple-950/90 dark:text-purple-200 dark:border-purple-600/50">
                              <XCircle className="h-3 w-3" /> No Llamó
                            </span>
                          )}
                          {cruce.estado_cumplimiento === 'PENDIENTE' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-300 dark:bg-sky-950/90 dark:text-sky-200 dark:border-sky-500/50">
                              <Clock className="h-3 w-3 text-sky-600 dark:text-sky-400" /> Pendiente (Próxima)
                            </span>
                          )}
                          {cruce.estado_cumplimiento === 'LLAMADA_CORTA' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-500/40">
                              Tarde Leve (Corta)
                            </span>
                          )}
                          {cruce.estado_cumplimiento === 'ADELANTADA' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-300 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-500/40">
                              Adelantada
                            </span>
                          )}
                        </td>

                        {/* Botón Ver */}
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 underline font-semibold cursor-pointer"
                          >
                            {estaEnfocado ? 'Ocultar' : 'Inspeccionar'}
                          </button>
                        </td>
                      </tr>

                      {/* FILA EXPANDIBLE: Auditoría del Incumplimiento o Éxito */}
                      {estaEnfocado && (
                        <tr className="bg-slate-50 dark:bg-slate-950/90 border-b border-rose-200 dark:border-rose-900/40">
                          <td colSpan={11} className="p-4">
                            <div className="bg-white dark:bg-slate-900/90 border border-rose-200 dark:border-rose-500/30 rounded-xl p-4 space-y-3 shadow-xs">
                              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-2">
                                  <Info className="h-4 w-4 text-rose-500 dark:text-rose-400" />
                                  <span className="font-bold text-slate-900 dark:text-white text-xs">
                                    Diagnóstico de Auditoría del Cruce Multicanal
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                  ID Cita: {cruce.cita?.id}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">
                                    Cita Programada
                                  </span>
                                  <p className="text-slate-900 dark:text-white font-medium mt-0.5">
                                    {cruce.fecha_cita ? new Date(cruce.fecha_cita).toLocaleString('es-SV') : 'N/D'}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    Asesor: <strong className="text-slate-800 dark:text-slate-200">{cruce.vendedor_nombre}</strong>
                                  </p>
                                </div>

                                <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">
                                      Llamada / Registro Detectado
                                    </span>
                                    {cruce.fecha_llamada && onVerTranscripcion && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onVerTranscripcion({
                                            uniqueid: cruce.llamada?.id || (cruce.llamada as any)?.uniqueid,
                                            destino: cruce.telefono,
                                            nombre: cruce.vendedor_nombre,
                                            fecha_hora: cruce.fecha_llamada,
                                            duracion_segundos: cruce.duracion_llamada_segundos,
                                            estado: 'CONTESTADA',
                                            ...cruce.llamada,
                                          });
                                        }}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-600/30 cursor-pointer transition-all"
                                        title="Escuchar audio y leer la transcripción en la misma ventana"
                                      >
                                        <Headphones className="h-3 w-3 shrink-0" />
                                        <span>Consultar Llamada</span>
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-slate-900 dark:text-white font-medium mt-0.5">
                                    {cruce.fecha_llamada
                                      ? new Date(cruce.fecha_llamada).toLocaleString('es-SV')
                                      : 'Ninguna llamada encontrada'}
                                  </p>
                                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    <span>
                                      Canal: {cruce.canal_utilizado || 'Ninguno'} • Duración: {cruce.duracion_llamada_segundos || 0}s
                                    </span>
                                    {cruce.llamada && onEscucharAudio && Boolean(cruce.llamada.grabacion_url || cruce.llamada.audio_url || (cruce.llamada as any).uniqueid) && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onEscucharAudio(cruce.llamada);
                                        }}
                                        className="inline-flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                                      >
                                        <Volume2 className="h-3 w-3" />
                                        <span>Escuchar</span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">
                                    Motivo / Explicación del Cruce
                                  </span>
                                  <p className="text-rose-700 dark:text-rose-300 font-medium mt-0.5">
                                    {cruce.explicacion}
                                  </p>
                                  {cruce.fuera_de_horario && (
                                    <p className="text-amber-600 dark:text-amber-400 text-[10px] mt-1 font-medium">
                                      ⚠️ Nota: La cita o llamada fue fuera del horario laboral de 8:00 AM a 6:00 PM.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
