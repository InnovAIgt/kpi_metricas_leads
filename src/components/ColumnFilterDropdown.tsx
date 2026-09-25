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

  const toggleValor = (val: string) => {
    if (seleccionados.includes(val)) {
      onCambiarSeleccion(
        clave,
        seleccionados.filter((s) => s !== val)
      );
    } else {
      onCambiarSeleccion(clave, [...seleccionados, val]);
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
      <span className="font-semibold text-slate-300 select-none">{titulo}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto(!abierto);
        }}
        title={`Filtrar por ${titulo}`}
        className={`p-1 rounded transition-all hover:bg-slate-700/60 ${
          estaActivo
            ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/50'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Filter className={`h-3 w-3 ${estaActivo ? 'text-rose-400 fill-rose-400/20' : ''}`} />
      </button>

      {/* Popover desplegable con buscador dinámico y checklist */}
      {abierto && (
        <div
          className={`absolute top-full mt-1.5 z-50 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2.5 text-xs font-normal normal-case tracking-normal ${
            alineacion === 'right' ? 'right-0' : 'left-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header del Filtro */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="font-bold text-white text-[11px] truncate">
              Filtro: {titulo}
            </span>
            {estaActivo && (
              <button
                type="button"
                onClick={() => onCambiarSeleccion(clave, [])}
                className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-0.5"
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
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              autoFocus
            />
          </div>

          {/* Acciones Rápidas */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-2 px-1">
            <button
              type="button"
              onClick={seleccionarTodos}
              className="hover:text-white underline underline-offset-2"
            >
              Seleccionar todos
            </button>
            <button
              type="button"
              onClick={deseleccionarTodos}
              className="hover:text-white underline underline-offset-2"
            >
              Deseleccionar todos
            </button>
          </div>

          {/* Checklist de Valores */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1 divide-y divide-slate-800/40">
            {valoresFiltrados.length === 0 ? (
              <div className="py-3 text-center text-slate-500 text-[11px]">
                Sin coincidencias
              </div>
            ) : (
              valoresFiltrados.map((val) => {
                const checked =
                  seleccionados.length === 0 || seleccionados.includes(val);
                return (
                  <label
                    key={val}
                    className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-800/70 cursor-pointer text-slate-200 select-none text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleValor(val)}
                      className="rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-rose-500/20 h-3.5 w-3.5"
                    />
                    <span className="truncate flex-1" title={val}>
                      {val || <span className="italic text-slate-500">(Vacío)</span>}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <div className="pt-2 mt-2 border-t border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-semibold"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
