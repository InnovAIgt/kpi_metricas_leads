import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { CruceAuditoria, VendedorMetricas, ModoLeads } from '../types';
import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import { DateRangeFilter } from './DateRangeFilter';
import {
  getRangoSemanaActual,
  getRangoDefaultLeads,
  getMesActualInfo,
  getMesAnteriorInfo,
  esDelMesActual,
} from '../utils/dateHelpers';

interface VistaKpiCumplimientoProps {
  cruces: CruceAuditoria[];
  tipoLeadActual?: ModoLeads;
  catalogo?: any[];
}

export const VistaKpiCumplimiento: React.FC<VistaKpiCumplimientoProps> = ({
  cruces,
  tipoLeadActual = 'calificados',
  catalogo = [],
}) => {
  const esNoCalificado = tipoLeadActual === 'no_calificados';

  // Filtros globales y de fecha (Por defecto: Todo Septiembre 2026 completo)
  const [busqueda, setBusqueda] = useState('');
  const rangoInicial = getRangoDefaultLeads();
  const [fechaInicio, setFechaInicio] = useState(() => {
    const tieneEnMesActual = cruces.some((c) =>
      esDelMesActual(c.cita, ['fecha_agendada', 'fecha_creado', 'created_at', 'fecha_cita'])
    );
    return tieneEnMesActual ? rangoInicial.inicio : '';
  });
  const [fechaFin, setFechaFin] = useState(() => {
    const tieneEnMesActual = cruces.some((c) =>
      esDelMesActual(c.cita, ['fecha_agendada', 'fecha_creado', 'created_at', 'fecha_cita'])
    );
    return tieneEnMesActual ? rangoInicial.fin : '';
  });

  // Vendedor seleccionado para ver sus leads detallados
  const [vendedorSeleccionado, setVendedorSeleccionado] = useState<string | null>(null);

  // Fila enfocada / resaltada al hacer clic para inspeccionar por qué no cumplió
  const [leadEnfocadoId, setLeadEnfocadoId] = useState<string | null>(null);

  // Filtros dinámicos por columna (checklist y valores seleccionados)
  const [filtrosColumnas, setFiltrosColumnas] = useState<Record<string, string[]>>({});

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

  // Aplicar rango de fechas considerando cualquiera de las fechas del lead (agendada o creado)
  const crucesConFecha = useMemo(() => {
    return crucesCitas.filter((c) => {
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
  }, [crucesCitas, fechaInicio, fechaFin]);

  // Agrupar por vendedor para la lista inicial solicitada
  const vendedoresAgrupados = useMemo(() => {
    const mapa = new Map<
      string,
      {
        nombre: string;
        cruces: CruceAuditoria[];
        total: number;
        aTiempo: number;
        conRetraso: number;
        llamoOtroDia: number;
        noLlamo: number;
        pendientes: number;
        corta: number;
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
          conRetraso: 0,
          llamoOtroDia: 0,
          noLlamo: 0,
          pendientes: 0,
          corta: 0,
          adelantada: 0,
          pctCumplimiento: 0,
        });
      }

      const item = mapa.get(vNombre)!;
      item.cruces.push(c);
      item.total++;

      if (c.estado_cumplimiento === 'A_TIEMPO' || c.estado_cumplimiento === 'ADELANTADA') {
        item.aTiempo++;
      } else if (
        c.estado_cumplimiento === 'TARDE_LEVE' ||
        c.estado_cumplimiento === 'TARDE_GRAVE'
      ) {
        item.conRetraso++;
      } else if (c.estado_cumplimiento === 'LLAMO_OTRO_DIA') {
        item.llamoOtroDia++;
      } else if (c.estado_cumplimiento === 'NO_LLAMO') {
        item.noLlamo++;
      } else if (c.estado_cumplimiento === 'PENDIENTE') {
        item.pendientes++;
      }
    });

    mapa.forEach((item) => {
      const auditables = item.total - item.pendientes;
      item.pctCumplimiento = auditables > 0 ? Math.round((item.aTiempo / auditables) * 100) : (item.total > 0 ? 100 : 0);
    });

    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [crucesConFecha]);

  // Leads a mostrar en la tabla de detalle
  const leadsParaDetalle = useMemo(() => {
    let lista = crucesConFecha;
    if (vendedorSeleccionado) {
      lista = lista.filter((c) => (c.vendedor_nombre || 'Sin Asignar') === vendedorSeleccionado);
    }

    // Filtro global de búsqueda
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(
        (c) =>
          c.prospecto_nombre.toLowerCase().includes(q) ||
          c.telefono.includes(q) ||
          (c.vendedor_nombre && c.vendedor_nombre.toLowerCase().includes(q)) ||
          (c.canal_utilizado && c.canal_utilizado.toLowerCase().includes(q)) ||
          c.explicacion.toLowerCase().includes(q)
      );
    }

    // Filtros por columna checklist
    Object.entries(filtrosColumnas).forEach(([clave, seleccionados]) => {
      if (seleccionados.length === 0) return;
      if (seleccionados.includes('__NINGUNO__')) {
        lista = [];
        return;
      }

      lista = lista.filter((fila) => {
        let valorFila = '';
        if (clave === 'prospecto') valorFila = fila.prospecto_nombre;
        else if (clave === 'telefono') valorFila = fila.telefono;
        else if (clave === 'vendedor') valorFila = fila.vendedor_nombre;
        else if (clave === 'pais') {
          const p = fila.pais || fila.cita?.pais || 'SV';
          valorFila = p === 'GT' ? 'Guatemala (GT)' : 'El Salvador (SV)';
        }
        else if (clave === 'canal') valorFila = fila.canal_utilizado || 'Sin llamada';
        else if (clave === 'estado') {
          if (fila.estado_cumplimiento === 'A_TIEMPO') valorFila = 'A Tiempo (±5 min)';
          else if (fila.estado_cumplimiento === 'TARDE_LEVE') valorFila = 'Tarde Leve';
          else if (fila.estado_cumplimiento === 'TARDE_GRAVE') valorFila = 'Tarde Grave';
          else if (fila.estado_cumplimiento === 'LLAMO_OTRO_DIA') valorFila = 'Llamó Otro Día';
          else if (fila.estado_cumplimiento === 'NO_LLAMO') valorFila = 'No Llamó';
          else if (fila.estado_cumplimiento === 'PENDIENTE') valorFila = 'Pendiente (Próxima)';
          else if (fila.estado_cumplimiento === 'ADELANTADA') valorFila = 'Adelantada (>5m)';
        }

        return seleccionados.includes(valorFila);
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
  }, [crucesConFecha, vendedorSeleccionado, busqueda, filtrosColumnas]);

  // Valores únicos para cada filtro checklist
  const valoresUnicosPorColumna = useMemo(() => {
    const orig = vendedorSeleccionado
      ? crucesConFecha.filter((c) => (c.vendedor_nombre || 'Sin Asignar') === vendedorSeleccionado)
      : crucesConFecha;

    const estados = new Set<string>();
    const canales = new Set<string>();
    const vendedores = new Set<string>();
    const prospectos = new Set<string>();
    const paises = new Set<string>();

    orig.forEach((c) => {
      if (c.prospecto_nombre) prospectos.add(c.prospecto_nombre);
      if (c.vendedor_nombre) vendedores.add(c.vendedor_nombre);
      canales.add(c.canal_utilizado || 'Sin llamada');
      const p = c.pais || c.cita?.pais || 'SV';
      paises.add(p === 'GT' ? 'Guatemala (GT)' : 'El Salvador (SV)');

      if (c.estado_cumplimiento === 'A_TIEMPO') estados.add('A Tiempo (±5 min)');
      else if (c.estado_cumplimiento === 'TARDE_LEVE') estados.add('Tarde Leve');
      else if (c.estado_cumplimiento === 'TARDE_GRAVE') estados.add('Tarde Grave');
      else if (c.estado_cumplimiento === 'LLAMO_OTRO_DIA') estados.add('Llamó Otro Día');
      else if (c.estado_cumplimiento === 'NO_LLAMO') estados.add('No Llamó');
      else if (c.estado_cumplimiento === 'PENDIENTE') estados.add('Pendiente (Próxima)');
      else if (c.estado_cumplimiento === 'ADELANTADA') estados.add('Adelantada (>5m)');
    });

    return {
      prospectos: Array.from(prospectos).sort(),
      vendedores: Array.from(vendedores).sort(),
      paises: Array.from(paises).sort(),
      canales: Array.from(canales).sort(),
      estados: Array.from(estados).sort(),
    };
  }, [crucesConFecha, vendedorSeleccionado]);

  // KPIs del conjunto actual
  const total = crucesConFecha.length;
  const aTiempo = crucesConFecha.filter(
    (c) => c.estado_cumplimiento === 'A_TIEMPO' || c.estado_cumplimiento === 'ADELANTADA'
  ).length;
  const tarde = crucesConFecha.filter(
    (c) => c.estado_cumplimiento === 'TARDE_LEVE' || c.estado_cumplimiento === 'TARDE_GRAVE'
  ).length;
  const llamoOtroDia = crucesConFecha.filter(
    (c) => c.estado_cumplimiento === 'LLAMO_OTRO_DIA'
  ).length;
  const noLlamo = crucesConFecha.filter((c) => c.estado_cumplimiento === 'NO_LLAMO').length;
  const pendientes = crucesConFecha.filter((c) => c.estado_cumplimiento === 'PENDIENTE').length;
  const totalAuditables = total - pendientes;
  const pctCumplimiento = totalAuditables > 0 ? Math.round((aTiempo / totalAuditables) * 100) : (total > 0 ? 100 : 0);

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
                  Regla de asignación: Al ingresar un lead, los ejecutivos tienen <strong>1 hora</strong> para llamarle dentro de horario laboral (8:00 AM a 6:00 PM). Si ingresó fuera de horario o en fin de semana, tienen chance de llamarle hasta las <strong>9:00 AM del siguiente día hábil</strong> (lunes si entró en fin de semana).
                </>
              ) : (
                <>
                  Auditoría en tiempo real: Compara la hora agendada en Leads contra los registros de llamadas (PBX, Celular, WhatsApp y Teams) con ventana de <strong>±5 minutos</strong> (5 min antes a 5 min después) dentro del horario laboral de 8:00 AM a 6:00 PM (Lunes a Viernes).
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl text-right">
              <div className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-300">Tasa Global a Tiempo</div>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400">{pctCumplimiento}%</div>
            </div>
          </div>
        </div>

        {/* Métricas Resumen - Las 5 clasificaciones exactas suman el Total Leads Auditados */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4">
          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800/80">
            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Total Leads Auditados</span>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{total}</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/25 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/40">
            <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              {esNoCalificado ? 'A Tiempo (1h / 9am)' : 'A Tiempo (±5 min)'}
            </span>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{aTiempo}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/25 p-3 rounded-lg border border-amber-200 dark:border-amber-900/40">
            <span className="text-xs text-amber-800 dark:text-amber-300 font-medium">Llamó Tarde</span>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">{tarde}</p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-950/25 p-3 rounded-lg border border-indigo-200 dark:border-indigo-900/40">
            <span className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">Llamó Otro Día</span>
            <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{llamoOtroDia}</p>
          </div>
          <div className="bg-rose-50 dark:bg-rose-950/25 p-3 rounded-lg border border-rose-200 dark:border-rose-900/40">
            <span className="text-xs text-rose-700 dark:text-rose-300 font-medium">No Llamó</span>
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-0.5">{noLlamo}</p>
          </div>
          <div className="bg-sky-50 dark:bg-sky-950/30 p-3 rounded-lg border border-sky-200 dark:border-sky-800/50">
            <span className="text-xs text-sky-700 dark:text-sky-300 font-medium" title="Leads con fecha próxima (no hoy o en el pasado)">
              Pendientes
            </span>
            <p className="text-lg font-bold text-sky-600 dark:text-sky-400 mt-0.5">{pendientes}</p>
          </div>
        </div>
      </div>

      {/* 2. Filtro de Fechas para esta tabla */}
      <DateRangeFilter
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
        onChangeInicio={setFechaInicio}
        onChangeFin={setFechaFin}
        onLimpiar={() => {
          setFechaInicio('');
          setFechaFin('');
        }}
        label="Filtrar Auditoría por Fechas"
      />

      {/* Indicador de cobertura y estado de filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-lg text-xs shadow-xs">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
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
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-slate-700 dark:text-slate-300 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                No hay citas agendadas en el rango de fechas {fechaInicio && fechaFin ? `(${fechaInicio} al ${fechaFin})` : ''}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Usa los siguientes botones para ver todos los prospectos calificados con reunión agendada:
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
                    setFechaFin(act.finMes);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm cursor-pointer transition-all"
                >
                  Ver Mes Actual ({getMesActualInfo().nombreMes})
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

                <div className="grid grid-cols-6 gap-1 text-[10px] text-center pt-1 border-t border-slate-200 dark:border-slate-800/60 font-mono">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Total</span>
                    <span className="text-slate-900 dark:text-white font-bold">{v.total}</span>
                  </div>
                  <div>
                    <span className="text-emerald-600 dark:text-emerald-400 block">Ok</span>
                    <span className="text-emerald-700 dark:text-emerald-300 font-bold">{v.aTiempo}</span>
                  </div>
                  <div>
                    <span className="text-amber-600 dark:text-amber-400 block">Tarde</span>
                    <span className="text-amber-700 dark:text-amber-300 font-bold">{v.conRetraso}</span>
                  </div>
                  <div>
                    <span className="text-indigo-600 dark:text-indigo-400 block">Otro D</span>
                    <span className="text-indigo-700 dark:text-indigo-300 font-bold">{v.llamoOtroDia}</span>
                  </div>
                  <div>
                    <span className="text-rose-600 dark:text-rose-400 block">No Llamó</span>
                    <span className="text-rose-700 dark:text-rose-300 font-bold">{v.noLlamo}</span>
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
                    titulo={esNoCalificado ? 'Cumplimiento (1h/9am)' : 'Cumplimiento (±5m)'}
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
                  <td colSpan={10} className="py-10 text-center text-slate-500 dark:text-slate-400 font-medium">
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
                        <td className="py-3 px-4 text-center font-mono font-bold">
                          {cruce.desfase_minutos !== undefined ? (
                            <span
                              className={`${
                                Math.abs(cruce.desfase_minutos) <= 5
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : cruce.desfase_minutos > 5
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
                              <XCircle className="h-3 w-3" /> Retraso Grave
                            </span>
                          )}
                          {cruce.estado_cumplimiento === 'LLAMO_OTRO_DIA' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-300 dark:bg-indigo-950/80 dark:text-indigo-300 dark:border-indigo-500/40">
                              <Calendar className="h-3 w-3" /> Llamó Otro Día
                            </span>
                          )}
                          {cruce.estado_cumplimiento === 'NO_LLAMO' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-300 dark:bg-rose-950/90 dark:text-rose-200 dark:border-rose-600/50">
                              <XCircle className="h-3 w-3" /> No Llamó
                            </span>
                          )}
                          {cruce.estado_cumplimiento === 'PENDIENTE' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-300 dark:bg-sky-950/90 dark:text-sky-200 dark:border-sky-500/50">
                              <Clock className="h-3 w-3 text-sky-600 dark:text-sky-400" /> Pendiente (Próxima)
                            </span>
                          )}
                          {cruce.estado_cumplimiento === 'LLAMADA_CORTA' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                              Llamada Corta
                            </span>
                          )}
                          {cruce.estado_cumplimiento === 'ADELANTADA' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-300 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-500/40">
                              Llamó Antes
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
                          <td colSpan={10} className="p-4">
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
                                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">
                                    Llamada / Registro Detectado
                                  </span>
                                  <p className="text-slate-900 dark:text-white font-medium mt-0.5">
                                    {cruce.fecha_llamada
                                      ? new Date(cruce.fecha_llamada).toLocaleString('es-SV')
                                      : 'Ninguna llamada encontrada'}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    Canal: {cruce.canal_utilizado || 'Ninguno'} • Duración: {cruce.duracion_llamada_segundos || 0}s
                                  </p>
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
