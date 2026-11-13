import React, { useState, useMemo } from 'react';
import { CheckCircle2, Search, Download } from 'lucide-react';
import { Cita, ModoLeads } from '../types';
import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import { DateRangeFilter } from './DateRangeFilter';
import { getRangoDefaultLeads, formatLocalDate } from '../utils/dateHelpers';
import { exportarLibroExcel, formatearSubtituloExportacion } from '../utils/excelExport';

interface VistaKpiRetroalimentacionProps {
  citas: Cita[];
  onActualizarLeadKpi: (leadId: string, cambios: Partial<Cita>) => Promise<boolean>;
  tipoLeadActual?: ModoLeads;
}

export const VistaKpiRetroalimentacion: React.FC<VistaKpiRetroalimentacionProps> = ({
  citas,
  onActualizarLeadKpi,
  tipoLeadActual = 'calificados',
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [exportando, setExportando] = useState(false);
  const rangoInicial = getRangoDefaultLeads();
  const [fechaInicio, setFechaInicio] = useState(rangoInicial.inicio);
  const [fechaFin, setFechaFin] = useState(rangoInicial.fin);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);

  // Filtros dinámicos por columnas
  const [filtrosColumnas, setFiltrosColumnas] = useState<Record<string, string[]>>({});

  const handleCambiarFiltroColumna = (clave: string, seleccionados: string[]) => {
    setFiltrosColumnas((prev) => ({
      ...prev,
      [clave]: seleccionados,
    }));
  };

  // 1. Filtrar por fechas
  const citasConFecha = useMemo(() => {
    if (!fechaInicio && !fechaFin) return citas;
    return citas.filter((c) => {
      const f =
        c.fecha_agendada ||
        c.fecha_creado ||
        (c.fecha_hora_programada ? c.fecha_hora_programada.slice(0, 10) : '') ||
        (c.created_at ? String(c.created_at).slice(0, 10) : '');
      if (!f) return true;
      if (fechaInicio && f < fechaInicio) return false;
      if (fechaFin && f > fechaFin) return false;
      return true;
    });
  }, [citas, fechaInicio, fechaFin]);

  // 2. Extraer valores únicos por columna
  const valoresUnicosPorColumna = useMemo(() => {
    const prospectos = new Set<string>();
    const telefonos = new Set<string>();
    const asesores = new Set<string>();
    const paises = new Set<string>();
    const e1 = new Set<string>(['Sí', 'No']);
    const e2 = new Set<string>(['Sí', 'No']);
    const e3 = new Set<string>(['Sí', 'No']);
    const e4 = new Set<string>(['Sí', 'No']);

    citasConFecha.forEach((c) => {
      if (c.prospecto_nombre) prospectos.add(String(c.prospecto_nombre).trim());
      if (c.prospecto_telefono) telefonos.add(String(c.prospecto_telefono).trim());
      if (c.vendedor_nombre) asesores.add(String(c.vendedor_nombre).trim());
      if (c.pais) paises.add(String(c.pais).trim());
    });

    return {
      prospecto: Array.from(prospectos).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
      telefono: Array.from(telefonos).sort(),
      vendedor: Array.from(asesores).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
      pais: Array.from(paises).sort(),
      kpi_retroalimentacion_etapa_1: Array.from(e1),
      kpi_retroalimentacion_etapa_2: Array.from(e2),
      kpi_retroalimentacion_etapa_3: Array.from(e3),
      kpi_retroalimentacion_etapa_4: Array.from(e4),
    };
  }, [citasConFecha]);

  // 3. Filtrar completo
  const filtrados = useMemo(() => {
    let res = citasConFecha;

    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      res = res.filter(
        (c) =>
          c.prospecto_nombre.toLowerCase().includes(q) ||
          c.prospecto_telefono.includes(q) ||
          c.vendedor_nombre.toLowerCase().includes(q) ||
          (c.codigo_prospecto && c.codigo_prospecto.toLowerCase().includes(q))
      );
    }

    Object.entries(filtrosColumnas).forEach(([clave, seleccionados]) => {
      if (seleccionados.length === 0) return;
      const activos = seleccionados.filter((s) => s !== '__NINGUNO__');
      if (activos.length === 0) {
        res = [];
        return;
      }

      res = res.filter((c) => {
        let valFila = '';
        if (clave === 'prospecto') valFila = String(c.prospecto_nombre || '').trim();
        else if (clave === 'telefono') valFila = String(c.prospecto_telefono || '').trim();
        else if (clave === 'vendedor') valFila = String(c.vendedor_nombre || '').trim();
        else if (clave === 'pais') valFila = String(c.pais || '').trim();
        else if (clave === 'kpi_retroalimentacion_etapa_1')
          valFila = c.kpi_retroalimentacion_etapa_1 ? 'Sí' : 'No';
        else if (clave === 'kpi_retroalimentacion_etapa_2')
          valFila = c.kpi_retroalimentacion_etapa_2 ? 'Sí' : 'No';
        else if (clave === 'kpi_retroalimentacion_etapa_3')
          valFila = c.kpi_retroalimentacion_etapa_3 ? 'Sí' : 'No';
        else if (clave === 'kpi_retroalimentacion_etapa_4')
          valFila = c.kpi_retroalimentacion_etapa_4 ? 'Sí' : 'No';
        return activos.includes(valFila);
      });
    });

    return res;
  }, [citasConFecha, busqueda, filtrosColumnas]);

  const handleCambiarRetro = async (
    cita: Cita,
    campo:
      | 'kpi_retroalimentacion_etapa_1'
      | 'kpi_retroalimentacion_etapa_2'
      | 'kpi_retroalimentacion_etapa_3'
      | 'kpi_retroalimentacion_etapa_4',
    valor: boolean
  ) => {
    setGuardandoId(`${cita.id}-${campo}`);
    try {
      await onActualizarLeadKpi(cita.id, { [campo]: valor });
    } finally {
      setGuardandoId(null);
    }
  };

  const total = citasConFecha.length;
  const e1Ok = citasConFecha.filter((c) => c.kpi_retroalimentacion_etapa_1).length;
  const e2Ok = citasConFecha.filter((c) => c.kpi_retroalimentacion_etapa_2).length;
  const e3Ok = citasConFecha.filter((c) => c.kpi_retroalimentacion_etapa_3).length;
  const e4Ok = citasConFecha.filter((c) => c.kpi_retroalimentacion_etapa_4).length;

  const handleExportarExcel = async () => {
    setExportando(true);
    try {
      const fTotal = filtrados.length;
      const fe1 = filtrados.filter((c) => c.kpi_retroalimentacion_etapa_1).length;
      const fe2 = filtrados.filter((c) => c.kpi_retroalimentacion_etapa_2).length;
      const fe3 = filtrados.filter((c) => c.kpi_retroalimentacion_etapa_3).length;
      const fe4 = filtrados.filter((c) => c.kpi_retroalimentacion_etapa_4).length;

      await exportarLibroExcel(
        `KPI_3_Retroalimentacion_${fechaInicio || 'inicio'}_${fechaFin || formatLocalDate()}`,
        [
          {
            name: 'Resumen Etapas',
            title: 'KPI 3: Resumen de Retroalimentación de Etapas',
            subtitle: formatearSubtituloExportacion({
              fechaInicio,
              fechaFin,
              totalFilas: fTotal,
              modo: tipoLeadActual === 'no_calificados' ? 'Leads No Calificados' : 'Leads Calificados',
            }),
            accentHex: '059669',
            columns: [
              { header: 'Etapa', key: 'etapa', width: 30 },
              { header: 'Con Retroalimentación', key: 'cumplen', align: 'right' },
              { header: 'Total Filtrados', key: 'total', align: 'right' },
              { header: '% Cumplimiento', key: 'pct', numFmt: '0%', align: 'right' },
            ],
            rows: [
              { etapa: 'Etapa 1: Calificación', cumplen: fe1, total: fTotal, pct: fTotal > 0 ? fe1 / fTotal : 0 },
              { etapa: 'Etapa 2: Propuesta', cumplen: fe2, total: fTotal, pct: fTotal > 0 ? fe2 / fTotal : 0 },
              { etapa: 'Etapa 3: Objeciones', cumplen: fe3, total: fTotal, pct: fTotal > 0 ? fe3 / fTotal : 0 },
              { etapa: 'Etapa 4: Cierre', cumplen: fe4, total: fTotal, pct: fTotal > 0 ? fe4 / fTotal : 0 },
            ],
          },
          {
            name: 'Detalle Retroalimentación',
            title: 'Detalle de Retroalimentación por Lead',
            subtitle: formatearSubtituloExportacion({
              fechaInicio,
              fechaFin,
              totalFilas: fTotal,
              modo: tipoLeadActual === 'no_calificados' ? 'Leads No Calificados' : 'Leads Calificados',
              extra: busqueda.trim() ? `Búsqueda: "${busqueda.trim()}"` : undefined,
            }),
            accentHex: '1E293B',
            columns: [
              { header: 'Código', key: 'codigo_prospecto', value: (c) => c.codigo_prospecto || c.id },
              { header: 'Prospecto / Lead', key: 'prospecto_nombre', width: 28 },
              { header: 'Teléfono', key: 'prospecto_telefono', width: 16 },
              { header: 'Asesor', key: 'vendedor_nombre', width: 24 },
              {
                header: 'Fecha / Hora',
                key: 'fecha_hora_programada',
                value: (c) =>
                  c.fecha_agendada && c.hora_agendada
                    ? `${c.fecha_agendada} ${c.hora_agendada}`
                    : c.fecha_hora_programada
                    ? c.fecha_hora_programada.replace('T', ' ').slice(0, 16)
                    : 'N/D',
                align: 'center',
              },
              { header: 'País', key: 'pais', value: (c) => c.pais || 'SV', align: 'center' },
              { header: 'Etapa 1', key: 'kpi_retroalimentacion_etapa_1', value: (c) => (c.kpi_retroalimentacion_etapa_1 ? 'Sí' : 'No'), semantic: 'boolean', align: 'center' },
              { header: 'Etapa 2', key: 'kpi_retroalimentacion_etapa_2', value: (c) => (c.kpi_retroalimentacion_etapa_2 ? 'Sí' : 'No'), semantic: 'boolean', align: 'center' },
              { header: 'Etapa 3', key: 'kpi_retroalimentacion_etapa_3', value: (c) => (c.kpi_retroalimentacion_etapa_3 ? 'Sí' : 'No'), semantic: 'boolean', align: 'center' },
              { header: 'Etapa 4', key: 'kpi_retroalimentacion_etapa_4', value: (c) => (c.kpi_retroalimentacion_etapa_4 ? 'Sí' : 'No'), semantic: 'boolean', align: 'center' },
            ],
            rows: filtrados,
          },
        ]
      );
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs dark:shadow-none">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
              KPI 3: Retroalimentación de Etapas {tipoLeadActual === 'no_calificados' ? '(Leads No Calificados)' : '(Leads Calificados)'}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Marca Sí/No para registrar la retroalimentación recibida en cada una de las 4 etapas del prospecto. Se sincroniza directo con <code className="text-emerald-600 dark:text-emerald-300 font-mono">public.{tipoLeadActual === 'no_calificados' ? 'leads_no_calificados' : 'leads'}</code>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportarExcel}
              disabled={exportando || filtrados.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Descargar resumen y detalle filtrado en Excel (.xlsx)"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{exportando ? 'Exportando...' : 'Descargar Excel'}</span>
            </button>
            <div className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-400 bg-slate-100 dark:bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
              {filtrados.length} / {total} Leads
            </div>
          </div>
        </div>

        {/* Estadísticas de Retroalimentación */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 tabular-nums">
          <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/40">
            <span className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">Etapa 1: Calificación</span>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {e1Ok} / {total} ({total > 0 ? Math.round((e1Ok / total) * 100) : 0}%)
            </p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/40">
            <span className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">Etapa 2: Propuesta</span>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {e2Ok} / {total} ({total > 0 ? Math.round((e2Ok / total) * 100) : 0}%)
            </p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/40">
            <span className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">Etapa 3: Objeciones</span>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {e3Ok} / {total} ({total > 0 ? Math.round((e3Ok / total) * 100) : 0}%)
            </p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/40">
            <span className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">Etapa 4: Cierre</span>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {e4Ok} / {total} ({total > 0 ? Math.round((e4Ok / total) * 100) : 0}%)
            </p>
          </div>
        </div>
      </div>

      {/* Controles de Fechas y Buscador */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <DateRangeFilter
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
          onChangeInicio={setFechaInicio}
          onChangeFin={setFechaFin}
          onLimpiar={() => {
            setFechaInicio('');
            setFechaFin('');
          }}
          label="Filtrar Fechas de Lead"
        />

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por prospecto, teléfono o asesor..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 shadow-xs"
          />
        </div>
      </div>

      {/* Tabla con Filtros por Columna y Selects Sí/No */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs dark:shadow-none">
        <div className="overflow-x-auto max-h-[650px]">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-bold sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 whitespace-nowrap">
                  <ColumnFilterDropdown
                    titulo="Prospecto / Lead"
                    clave="prospecto"
                    valoresUnicos={valoresUnicosPorColumna.prospecto}
                    seleccionados={filtrosColumnas.prospecto || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                  />
                </th>

                <th className="py-3 px-4 whitespace-nowrap">
                  <ColumnFilterDropdown
                    titulo="Teléfono"
                    clave="telefono"
                    valoresUnicos={valoresUnicosPorColumna.telefono}
                    seleccionados={filtrosColumnas.telefono || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                  />
                </th>

                <th className="py-3 px-4 whitespace-nowrap">
                  <ColumnFilterDropdown
                    titulo="Asesor"
                    clave="vendedor"
                    valoresUnicos={valoresUnicosPorColumna.vendedor}
                    seleccionados={filtrosColumnas.vendedor || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                  />
                </th>

                <th className="py-3 px-4 whitespace-nowrap">Fecha / Hora</th>

                <th className="py-3 px-4 whitespace-nowrap">
                  <ColumnFilterDropdown
                    titulo="País"
                    clave="pais"
                    valoresUnicos={valoresUnicosPorColumna.pais}
                    seleccionados={filtrosColumnas.pais || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                  />
                </th>

                <th className="py-3 px-4 whitespace-nowrap text-center">
                  <ColumnFilterDropdown
                    titulo="Etapa 1"
                    clave="kpi_retroalimentacion_etapa_1"
                    valoresUnicos={valoresUnicosPorColumna.kpi_retroalimentacion_etapa_1}
                    seleccionados={filtrosColumnas.kpi_retroalimentacion_etapa_1 || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                    alineacion="right"
                  />
                </th>

                <th className="py-3 px-4 whitespace-nowrap text-center">
                  <ColumnFilterDropdown
                    titulo="Etapa 2"
                    clave="kpi_retroalimentacion_etapa_2"
                    valoresUnicos={valoresUnicosPorColumna.kpi_retroalimentacion_etapa_2}
                    seleccionados={filtrosColumnas.kpi_retroalimentacion_etapa_2 || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                    alineacion="right"
                  />
                </th>

                <th className="py-3 px-4 whitespace-nowrap text-center">
                  <ColumnFilterDropdown
                    titulo="Etapa 3"
                    clave="kpi_retroalimentacion_etapa_3"
                    valoresUnicos={valoresUnicosPorColumna.kpi_retroalimentacion_etapa_3}
                    seleccionados={filtrosColumnas.kpi_retroalimentacion_etapa_3 || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                    alineacion="right"
                  />
                </th>

                <th className="py-3 px-4 whitespace-nowrap text-center">
                  <ColumnFilterDropdown
                    titulo="Etapa 4"
                    clave="kpi_retroalimentacion_etapa_4"
                    valoresUnicos={valoresUnicosPorColumna.kpi_retroalimentacion_etapa_4}
                    seleccionados={filtrosColumnas.kpi_retroalimentacion_etapa_4 || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                    alineacion="right"
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500 dark:text-slate-400 font-medium">
                    No se encontraron registros con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filtrados.map((cita) => {
                  return (
                    <tr key={cita.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{cita.prospecto_nombre}</div>
                        {cita.codigo_prospecto && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            Cod: {cita.codigo_prospecto}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                        {cita.prospecto_telefono || 'Sin teléfono'}
                      </td>

                      <td className="py-3 px-4 text-slate-800 dark:text-slate-300 font-medium">
                        {cita.vendedor_nombre}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300 text-[11px]">
                        {cita.fecha_agendada && cita.hora_agendada
                          ? `${cita.fecha_agendada} ${cita.hora_agendada}`
                          : cita.fecha_hora_programada
                          ? cita.fecha_hora_programada.replace('T', ' ').slice(0, 16)
                          : 'N/D'}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                          {cita.pais || 'SV'}
                        </span>
                      </td>

                      {/* Etapa 1 */}
                      <td className="py-3 px-4 text-center">
                        <select
                          value={cita.kpi_retroalimentacion_etapa_1 ? 'si' : 'no'}
                          onChange={(e) =>
                            handleCambiarRetro(
                              cita,
                              'kpi_retroalimentacion_etapa_1',
                              e.target.value === 'si'
                            )
                          }
                          disabled={guardandoId === `${cita.id}-kpi_retroalimentacion_etapa_1`}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            cita.kpi_retroalimentacion_etapa_1
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                              : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                          }`}
                        >
                          <option value="si">Sí</option>
                          <option value="no">No</option>
                        </select>
                      </td>

                      {/* Etapa 2 */}
                      <td className="py-3 px-4 text-center">
                        <select
                          value={cita.kpi_retroalimentacion_etapa_2 ? 'si' : 'no'}
                          onChange={(e) =>
                            handleCambiarRetro(
                              cita,
                              'kpi_retroalimentacion_etapa_2',
                              e.target.value === 'si'
                            )
                          }
                          disabled={guardandoId === `${cita.id}-kpi_retroalimentacion_etapa_2`}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            cita.kpi_retroalimentacion_etapa_2
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                              : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                          }`}
                        >
                          <option value="si">Sí</option>
                          <option value="no">No</option>
                        </select>
                      </td>

                      {/* Etapa 3 */}
                      <td className="py-3 px-4 text-center">
                        <select
                          value={cita.kpi_retroalimentacion_etapa_3 ? 'si' : 'no'}
                          onChange={(e) =>
                            handleCambiarRetro(
                              cita,
                              'kpi_retroalimentacion_etapa_3',
                              e.target.value === 'si'
                            )
                          }
                          disabled={guardandoId === `${cita.id}-kpi_retroalimentacion_etapa_3`}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            cita.kpi_retroalimentacion_etapa_3
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                              : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                          }`}
                        >
                          <option value="si">Sí</option>
                          <option value="no">No</option>
                        </select>
                      </td>

                      {/* Etapa 4 */}
                      <td className="py-3 px-4 text-center">
                        <select
                          value={cita.kpi_retroalimentacion_etapa_4 ? 'si' : 'no'}
                          onChange={(e) =>
                            handleCambiarRetro(
                              cita,
                              'kpi_retroalimentacion_etapa_4',
                              e.target.value === 'si'
                            )
                          }
                          disabled={guardandoId === `${cita.id}-kpi_retroalimentacion_etapa_4`}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            cita.kpi_retroalimentacion_etapa_4
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                              : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                          }`}
                        >
                          <option value="si">Sí</option>
                          <option value="no">No</option>
                        </select>
                      </td>
                    </tr>
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
