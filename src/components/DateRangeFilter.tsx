import React from 'react';
import { Calendar, X } from 'lucide-react';
import { getMesActualInfo, getMesAnteriorInfo } from '../utils/dateHelpers';

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
  const infoActual = getMesActualInfo();
  const infoAnterior = getMesAnteriorInfo();

  const presets = [
    {
      etiqueta: `Mes Actual (${infoActual.nombreMes})`,
      esActivo: fechaInicio === infoActual.inicioMes && fechaFin === infoActual.finMes,
      aplicar: () => {
        onChangeInicio(infoActual.inicioMes);
        onChangeFin(infoActual.finMes);
      },
    },
    {
      etiqueta: `Mes Anterior (${infoAnterior.nombreMes})`,
      esActivo: fechaInicio === infoAnterior.inicioMes && fechaFin === infoAnterior.finMes,
      aplicar: () => {
        onChangeInicio(infoAnterior.inicioMes);
        onChangeFin(infoAnterior.finMes);
      },
    },
    {
      etiqueta: 'Hoy',
      esActivo: fechaInicio === infoActual.hoy && fechaFin === infoActual.hoy,
      aplicar: () => {
        onChangeInicio(infoActual.hoy);
        onChangeFin(infoActual.hoy);
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
    <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-2 rounded-xl text-xs shadow-xs">
      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium mr-1">
        <Calendar className="h-3.5 w-3.5 text-rose-500" />
        <span className="hidden sm:inline">{label}:</span>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-[10px] text-slate-500 uppercase">Desde</span>
        <input
          type="date"
          value={fechaInicio}
          onChange={(e) => onChangeInicio(e.target.value)}
          className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
        />
      </div>

      <div className="flex items-center gap-1">
        <span className="text-[10px] text-slate-500 uppercase">Hasta</span>
        <input
          type="date"
          value={fechaFin}
          onChange={(e) => onChangeFin(e.target.value)}
          className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
        />
      </div>

      {/* Botones de presets rápidos */}
      <div className="flex flex-wrap items-center gap-1 ml-1 border-l border-slate-200 dark:border-slate-800 pl-2">
        {presets.map((p) => (
          <button
            key={p.etiqueta}
            type="button"
            onClick={p.aplicar}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              p.esActivo
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white'
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
          className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 ml-auto cursor-pointer"
        >
          <X className="h-3 w-3" />
          <span>Restablecer</span>
        </button>
      )}
    </div>
  );
};
