import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Edit,
  Trash2,
  Search,
  Download,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';
import { exportarTablaAExcel, formatearSubtituloExportacion } from '../utils/excelExport';
import { formatLocalDate } from '../utils/dateHelpers';

export interface CatalogoItem {
  id?: string;
  nombre_ejecutivo: string;
  usuario: string;
  extension: string;
  celular: string;
  pais?: string;
}

interface VistaCatalogoCrudProps {
  catalogo: CatalogoItem[];
  onGuardarItem: (item: CatalogoItem) => Promise<boolean>;
  onEliminarItem: (id: string) => Promise<boolean>;
}

export const VistaCatalogoCrud: React.FC<VistaCatalogoCrudProps> = ({
  catalogo,
  onGuardarItem,
  onEliminarItem,
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<CatalogoItem | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [confirmandoEliminarId, setConfirmandoEliminarId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [errorCrud, setErrorCrud] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const filtrados = catalogo.filter((c) => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return true;
    return (
      c.nombre_ejecutivo?.toLowerCase().includes(q) ||
      c.usuario?.toLowerCase().includes(q) ||
      c.extension?.includes(q) ||
      c.celular?.includes(q) ||
      c.pais?.toLowerCase().includes(q)
    );
  });

  const abrirCrear = () => {
    setErrorCrud(null);
    setEditando({
      nombre_ejecutivo: '',
      usuario: '',
      extension: '',
      celular: '',
      pais: 'SV',
    });
    setModalAbierto(true);
  };

  const abrirEditar = (item: CatalogoItem) => {
    setErrorCrud(null);
    setEditando({ ...item, pais: item.pais || 'SV' });
    setModalAbierto(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando || !editando.nombre_ejecutivo.trim()) return;

    setErrorCrud(null);
    setCargando(true);
    try {
      const ok = await onGuardarItem({
        ...editando,
        nombre_ejecutivo: editando.nombre_ejecutivo.trim(),
        usuario: (editando.usuario || '').trim(),
        extension: (editando.extension || '').trim(),
        celular: (editando.celular || '').trim(),
        pais: editando.pais || 'SV',
      });
      if (ok) {
        setModalAbierto(false);
        setEditando(null);
      } else {
        setErrorCrud('No se pudo guardar el ejecutivo en Supabase. Verifica los datos e intenta nuevamente.');
      }
    } catch (err: any) {
      setErrorCrud(err?.message || 'Error al guardar ejecutivo.');
    } finally {
      setCargando(false);
    }
  };

  const handleConfirmarEliminar = async (id: string) => {
    setErrorCrud(null);
    setEliminandoId(id);
    try {
      const ok = await onEliminarItem(id);
      if (!ok) {
        setErrorCrud('No se pudo eliminar el ejecutivo del catálogo.');
      } else {
        setConfirmandoEliminarId(null);
      }
    } catch (err: any) {
      setErrorCrud(err?.message || 'Error al eliminar ejecutivo.');
    } finally {
      setEliminandoId(null);
    }
  };

  const handleExportarExcel = async () => {
    setExportando(true);
    try {
      await exportarTablaAExcel(`Catalogo_Asesores_${formatLocalDate()}`, {
        name: 'Catálogo Asesores',
        title: 'Catálogo de Asesores / Ejecutivos',
        subtitle: formatearSubtituloExportacion({
          totalFilas: filtrados.length,
          modo: 'Catálogo (CRUD)',
          extra: busqueda.trim() ? `Filtro búsqueda: "${busqueda.trim()}"` : undefined,
        }),
        accentHex: '4F46E5',
        columns: [
          { header: 'Nombre Ejecutivo', key: 'nombre_ejecutivo', width: 28 },
          {
            header: 'País',
            key: 'pais',
            width: 18,
            value: (r) => (r.pais === 'GT' ? 'Guatemala (GT)' : 'El Salvador (SV)'),
            align: 'center',
          },
          { header: 'Usuario PBX / Sistema', key: 'usuario', width: 22 },
          { header: 'Extensión PBX', key: 'extension', width: 16, align: 'center' },
          { header: 'Teléfono Celular', key: 'celular', width: 20, align: 'center' },
        ],
        rows: filtrados,
      });
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs dark:shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 dark:bg-indigo-950/60 dark:border-indigo-700/60 dark:text-indigo-400">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Catálogo de Asesores (CRUD)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tabla <code className="text-indigo-600 dark:text-indigo-300 font-mono">public.catalogo</code>: vincula el nombre real del closer/setter con su país, usuario de PBX, extensión y número de celular.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportarExcel}
              disabled={exportando || filtrados.length === 0}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="Descargar catálogo filtrado en Excel (.xlsx)"
            >
              <Download className="h-4 w-4" />
              <span>{exportando ? 'Exportando...' : 'Descargar Excel'}</span>
            </button>

            <button
              type="button"
              onClick={abrirCrear}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-sm transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo Asesor</span>
            </button>
          </div>
        </div>
      </div>

      {errorCrud && !modalAbierto && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorCrud}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorCrud(null)}
            className="text-rose-600 dark:text-rose-300 hover:opacity-75 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Buscador y conteo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar asesor, país, extensión o celular..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 shadow-xs"
          />
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          Mostrando <strong className="text-slate-900 dark:text-white">{filtrados.length}</strong> de {catalogo.length} ejecutivos
        </span>
      </div>

      {/* Tabla CRUD */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 tabular-nums">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-bold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Nombre Ejecutivo</th>
                <th className="py-3 px-4">País</th>
                <th className="py-3 px-4">Usuario PBX / Sistema</th>
                <th className="py-3 px-4">Extensión PBX</th>
                <th className="py-3 px-4">Teléfono Celular</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    No hay ejecutivos registrados en el catálogo.
                  </td>
                </tr>
              ) : (
                filtrados.map((item) => {
                  const confirmando = Boolean(item.id && confirmandoEliminarId === item.id);
                  const eliminando = Boolean(item.id && eliminandoId === item.id);

                  return (
                    <tr
                      key={item.id || `${item.usuario}-${item.nombre_ejecutivo}`}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {item.nombre_ejecutivo}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold ${
                            item.pais === 'GT'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/80 dark:text-sky-300 dark:border-sky-800/50'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/80 dark:text-indigo-300 dark:border-indigo-800/50'
                          }`}
                        >
                          <span>{item.pais === 'GT' ? '🇬🇹' : '🇸🇻'}</span>
                          <span>{item.pais === 'GT' ? 'Guatemala (GT)' : 'El Salvador (SV)'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                        {item.usuario || '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-amber-600 dark:text-amber-400 font-bold">
                        {item.extension || '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-blue-600 dark:text-blue-400">
                        {item.celular || '-'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => abrirEditar(item)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white dark:border-transparent cursor-pointer transition-colors"
                            title="Editar"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>

                          {item.id && !confirmando && (
                            <button
                              type="button"
                              onClick={() => setConfirmandoEliminarId(item.id!)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:hover:bg-rose-900 dark:text-rose-300 dark:border-transparent cursor-pointer transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {item.id && confirmando && (
                            <div className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-700 rounded-lg px-2 py-1">
                              <button
                                type="button"
                                disabled={eliminando}
                                onClick={() => handleConfirmarEliminar(item.id!)}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-200 hover:underline cursor-pointer disabled:opacity-50"
                              >
                                <Check className="h-3 w-3" />
                                <span>{eliminando ? 'Eliminando...' : 'Confirmar'}</span>
                              </button>
                              <span className="text-slate-400">|</span>
                              <button
                                type="button"
                                disabled={eliminando}
                                onClick={() => setConfirmandoEliminarId(null)}
                                className="text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </div>
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

      {/* Modal Formulario CRUD */}
      {modalAbierto && editando && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              {editando.id ? 'Editar Ejecutivo' : 'Agregar Ejecutivo al Catálogo'}
            </h3>
            {errorCrud && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs">
                {errorCrud}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nombre Completo del Asesor *
                </label>
                <input
                  type="text"
                  required
                  value={editando.nombre_ejecutivo}
                  onChange={(e) =>
                    setEditando({ ...editando, nombre_ejecutivo: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  País Asignado *
                </label>
                <select
                  value={editando.pais || 'SV'}
                  onChange={(e) =>
                    setEditando({ ...editando, pais: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="SV">🇸🇻 El Salvador (SV)</option>
                  <option value="GT">🇬🇹 Guatemala (GT)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Usuario PBX / Login
                </label>
                <input
                  type="text"
                  value={editando.usuario}
                  onChange={(e) =>
                    setEditando({ ...editando, usuario: e.target.value })
                  }
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Extensión PBX
                  </label>
                  <input
                    type="text"
                    value={editando.extension}
                    onChange={(e) =>
                      setEditando({ ...editando, extension: e.target.value })
                    }
                    placeholder="Ej: 4059"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Celular
                  </label>
                  <input
                    type="text"
                    value={editando.celular}
                    onChange={(e) =>
                      setEditando({ ...editando, celular: e.target.value })
                    }
                    placeholder="Ej: 7981 1670"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setModalAbierto(false);
                    setErrorCrud(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={cargando}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer shadow-sm transition-colors"
                >
                  {cargando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
