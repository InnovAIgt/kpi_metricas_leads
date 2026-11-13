import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Filter, Search, Check, ChevronDown, X } from 'lucide-react';

export interface FiltroColumnaConfig {
  clave: string;
  valoresSeleccionados: string[]; // vacío = todos
  textoBusqueda: string;
}

interface ColumnFilterDropdownProps {
  titulo: string;
  clave: string;
  valoresUnicos: string[];
  seleccionados: string[];
  onCambiarSeleccion: (clave: string, nuevos: string[]) => void;
  alineacion?: 'left' | 'right';
}

export const ColumnFilterDropdown: React.FC<ColumnFilterDropdownProps> = ({
  titulo,
  clave,
  valoresUnicos,
  seleccionados,
  onCambiarSeleccion,
  alineacion = 'left',
}) => {
  const [abierto, setAbierto] = useState(false);
  const [busquedaLocal, setBusquedaLocal] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setAbierto(false);
      }
    }
    if (abierto) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [abierto]);

  const valoresFiltrados = useMemo(() => {
    if (!busquedaLocal.trim()) return valoresUnicos;
    const q = busquedaLocal.toLowerCase();
    return valoresUnicos.filter((v) => (v || '(Vacío)').toLowerCase().includes(q));
  }, [valoresUnicos, busquedaLocal]);

  const estaActivo = seleccionados.length > 0;
  const haySoloNinguno =
    seleccionados.length === 1 && seleccionados[0] === '__NINGUNO__';
  const activosReales = useMemo(
    () => seleccionados.filter((s) => s !== '__NINGUNO__'),
    [seleccionados]
  );

  const toggleValor = (val: string) => {
    // Caso 1: estaban todos seleccionados (array vacío) -> al desmarcar uno, quedan todos menos ese
    if (seleccionados.length === 0) {
      const restantes = valoresUnicos.filter((v) => v !== val);
      onCambiarSeleccion(clave, restantes.length > 0 ? restantes : ['__NINGUNO__']);
      return;
    }

    // Caso 2: había selección previa (limpiar marcador __NINGUNO__ siempre)
    const sinNinguno = seleccionados.filter((s) => s !== '__NINGUNO__');

    if (sinNinguno.includes(val)) {
      const nuevos = sinNinguno.filter((s) => s !== val);
      onCambiarSeleccion(clave, nuevos.length > 0 ? nuevos : ['__NINGUNO__']);
    } else {
      const nuevos = [...sinNinguno, val];
      // Si volvió a marcar todos los valores únicos disponibles, normalizar a []
      if (valoresUnicos.length > 0 && nuevos.length >= valoresUnicos.length) {
        onCambiarSeleccion(clave, []);
      } else {
        onCambiarSeleccion(clave, nuevos);
      }
    }
  };

  const seleccionarSoloEste = (val: string) => {
    onCambiarSeleccion(clave, [val]);
  };

  const seleccionarSoloCoincidentes = () => {
    if (valoresFiltrados.length === 0) {
      onCambiarSeleccion(clave, ['__NINGUNO__']);
      return;
    }
    if (valoresFiltrados.length >= valoresUnicos.length) {
      onCambiarSeleccion(clave, []);
    } else {
      onCambiarSeleccion(clave, [...valoresFiltrados]);
    }
  };

  const seleccionarTodos = () => {
    onCambiarSeleccion(clave, []);
  };

  const deseleccionarTodos = () => {
    onCambiarSeleccion(clave, ['__NINGUNO__']);
  };

  return (
    <div className="relative inline-flex items-center gap-1.5" ref={popoverRef}>
      <span className="font-semibold text-slate-700 dark:text-slate-300 select-none">{titulo}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto(!abierto);
        }}
        title={`Filtrar por ${titulo}`}
        className={`p-1 rounded transition-all hover:bg-slate-200 dark:hover:bg-slate-700/60 cursor-pointer ${
          estaActivo
            ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 ring-1 ring-rose-500/50'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        <Filter className={`h-3 w-3 ${estaActivo ? 'text-rose-500 fill-rose-500/20' : ''}`} />
      </button>

      {/* Popover desplegable con buscador dinámico y checklist */}
      {abierto && (
        <div
          className={`absolute top-full mt-1.5 z-50 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-2.5 text-xs font-normal normal-case tracking-normal ${
            alineacion === 'right' ? 'right-0' : 'left-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header del Filtro */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="font-bold text-slate-900 dark:text-white text-[11px] truncate">
              Filtro: {titulo}
              {estaActivo && !haySoloNinguno && (
                <span className="ml-1 text-rose-600 dark:text-rose-400 font-mono tabular-nums">
                  ({activosReales.length})
                </span>
              )}
            </span>
            {estaActivo && (
              <button
                type="button"
                onClick={() => {
                  setBusquedaLocal('');
                  onCambiarSeleccion(clave, []);
                }}
                className="text-[10px] text-rose-500 dark:text-rose-400 hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <X className="h-2.5 w-2.5" /> Limpiar
              </button>
            )}
          </div>

          {/* Buscador Dinámico */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2 h-3 w-3 text-slate-400" />
            <input
              type="text"
              placeholder={`Buscar en ${titulo}...`}
              value={busquedaLocal}
              onChange={(e) => setBusquedaLocal(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-rose-500"
              autoFocus
            />
          </div>

          {/* Acciones Rápidas */}
          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-500 dark:text-slate-400 mb-2 px-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={seleccionarTodos}
                className="hover:text-slate-900 dark:hover:text-white underline underline-offset-2 cursor-pointer"
              >
                Todos
              </button>
              <button
                type="button"
                onClick={deseleccionarTodos}
                className="hover:text-slate-900 dark:hover:text-white underline underline-offset-2 cursor-pointer"
              >
                Ninguno
              </button>
            </div>
            {busquedaLocal.trim() && valoresFiltrados.length > 0 && (
              <button
                type="button"
                onClick={seleccionarSoloCoincidentes}
                className="text-rose-600 dark:text-rose-400 font-semibold hover:underline underline-offset-2 cursor-pointer"
              >
                Solo coincidentes ({valoresFiltrados.length})
              </button>
            )}
          </div>

          {/* Checklist de Valores */}
          <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1 divide-y divide-slate-100 dark:divide-slate-800/40">
            {valoresFiltrados.length === 0 ? (
              <div className="py-3 text-center text-slate-400 dark:text-slate-500 text-[11px]">
                Sin coincidencias
              </div>
            ) : (
              valoresFiltrados.map((val) => {
                const checked =
                  seleccionados.length === 0 || activosReales.includes(val);
                return (
                  <div
                    key={val}
                    className="group flex items-center justify-between gap-1 px-1.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800/70"
                  >
                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-slate-800 dark:text-slate-200 select-none text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleValor(val)}
                        className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-rose-500 focus:ring-rose-500/20 h-3.5 w-3.5 shrink-0"
                      />
                      <span className="truncate flex-1" title={val}>
                        {val || <span className="italic text-slate-400 dark:text-slate-500">(Vacío)</span>}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => seleccionarSoloEste(val)}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline px-1 shrink-0 cursor-pointer transition-opacity"
                      title="Ver únicamente este valor"
                    >
                      Solo
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-semibold cursor-pointer"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
