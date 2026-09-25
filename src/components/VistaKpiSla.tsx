import React, { useState, useMemo } from 'react';
import { Shield, Search, Check, Save, AlertCircle, RefreshCw, X } from 'lucide-react';
import { Cita, ModoLeads } from '../types';
import { ColumnFilterDropdown } from './ColumnFilterDropdown';
import { DateRangeFilter } from './DateRangeFilter';
import { getRangoDefaultLeads } from '../utils/dateHelpers';

interface VistaKpiSlaProps {
  citas: Cita[];
  onActualizarLeadKpi: (leadId: string, cambios: Partial<Cita>) => Promise<boolean>;
  tipoLeadActual?: ModoLeads;
}

export const VistaKpiSla: React.FC<VistaKpiSlaProps> = ({
  citas,
  onActualizarLeadKpi,
  tipoLeadActual = 'calificados',
}) => {
  const [busqueda, setBusqueda] = useState('');
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

  // 1. Filtrar por rango de fecha
  const citasConFecha = useMemo(() => {
    if (!fechaInicio && !fechaFin) return citas;
    return citas.filter((c) => {
      const f = c.fecha_agendada || (c.fecha_hora_programada ? c.fecha_hora_programada.slice(0, 10) : '');
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

    citasConFecha.forEach((c) => {
      if (c.prospecto_nombre) prospectos.add(c.prospecto_nombre);
      if (c.prospecto_telefono) telefonos.add(c.prospecto_telefono);
      if (c.vendedor_nombre) asesores.add(c.vendedor_nombre);
      if (c.pais) paises.add(c.pais);
    });

    return {
      prospecto: Array.from(prospectos).slice(0, 150).sort(),
      telefono: Array.from(telefonos).slice(0, 150).sort(),
      vendedor: Array.from(asesores).sort(),
      pais: Array.from(paises).sort(),
      kpi_sla_etapa_1: Array.from(e1),
      kpi_sla_etapa_2: Array.from(e2),
      kpi_sla_etapa_3: Array.from(e3),
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
      if (seleccionados.includes('__NINGUNO__')) {
        res = [];
        return;
      }

      res = res.filter((c) => {
        let valFila = '';
        if (clave === 'prospecto') valFila = c.prospecto_nombre;
        else if (clave === 'telefono') valFila = c.prospecto_telefono;
        else if (clave === 'vendedor') valFila = c.vendedor_nombre;
        else if (clave === 'pais') valFila = c.pais || '';
        else if (clave === 'kpi_sla_etapa_1') valFila = c.kpi_sla_etapa_1 ? 'Sí' : 'No';
        else if (clave === 'kpi_sla_etapa_2') valFila = c.kpi_sla_etapa_2 ? 'Sí' : 'No';
        else if (clave === 'kpi_sla_etapa_3') valFila = c.kpi_sla_etapa_3 ? 'Sí' : 'No';
        return seleccionados.includes(valFila);
      });
    });

    return res;
  }, [citasConFecha, busqueda, filtrosColumnas]);

  const handleCambiarSla = async (
    cita: Cita,
    campo: 'kpi_sla_etapa_1' | 'kpi_sla_etapa_2' | 'kpi_sla_etapa_3',
    valor: boolean
  ) => {
    setGuardandoId(`${cita.id}-${campo}`);
    try {
      await onActualizarLeadKpi(cita.id, { [campo]: valor });
    } finally {
      setGuardandoId(null);
    }
  };

  // Cálculos estadísticos
  const total = citasConFecha.length;
  const e1Ok = citasConFecha.filter((c) => c.kpi_sla_etapa_1).length;
  const e2Ok = citasConFecha.filter((c) => c.kpi_sla_etapa_2).length;
  const e3Ok = citasConFecha.filter((c) => c.kpi_sla_etapa_3).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-400" />
              KPI 2: SLA de Etapas {tipoLeadActual === 'no_calificados' ? '(Leads No Calificados)' : '(Leads Calificados)'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Selecciona con Sí / No si el asesor cumplió el SLA en cada etapa. Se persiste de forma reactiva en <code className="text-amber-300">public.{tipoLeadActual === 'no_calificados' ? 'leads_no_calificados' : 'leads'}</code>.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            {filtrados.length} / {total} Leads
          </div>
        </div>

        {/* Resumen SLA */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-4">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <span className="text-xs text-slate-400">Total Leads</span>
            <p className="text-lg font-bold text-white mt-0.5">{total}</p>
          </div>
          <div className="bg-amber-950/20 p-3 rounded-lg border border-amber-900/40">
            <span className="text-xs text-amber-300">SLA Etapa 1 (Primer Contacto)</span>
            <p className="text-lg font-bold text-amber-400 mt-0.5">
              {e1Ok} / {total} ({total > 0 ? Math.round((e1Ok / total) * 100) : 0}%)
            </p>
          </div>
          <div className="bg-amber-950/20 p-3 rounded-lg border border-amber-900/40">
            <span className="text-xs text-amber-300">SLA Etapa 2 (Seguimiento Inicial)</span>
            <p className="text-lg font-bold text-amber-400 mt-0.5">
              {e2Ok} / {total} ({total > 0 ? Math.round((e2Ok / total) * 100) : 0}%)
            </p>
          </div>
          <div className="bg-amber-950/20 p-3 rounded-lg border border-amber-900/40">
            <span className="text-xs text-amber-300">SLA Etapa 3 (Cierre / Oferta)</span>
            <p className="text-lg font-bold text-amber-400 mt-0.5">
              {e3Ok} / {total} ({total > 0 ? Math.round((e3Ok / total) * 100) : 0}%)
            </p>
          </div>
        </div>
      </div>

      {/* Controles de Rango de Fechas & Buscador */}
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
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Tabla con Filtro en Cada Columna y Selects Sí/No */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[650px]">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-bold sticky top-0 z-20 border-b border-slate-800">
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
                    titulo="SLA Etapa 1"
                    clave="kpi_sla_etapa_1"
                    valoresUnicos={valoresUnicosPorColumna.kpi_sla_etapa_1}
                    seleccionados={filtrosColumnas.kpi_sla_etapa_1 || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                    alineacion="right"
                  />
                </th>

                <th className="py-3 px-4 whitespace-nowrap text-center">
                  <ColumnFilterDropdown
                    titulo="SLA Etapa 2"
                    clave="kpi_sla_etapa_2"
                    valoresUnicos={valoresUnicosPorColumna.kpi_sla_etapa_2}
                    seleccionados={filtrosColumnas.kpi_sla_etapa_2 || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                    alineacion="right"
                  />
                </th>

                <th className="py-3 px-4 whitespace-nowrap text-center">
                  <ColumnFilterDropdown
                    titulo="SLA Etapa 3"
                    clave="kpi_sla_etapa_3"
                    valoresUnicos={valoresUnicosPorColumna.kpi_sla_etapa_3}
                    seleccionados={filtrosColumnas.kpi_sla_etapa_3 || []}
                    onCambiarSeleccion={handleCambiarFiltroColumna}
                    alineacion="right"
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500 font-medium">
                    No se encontraron leads con los filtros actuales.
                  </td>
                </tr>
              ) : (
                filtrados.map((cita) => {
                  return (
                    <tr key={cita.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{cita.prospecto_nombre}</div>
                        {cita.codigo_prospecto && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            Cod: {cita.codigo_prospecto}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300">
                        {cita.prospecto_telefono || 'Sin teléfono'}
                      </td>

                      <td className="py-3 px-4 text-slate-300 font-medium">
                        {cita.vendedor_nombre}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300 text-[11px]">
                        {cita.fecha_agendada && cita.hora_agendada
                          ? `${cita.fecha_agendada} ${cita.hora_agendada}`
                          : cita.fecha_hora_programada
                          ? cita.fecha_hora_programada.replace('T', ' ').slice(0, 16)
                          : 'N/D'}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          {cita.pais || 'SV'}
                        </span>
                      </td>

                      {/* SLA Etapa 1 */}
                      <td className="py-3 px-4 text-center">
                        <select
                          value={cita.kpi_sla_etapa_1 ? 'si' : 'no'}
                          onChange={(e) =>
                            handleCambiarSla(cita, 'kpi_sla_etapa_1', e.target.value === 'si')
                          }
                          disabled={guardandoId === `${cita.id}-kpi_sla_etapa_1`}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            cita.kpi_sla_etapa_1
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                              : 'bg-rose-950 text-rose-300 border-rose-500/50'
                          }`}
                        >
                          <option value="si">Sí</option>
                          <option value="no">No</option>
                        </select>
                      </td>

                      {/* SLA Etapa 2 */}
                      <td className="py-3 px-4 text-center">
                        <select
                          value={cita.kpi_sla_etapa_2 ? 'si' : 'no'}
                          onChange={(e) =>
                            handleCambiarSla(cita, 'kpi_sla_etapa_2', e.target.value === 'si')
                          }
                          disabled={guardandoId === `${cita.id}-kpi_sla_etapa_2`}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            cita.kpi_sla_etapa_2
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                              : 'bg-rose-950 text-rose-300 border-rose-500/50'
                          }`}
                        >
                          <option value="si">Sí</option>
                          <option value="no">No</option>
                        </select>
                      </td>

                      {/* SLA Etapa 3 */}
                      <td className="py-3 px-4 text-center">
                        <select
                          value={cita.kpi_sla_etapa_3 ? 'si' : 'no'}
                          onChange={(e) =>
                            handleCambiarSla(cita, 'kpi_sla_etapa_3', e.target.value === 'si')
                          }
                          disabled={guardandoId === `${cita.id}-kpi_sla_etapa_3`}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            cita.kpi_sla_etapa_3
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                              : 'bg-rose-950 text-rose-300 border-rose-500/50'
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
