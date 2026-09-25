import React from 'react';
import { Calendar, X } from 'lucide-react';

interface DateRangeFilterProps {
  fechaInicio: string;
  fechaFin: string;
  onChangeInicio: (val: string) => void;
  onChangeFin: (val: string) => void;
  onLimpiar?: () => void;
  label?: string;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  fechaInicio,
  fechaFin,
  onChangeInicio,
  onChangeFin,
  onLimpiar,
  label = 'Filtrar por Rango de Fechas',
}) => {
  const tieneFiltro = Boolean(fechaInicio || fechaFin);

  const presets = [
    {
      etiqueta: 'Mes Actual (Septiembre)',
      esActivo: fechaInicio === '2026-09-01' && fechaFin === '2026-09-30',
      aplicar: () => {
        onChangeInicio('2026-09-01');
        onChangeFin('2026-09-30');
      },
    },
    {
      etiqueta: 'Ver Todo (Histórico)',
      esActivo: !fechaInicio && !fechaFin,
      aplicar: () => {
        onChangeInicio('');
        onChangeFin('');
        if (onLimpiar) onLimpiar();
      },
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 border border-slate-800 p-2 rounded-xl text-xs">
      <div className="flex items-center gap-1.5 text-slate-400 font-medium mr-1">
        <Calendar className="h-3.5 w-3.5 text-rose-400" />
        <span className="hidden sm:inline">{label}:</span>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-[10px] text-slate-500 uppercase">Desde</span>
        <input
          type="date"
          value={fechaInicio}
          onChange={(e) => onChangeInicio(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-rose-500"
        />
      </div>

      <div className="flex items-center gap-1">
        <span className="text-[10px] text-slate-500 uppercase">Hasta</span>
        <input
          type="date"
          value={fechaFin}
          onChange={(e) => onChangeFin(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-rose-500"
        />
      </div>

      {/* Botones de presets rápidos */}
      <div className="flex flex-wrap items-center gap-1 ml-1 border-l border-slate-800 pl-2">
        {presets.map((p) => (
          <button
            key={p.etiqueta}
            type="button"
            onClick={p.aplicar}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              p.esActivo
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {tieneFiltro && onLimpiar && (
        <button
          type="button"
          onClick={onLimpiar}
          className="flex items-center gap-1 text-[11px] px-2 py-1 bg-rose-950/60 border border-rose-800/60 rounded text-rose-300 hover:bg-rose-900/60 transition-all ml-auto sm:ml-0"
          title="Quitar filtro de fechas"
        >
          <X className="h-3 w-3" />
          <span>Restablecer</span>
        </button>
      )}
    </div>
  );
};
