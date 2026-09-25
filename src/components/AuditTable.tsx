import React, { useState } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Phone,
  Calendar,
  User,
  Volume2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileCheck,
  PhoneForwarded,
} from 'lucide-react';
import { CruceAuditoria, EstadoCumplimiento } from '../types';

interface AuditTableProps {
  cruces: CruceAuditoria[];
  onAuditarCruce?: (cruceId: string, notas: string) => void;
}

export const AuditTable: React.FC<AuditTableProps> = ({ cruces, onAuditarCruce }) => {
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [filtroVendedor, setFiltroVendedor] = useState<string>('todos');
  const [cruceExpandido, setCruceExpandido] = useState<string | null>(null);
  const [notasSupervisor, setNotasSupervisor] = useState<{ [id: string]: string }>({});
  const [reproduciendoAudio, setReproduciendoAudio] = useState<string | null>(null);

  // Lista única de vendedores para el selector
  const listaVendedores = Array.from(new Set(cruces.map((c) => c.vendedor_nombre))).filter(Boolean);

  // Filtrado reactivo
  const crucesFiltrados = cruces.filter((c) => {
    const matchBusqueda =
      c.prospecto_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.telefono.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.vendedor_nombre.toLowerCase().includes(busqueda.toLowerCase());

    const matchEstado =
      filtroEstado === 'todos' ? true : c.estado_cumplimiento === filtroEstado;

    const matchVendedor =
      filtroVendedor === 'todos' ? true : c.vendedor_nombre === filtroVendedor;

    return matchBusqueda && matchEstado && matchVendedor;
  });

  const formatearFechaHora = (iso?: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleString('es-ES', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatearSegundos = (seg?: number) => {
    if (seg === undefined || seg === null) return '-';
    const min = Math.floor(seg / 60);
    const resto = seg % 60;
    return `${min}m ${resto}s`;
  };

  const badgeEstado = (estado: EstadoCumplimiento, desfase?: number) => {
    switch (estado) {
      case 'A_TIEMPO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="h-3.5 w-3.5" />
            A Tiempo {desfase !== undefined ? `(${desfase > 0 ? `+${desfase}m` : `${desfase}m`})` : ''}
          </span>
        );
      case 'TARDE_LEVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="h-3.5 w-3.5" />
            Retraso Leve (+{desfase}m)
          </span>
        );
      case 'TARDE_GRAVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <XCircle className="h-3.5 w-3.5" />
            Retraso Grave (+{desfase}m)
          </span>
        );
      case 'NO_LLAMO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950 text-rose-400 border border-rose-800">
            <XCircle className="h-3.5 w-3.5" />
            No Llamó
          </span>
        );
      case 'LLAMADA_CORTA':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500/15 text-orange-300 border border-orange-500/30">
            <Clock className="h-3.5 w-3.5" />
            Corta / Buzón
          </span>
        );
      case 'ADELANTADA':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
            <Clock className="h-3.5 w-3.5" />
            Adelantada ({desfase}m)
          </span>
        );
      case 'SIN_CITA':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <PhoneForwarded className="h-3.5 w-3.5" />
            Sin Cita Previa
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Header Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por prospecto, teléfono o vendedor..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Vendedor Filter */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300">
              <User className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={filtroVendedor}
                onChange={(e) => setFiltroVendedor(e.target.value)}
                className="bg-transparent border-none text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="todos" className="bg-slate-900">
                  Todos los Vendedores
                </option>
                {listaVendedores.map((v) => (
                  <option key={v} value={v} className="bg-slate-900">
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {/* Estado Filter */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="bg-transparent border-none text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="todos" className="bg-slate-900">
                  Todos los Estados ({cruces.length})
                </option>
                <option value="A_TIEMPO" className="bg-slate-900">
                  A Tiempo
                </option>
                <option value="TARDE_LEVE" className="bg-slate-900">
                  Retraso Leve
                </option>
                <option value="TARDE_GRAVE" className="bg-slate-900">
                  Retraso Grave
                </option>
                <option value="NO_LLAMO" className="bg-slate-900">
                  No Llamó
                </option>
                <option value="LLAMADA_CORTA" className="bg-slate-900">
                  Corta / Buzón
                </option>
                <option value="SIN_CITA" className="bg-slate-900">
                  Sin Cita Previa
                </option>
              </select>
            </div>

            <span className="text-xs text-slate-400 ml-auto">
              Mostrando <strong>{crucesFiltrados.length}</strong> registros
            </span>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 font-semibold">Prospecto / Contacto</th>
                <th className="px-4 py-3 font-semibold">Vendedor / Closer</th>
                <th className="px-4 py-3 font-semibold">Cita Programada</th>
                <th className="px-4 py-3 font-semibold">Llamada Real</th>
                <th className="px-4 py-3 font-semibold">Duración</th>
                <th className="px-4 py-3 font-semibold">Cumplimiento KPI</th>
                <th className="px-4 py-3 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {crucesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500">
                    No se encontraron registros de cruce con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                crucesFiltrados.map((item) => {
                  const estaExpandido = cruceExpandido === item.id;
                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                          estaExpandido ? 'bg-slate-800/30' : ''
                        }`}
                        onClick={() => setCruceExpandido(estaExpandido ? null : item.id)}
                      >
                        {/* Prospecto */}
                        <td className="px-4 py-3.5">
                          <div>
                            <span className="font-semibold text-white block">
                              {item.prospecto_nombre}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {item.telefono}
                            </span>
                            {item.cita?.fuente && (
                              <span className="inline-block text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 ml-1.5">
                                {item.cita.fuente}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Vendedor */}
                        <td className="px-4 py-3.5">
                          <span className="text-slate-200 font-medium">{item.vendedor_nombre}</span>
                        </td>

                        {/* Hora Cita */}
                        <td className="px-4 py-3.5 font-mono">
                          {item.fecha_cita ? (
                            <span className="text-slate-200">
                              {formatearFechaHora(item.fecha_cita)}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">Sin Cita</span>
                          )}
                        </td>

                        {/* Hora Llamada */}
                        <td className="px-4 py-3.5 font-mono">
                          {item.fecha_llamada ? (
                            <span className="text-slate-200">
                              {formatearFechaHora(item.fecha_llamada)}
                            </span>
                          ) : (
                            <span className="text-rose-400 font-semibold italic">
                              No registrada
                            </span>
                          )}
                        </td>

                        {/* Duración */}
                        <td className="px-4 py-3.5">
                          <span
                            className={`${
                              item.duracion_llamada_segundos && item.duracion_llamada_segundos < 60
                                ? 'text-amber-400 font-medium'
                                : 'text-slate-300'
                            }`}
                          >
                            {formatearSegundos(item.duracion_llamada_segundos)}
                          </span>
                        </td>

                        {/* Estado Cumplimiento */}
                        <td className="px-4 py-3.5">
                          {badgeEstado(item.estado_cumplimiento, item.desfase_minutos)}
                        </td>

                        {/* Acción / Toggle */}
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            className="p-1 rounded text-slate-400 hover:text-white"
                          >
                            {estaExpandido ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Audit Details Row */}
                      {estaExpandido && (
                        <tr className="bg-slate-950/60 border-b border-slate-800">
                          <td colSpan={7} className="p-4">
                            <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
                              <div className="flex flex-col md:flex-row justify-between gap-4 border-b border-slate-800/80 pb-3">
                                <div>
                                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                    <FileCheck className="h-4 w-4 text-indigo-400" />
                                    Diagnóstico del Cruce de Auditoría
                                  </h4>
                                  <p className="text-xs text-slate-300 mt-1">{item.explicacion}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  {item.llamada?.grabacion_url && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setReproduciendoAudio(
                                          reproduciendoAudio === item.id ? null : item.id
                                        );
                                      }}
                                      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30"
                                    >
                                      <Volume2 className="h-3.5 w-3.5" />
                                      <span>
                                        {reproduciendoAudio === item.id
                                          ? 'Pausar Audio'
                                          : 'Escuchar Grabación'}
                                      </span>
                                    </button>
                                  )}
                                  {item.cita?.valor_estimado && (
                                    <div className="text-xs text-slate-400">
                                      Valor estimado:{' '}
                                      <strong className="text-emerald-400">
                                        ${item.cita.valor_estimado.toLocaleString()} USD
                                      </strong>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Simulated audio player player bar */}
                              {reproduciendoAudio === item.id && (
                                <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-800/40 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                                    <span className="text-xs text-indigo-200">
                                      Reproduciendo audio de llamada ({item.llamada?.proveedor}): 0:14 /{' '}
                                      {formatearSegundos(item.duracion_llamada_segundos)}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-slate-400 font-mono">
                                    128 kbps stereo
                                  </span>
                                </div>
                              )}

                              {/* Context Notes & Supervisor Section */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                <div>
                                  <span className="text-slate-400 block font-semibold mb-1">
                                    Detalles de la Cita (CRM / Calendario):
                                  </span>
                                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 text-slate-300 space-y-1">
                                    <p>
                                      <strong>Tipo:</strong>{' '}
                                      {item.cita?.tipo_reunion || 'No especificado'}
                                    </p>
                                    <p>
                                      <strong>Email:</strong>{' '}
                                      {item.cita?.prospecto_email || 'Sin correo'}
                                    </p>
                                    <p>
                                      <strong>Notas previas:</strong>{' '}
                                      {item.cita?.notas || 'Sin comentarios registrados.'}
                                    </p>
                                  </div>
                                </div>

                                <div>
                                  <span className="text-slate-400 block font-semibold mb-1">
                                    Notas del Vendedor / Telefonía ({item.llamada?.proveedor || 'Sin telefonía'}):
                                  </span>
                                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 text-slate-300 space-y-1">
                                    <p>
                                      <strong>Resultado reportado:</strong>{' '}
                                      {item.llamada?.resultado || 'No hubo llamada'}
                                    </p>
                                    <p>
                                      <strong>Comentario de la llamada:</strong>{' '}
                                      {item.llamada?.notas_llamada || 'Sin notas en telefonía.'}
                                    </p>
                                  </div>
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
