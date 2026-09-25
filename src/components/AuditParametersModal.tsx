import React, { useState } from 'react';
import { X, Sliders, Check, RotateCcw, AlertCircle } from 'lucide-react';
import { ParametrosAuditoria } from '../types';
import { PARAMETROS_DEFAULT } from '../data/mockData';

interface AuditParametersModalProps {
  abierto: boolean;
  onCerrar: () => void;
  parametros: ParametrosAuditoria;
  onGuardar: (nuevosParametros: ParametrosAuditoria) => void;
}

export const AuditParametersModal: React.FC<AuditParametersModalProps> = ({
  abierto,
  onCerrar,
  parametros,
  onGuardar,
}) => {
  const [form, setForm] = useState<ParametrosAuditoria>({ ...parametros });

  if (!abierto) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGuardar(form);
    onCerrar();
  };

  const handleReset = () => {
    setForm({ ...PARAMETROS_DEFAULT });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Parámetros de Auditoría de Llamadas</h3>
              <p className="text-xs text-slate-400">
                Ajusta las tolerancias que determinan si el vendedor llamó a tiempo o no
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Tolerancia a tiempo */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
            <label className="font-semibold text-slate-200 block">
              Tolerancia Máxima de Retraso "A Tiempo" (minutos)
            </label>
            <p className="text-[11px] text-slate-400">
              Si la cita es a las 10:00 y el vendedor llama a las 10:03, sigue considerándose puntual.
            </p>
            <input
              type="number"
              min="0"
              max="30"
              value={form.tolerancia_retraso_a_tiempo_minutos}
              onChange={(e) =>
                setForm({
                  ...form,
                  tolerancia_retraso_a_tiempo_minutos: Number(e.target.value),
                })
              }
              className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Tolerancia anticipación */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
            <label className="font-semibold text-slate-200 block">
              Tolerancia de Anticipación Aceptable (minutos antes)
            </label>
            <p className="text-[11px] text-slate-400">
              Margen de llamada previa aceptable antes de la hora acordada (ej. 5 min antes).
            </p>
            <input
              type="number"
              min="0"
              max="30"
              value={form.tolerancia_anticipacion_minutos}
              onChange={(e) =>
                setForm({
                  ...form,
                  tolerancia_anticipacion_minutos: Number(e.target.value),
                })
              }
              className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Umbral retraso grave */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
            <label className="font-semibold text-slate-200 block">
              Umbral de Retraso Grave (minutos)
            </label>
            <p className="text-[11px] text-slate-400">
              Llamadas iniciadas después de este límite se catalogan como infracción severa.
            </p>
            <input
              type="number"
              min="5"
              max="60"
              value={form.umbral_retraso_grave_minutos}
              onChange={(e) =>
                setForm({
                  ...form,
                  umbral_retraso_grave_minutos: Number(e.target.value),
                })
              }
              className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Duración mínima efectiva */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
            <label className="font-semibold text-slate-200 block">
              Duración Mínima Efectiva (segundos)
            </label>
            <p className="text-[11px] text-slate-400">
              Llamadas menores a este umbral (ej. 60s) se marcan como llamada insuficiente o colgada rápida.
            </p>
            <input
              type="number"
              min="10"
              max="600"
              step="10"
              value={form.duracion_minima_efectiva_segundos}
              onChange={(e) =>
                setForm({
                  ...form,
                  duracion_minima_efectiva_segundos: Number(e.target.value),
                })
              }
              className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Checkbox Buzón */}
          <label className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700">
            <input
              type="checkbox"
              checked={form.considerar_buzon_como_fallido}
              onChange={(e) =>
                setForm({ ...form, considerar_buzon_como_fallido: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
            />
            <div>
              <span className="text-white font-semibold block">
                Marcar buzón de voz como llamada no efectiva
              </span>
              <span className="text-slate-400 text-[11px]">
                Aunque el vendedor haya marcado a tiempo, si cayó en contestadora no cuenta como asistencia real.
              </span>
            </div>
          </label>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5 rounded-lg hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Valores por defecto</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCerrar}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Aplicar y Recalcular</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
