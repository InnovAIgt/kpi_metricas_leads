import React, { useState } from 'react';
import { BookOpen, Plus, Edit, Trash2, Search, Check, X, AlertCircle } from 'lucide-react';

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

  const filtrados = catalogo.filter((c) => {
    const q = busqueda.toLowerCase();
    return (
      c.nombre_ejecutivo?.toLowerCase().includes(q) ||
      c.usuario?.toLowerCase().includes(q) ||
      c.extension?.includes(q) ||
      c.celular?.includes(q) ||
      c.pais?.toLowerCase().includes(q)
    );
  });

  const abrirCrear = () => {
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
    setEditando({ ...item, pais: item.pais || 'SV' });
    setModalAbierto(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando || !editando.nombre_ejecutivo) return;

    setCargando(true);
    try {
      const ok = await onGuardarItem(editando);
      if (ok) {
        setModalAbierto(false);
        setEditando(null);
      }
    } finally {
      setCargando(false);
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
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Catálogo de Asesores (CRUD)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tabla <code className="text-indigo-600 dark:text-indigo-300 font-mono">public.catalogo</code>: vincula el nombre real del closer/setter con su país, usuario de PBX, extensión y número de celular.
              </p>
            </div>
          </div>

          <button
            onClick={abrirCrear}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-sm transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo Asesor</span>
          </button>
        </div>
      </div>

      {/* Buscador */}
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

      {/* Tabla CRUD */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
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
                filtrados.map((item) => (
                  <tr key={item.id || item.usuario} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{item.nombre_ejecutivo}</td>
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
                    <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">{item.usuario || '-'}</td>
                    <td className="py-3 px-4 font-mono text-amber-600 dark:text-amber-400 font-bold">{item.extension || '-'}</td>
                    <td className="py-3 px-4 font-mono text-blue-600 dark:text-blue-400">{item.celular || '-'}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => abrirEditar(item)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white dark:border-transparent cursor-pointer transition-colors"
                          title="Editar"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        {item.id && (
                          <button
                            onClick={() => onEliminarItem(item.id!)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:hover:bg-rose-900 dark:text-rose-300 dark:border-transparent cursor-pointer transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
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
                  onClick={() => setModalAbierto(false)}
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
