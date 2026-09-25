import React, { useState } from 'react';
import { Info, Clock, Calendar, CheckCircle2, AlertTriangle, ShieldCheck, Database } from 'lucide-react';
import { ParametrosAuditoria } from '../types';

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

  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    onActualizarParametros(form);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-700/60">
            <Info className="h-5 w-5 text-rose-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Criterios de Auditoría y Reglas de Negocio</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Parámetros utilizados por el motor de cruce para auditar el cumplimiento de llamadas contra las citas agendadas en Leads.
            </p>
          </div>
        </div>
      </div>

      {/* Tarjetas de Criterios Fijos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm mb-2">
            <Clock className="h-4 w-4" />
            Tolerancia de Horario
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Se considera <strong>A Tiempo</strong> cualquier llamada efectuada dentro de un margen de{' '}
            <span className="text-rose-400 font-bold">5 minutos antes</span> y{' '}
            <span className="text-rose-400 font-bold">5 minutos después</span> de la hora pactada en el Lead.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-2">
            <Calendar className="h-4 w-4" />
            Jornada Laboral
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Horario oficial de atención: <strong>8:00 AM a 6:00 PM</strong>, de{' '}
            <span className="text-amber-400 font-bold">Lunes a Viernes</span>.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-2">
            <ShieldCheck className="h-4 w-4" />
            Cruce Multicanal
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            El motor busca el teléfono del prospecto en <strong>PBX (getCalls2)</strong>,{' '}
            <strong>Celular</strong>, <strong>WhatsApp</strong> y reuniones de{' '}
            <strong>Teams</strong>.
          </p>
        </div>
      </div>

      {/* Formulario de Configuración de Criterios */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-indigo-400" />
          Ajuste Fino de Parámetros
        </h3>

        <form onSubmit={handleGuardar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Tolerancia de Anticipación (minutos antes)
              </label>
              <input
                type="number"
                min="0"
                max="60"
                value={form.tolerancia_anticipacion_minutos}
                onChange={(e) =>
                  setForm({ ...form, tolerancia_anticipacion_minutos: Number(e.target.value) })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <span className="text-[11px] text-slate-500">Por defecto: 5 minutos</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Tolerancia de Retraso A Tiempo (minutos después)
              </label>
              <input
                type="number"
                min="0"
                max="60"
                value={form.tolerancia_retraso_a_tiempo_minutos}
                onChange={(e) =>
                  setForm({ ...form, tolerancia_retraso_a_tiempo_minutos: Number(e.target.value) })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <span className="text-[11px] text-slate-500">Por defecto: 5 minutos</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Hora Inicio Jornada Laboral
              </label>
              <input
                type="time"
                value={form.horario_laboral_inicio}
                onChange={(e) =>
                  setForm({ ...form, horario_laboral_inicio: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <span className="text-[11px] text-slate-500">8:00 AM</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Hora Fin Jornada Laboral
              </label>
              <input
                type="time"
                value={form.horario_laboral_fin}
                onChange={(e) =>
                  setForm({ ...form, horario_laboral_fin: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <span className="text-[11px] text-slate-500">6:00 PM (18:00)</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Duración Mínima Efectiva (segundos)
              </label>
              <input
                type="number"
                min="10"
                value={form.duracion_minima_efectiva_segundos}
                onChange={(e) =>
                  setForm({ ...form, duracion_minima_efectiva_segundos: Number(e.target.value) })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <span className="text-[11px] text-slate-500">Mínimo para no contar como buzón (45 seg)</span>
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={form.considerar_buzon_como_fallido}
                  onChange={(e) =>
                    setForm({ ...form, considerar_buzon_como_fallido: e.target.checked })
                  }
                  className="rounded border-slate-700 text-rose-600 focus:ring-rose-500"
                />
                Considerar buzón de voz como llamada fallida
              </label>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-800">
            {guardado ? (
              <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 className="h-4 w-4" /> Criterios actualizados con éxito
              </span>
            ) : <span />}

            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-sm transition-all"
            >
              Guardar Criterios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
