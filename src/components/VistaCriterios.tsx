import React, { useState, useEffect } from 'react';
import {
  Info,
  Clock,
  Calendar,
  CheckCircle2,
  ShieldCheck,
  Database,
  RotateCcw,
} from 'lucide-react';
import { ParametrosAuditoria } from '../types';
import { PARAMETROS_DEFAULT } from '../data/mockData';

interface VistaCriteriosProps {
  parametros: ParametrosAuditoria;
  onActualizarParametros: (nuevos: ParametrosAuditoria) => void;
}

export const VistaCriterios: React.FC<VistaCriteriosProps> = ({
  parametros,
  onActualizarParametros,
}) => {
  const [form, setForm] = useState<ParametrosAuditoria>({ ...parametros });
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    setForm({ ...parametros });
  }, [parametros]);

  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    onActualizarParametros(form);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 3000);
  };

  const handleRestablecerDefaults = () => {
    const defaults = { ...PARAMETROS_DEFAULT };
    setForm(defaults);
    onActualizarParametros(defaults);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs dark:shadow-none">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 dark:bg-rose-950/60 dark:border-rose-700/60 dark:text-rose-400">
            <Info className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Criterios de Auditoría y Reglas de Negocio
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Parámetros utilizados por el motor de cruce para auditar el cumplimiento de llamadas contra las citas agendadas en Leads.
            </p>
          </div>
        </div>
      </div>

      {/* Tarjetas de Criterios */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs dark:shadow-none">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm mb-2">
            <Clock className="h-4 w-4" />
            Tolerancia de Horario (OK)
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed tabular-nums">
            Se considera <strong>A Tiempo (OK en verde)</strong> cualquier llamada efectuada justo a la hora pactada o dentro de un margen de{' '}
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              {form.tolerancia_anticipacion_minutos} minutos antes
            </span>{' '}
            y{' '}
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              {form.tolerancia_retraso_a_tiempo_minutos} minutos después
            </span>{' '}
            de la hora establecida.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs dark:shadow-none">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-sm mb-2">
            <Calendar className="h-4 w-4" />
            Jornada Laboral
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed tabular-nums">
            Horario oficial de atención:{' '}
            <strong>
              {form.horario_laboral_inicio} a {form.horario_laboral_fin}
            </strong>
            , de <span className="text-amber-600 dark:text-amber-400 font-bold">Lunes a Viernes</span>.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs dark:shadow-none">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm mb-2">
            <ShieldCheck className="h-4 w-4" />
            Cruce Multicanal
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            El motor busca el teléfono del prospecto en <strong>PBX (getCalls2)</strong>,{' '}
            <strong>Celular</strong>, <strong>WhatsApp</strong> y reuniones de{' '}
            <strong>Teams</strong>.
          </p>
        </div>
      </div>

      {/* Formulario de Configuración de Criterios */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
            Ajuste Fino de Parámetros
          </h3>
          <button
            type="button"
            onClick={handleRestablecerDefaults}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Restablecer Predeterminados (15 / 15 / 30)</span>
          </button>
        </div>

        <form onSubmit={handleGuardar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tolerancia de Anticipación (minutos antes)
              </label>
              <input
                type="number"
                min="0"
                max="120"
                value={form.tolerancia_anticipacion_minutos}
                onChange={(e) =>
                  setForm({ ...form, tolerancia_anticipacion_minutos: Number(e.target.value) })
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white tabular-nums focus:outline-none focus:border-rose-500"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Por defecto: 15 minutos antes de la cita
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tolerancia de Retraso A Tiempo (minutos después)
              </label>
              <input
                type="number"
                min="0"
                max="120"
                value={form.tolerancia_retraso_a_tiempo_minutos}
                onChange={(e) =>
                  setForm({ ...form, tolerancia_retraso_a_tiempo_minutos: Number(e.target.value) })
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white tabular-nums focus:outline-none focus:border-rose-500"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Por defecto: 15 minutos después de la cita
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Umbral de Retraso Grave (minutos después)
              </label>
              <input
                type="number"
                min="1"
                max="240"
                value={form.umbral_retraso_grave_minutos}
                onChange={(e) =>
                  setForm({ ...form, umbral_retraso_grave_minutos: Number(e.target.value) })
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white tabular-nums focus:outline-none focus:border-rose-500"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Por defecto: 30 minutos (entre {form.tolerancia_retraso_a_tiempo_minutos + 1}m y {form.umbral_retraso_grave_minutos}m es Tarde Leve)
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Duración Mínima Efectiva (segundos)
              </label>
              <input
                type="number"
                min="0"
                value={form.duracion_minima_efectiva_segundos}
                onChange={(e) =>
                  setForm({ ...form, duracion_minima_efectiva_segundos: Number(e.target.value) })
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white tabular-nums focus:outline-none focus:border-rose-500"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Mínimo para considerar contacto efectivo (por defecto: 45 seg)
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Hora Inicio Jornada Laboral
              </label>
              <input
                type="time"
                value={form.horario_laboral_inicio}
                onChange={(e) =>
                  setForm({ ...form, horario_laboral_inicio: e.target.value })
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white tabular-nums focus:outline-none focus:border-rose-500"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400">8:00 AM</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Hora Fin Jornada Laboral
              </label>
              <input
                type="time"
                value={form.horario_laboral_fin}
                onChange={(e) =>
                  setForm({ ...form, horario_laboral_fin: e.target.value })
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white tabular-nums focus:outline-none focus:border-rose-500"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400">6:00 PM (18:00)</span>
            </div>

            <div className="sm:col-span-2 flex items-center pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.considerar_buzon_como_fallido}
                  onChange={(e) =>
                    setForm({ ...form, considerar_buzon_como_fallido: e.target.checked })
                  }
                  className="rounded border-slate-300 dark:border-slate-700 text-rose-600 focus:ring-rose-500"
                />
                Considerar buzón de voz como llamada fallida
              </label>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
            {guardado ? (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 className="h-4 w-4" /> Criterios actualizados con éxito
              </span>
            ) : (
              <span />
            )}

            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
            >
              Guardar Criterios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
