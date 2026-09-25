import React from 'react';
import {
  HelpCircle,
  Database,
  Server,
  Zap,
  ShieldCheck,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Layers,
  Cpu,
} from 'lucide-react';

interface ArchitectureAdvisorProps {
  onCerrar?: () => void;
  esVistaCompleta?: boolean;
}

export const ArchitectureAdvisor: React.FC<ArchitectureAdvisorProps> = ({
  onCerrar,
  esVistaCompleta = false,
}) => {
  return (
    <div
      className={`space-y-6 text-slate-200 ${
        esVistaCompleta ? 'max-w-5xl mx-auto' : 'p-2'
      }`}
    >
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2.5 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">
          <Sparkles className="h-4 w-4" />
          <span>Dictamen Técnico & Buenas Prácticas de Ingeniería</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
          ¿Almacenar la Data o Consultar en Vivo? ¿Edge Function o Backend?
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
          Análisis arquitectónico para tu plataforma de cruce de citas vs llamadas de telefonía.
          A continuación tienes el veredicto técnico respaldado por rendimiento, costos y estabilidad.
        </p>
      </div>

      {/* QUESTION 1: Almacenar vs En Vivo */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <Database className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              Pregunta 1: Persistencia
            </span>
            <h3 className="text-lg font-bold text-white">
              ¿Es correcto almacenar la data de citas y llamadas en Supabase o conviene consultarla en vivo a las APIs para ver días anteriores?
            </h3>
          </div>
        </div>

        {/* Verdict Badge */}
        <div className="bg-emerald-950/30 border border-emerald-500/30 p-4 rounded-xl flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <span className="text-xs font-bold text-emerald-300 block">
              VEREDICTO: SÍ, ES 100% CORRECTO Y NECESARIO ALMACENAR LA DATA.
            </span>
            <p className="text-xs text-slate-300 mt-0.5">
              Consultar en vivo a las APIs de telefonía y calendario para ver históricos es un antipatrón en analítica. Aquí te explicamos las 4 razones críticas:
            </p>
          </div>
        </div>

        {/* Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          {/* Why Storing Wins */}
          <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/20 space-y-3">
            <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Por qué SÍ almacenar en Base de Datos (Supabase):
            </h4>
            <ul className="text-xs text-slate-300 space-y-2.5">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span>
                  <strong>Cero riesgo de Rate Limit (HTTP 429):</strong> Las APIs de telefonía (Twilio, CloudTalk, RingCentral) y CRM (HubSpot, Calendly) tienen límites estrictos (ej. 10 a 30 peticiones/seg). Si filtras por 7 o 30 días en vivo, saturas la API y bloqueas la cuenta.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span>
                  <strong>Velocidad Instantánea (15ms vs 12s):</strong> Una consulta SQL indexada en Supabase responde en milisegundos. Hacer peticiones HTTP a 2 o 3 APIs externas y cruzar miles de registros en tiempo real tarda más de 10 segundos por cada cambio de filtro.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span>
                  <strong>Inmutabilidad y Auditoría de Comisiones:</strong> Una llamada ya finalizada no cambia su duración ni hora. Almacenarla te da un registro inalterable para evaluar a los vendedores.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span>
                  <strong>Políticas de retención de las APIs:</strong> Muchos proveedores de telefonía borran los logs de llamadas (CDRs) después de 30 o 60 días a menos que pagues almacenamiento adicional. Si los guardas tú, nunca pierdes tu historial.
                </span>
              </li>
            </ul>
          </div>

          {/* Risks of Live-Only */}
          <div className="bg-slate-950 p-4 rounded-xl border border-rose-500/20 space-y-3">
            <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wide flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              Riesgos de consultar en vivo las APIs cada vez:
            </h4>
            <ul className="text-xs text-slate-300 space-y-2.5">
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>
                  <strong>Costos por consumo de API:</strong> Varias APIs cobran por cada bloque de consultas analíticas o peticiones a endpoints de reportes.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>
                  <strong>Lentitud extrema y caídas del frontend:</strong> Si la API de Calendly o Twilio tiene un retraso o falla temporal, tu dashboard entero se cae o se queda congelado.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>
                  <strong>Imposible calcular rankings históricos acumulados:</strong> Para calcular el % de cumplimiento mensual de 10 vendedores tendrías que paginar miles de llamadas en vivo, lo cual causará timeouts de conexión.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* QUESTION 2: Edge Function vs Backend */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
            <Server className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
              Pregunta 2: Mecanismo de Ingesta
            </span>
            <h3 className="text-lg font-bold text-white">
              ¿Está bien que una Edge Function de Supabase traiga la data o conviene hacerlo en un backend propio?
            </h3>
          </div>
        </div>

        {/* Verdict Badge */}
        <div className="bg-indigo-950/30 border border-indigo-500/30 p-4 rounded-xl flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-indigo-400 shrink-0" />
          <div>
            <span className="text-xs font-bold text-indigo-300 block">
              VEREDICTO: LA EDGE FUNCTION DE SUPABASE ES EXCELENTE PARA LA INGESTA (ETL / WEBHOOKS), Y EL BACKEND/FRONTEND PARA LA VISUALIZACIÓN.
            </span>
            <p className="text-xs text-slate-300 mt-0.5">
              Ambas tecnologías se complementan de manera ideal en una arquitectura por capas:
            </p>
          </div>
        </div>

        {/* Layer diagram */}
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Arquitectura Recomendada en Producción (Flujo de Datos):
          </h4>

          <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            {/* Step 1 */}
            <div className="w-full md:w-1/4 bg-slate-900 border border-slate-800 p-3 rounded-xl text-center">
              <span className="text-[10px] text-indigo-400 font-bold uppercase block">Paso 1: Fuentes</span>
              <p className="font-semibold text-white mt-1">Calendly / CRM & Telefonía</p>
              <p className="text-[11px] text-slate-400 mt-1">Disparan Webhooks o API Polling</p>
            </div>

            <ArrowRight className="h-4 w-4 text-slate-600 hidden md:block shrink-0" />

            {/* Step 2 */}
            <div className="w-full md:w-1/4 bg-indigo-950/40 border border-indigo-500/40 p-3 rounded-xl text-center">
              <span className="text-[10px] text-indigo-300 font-bold uppercase block">Paso 2: Ingesta</span>
              <p className="font-semibold text-white mt-1">Edge Function Supabase</p>
              <p className="text-[11px] text-indigo-200/80 mt-1">
                Limpia teléfonos, valida tokens y almacena en BD
              </p>
            </div>

            <ArrowRight className="h-4 w-4 text-slate-600 hidden md:block shrink-0" />

            {/* Step 3 */}
            <div className="w-full md:w-1/4 bg-slate-900 border border-slate-800 p-3 rounded-xl text-center">
              <span className="text-[10px] text-emerald-400 font-bold uppercase block">Paso 3: Almacén</span>
              <p className="font-semibold text-white mt-1">Supabase PostgreSQL</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Tablas <code className="text-emerald-300">citas</code> y <code className="text-emerald-300">llamadas</code>
              </p>
            </div>

            <ArrowRight className="h-4 w-4 text-slate-600 hidden md:block shrink-0" />

            {/* Step 4 */}
            <div className="w-full md:w-1/4 bg-slate-900 border border-slate-800 p-3 rounded-xl text-center">
              <span className="text-[10px] text-blue-400 font-bold uppercase block">Paso 4: Auditoría</span>
              <p className="font-semibold text-white mt-1">Dashboard React + Tailwind</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Cruce de tolerancias, KPIs y Scorecard en tiempo real
              </p>
            </div>
          </div>
        </div>

        {/* Practical Conclusion */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2">
          <p className="font-semibold text-white">
            💡 Resumen ejecutivo para tu proyecto:
          </p>
          <p>
            1. <strong>Conserva tu Edge Function:</strong> Está perfecta para recibir webhooks de cuando se agenda una cita o termina una llamada, o para ejecutarse cada 15 minutos sincronizando lotes de citas/llamadas hacia Supabase.
          </p>
          <p>
            2. <strong>Almacena la data en Supabase:</strong> De esta manera el usuario abre este dashboard moderno en React y las métricas cargan al instante (&lt;100ms) sin depender de que las APIs externas estén lentas o limiten tus peticiones.
          </p>
          <p>
            3. <strong>Botón Sincronizar Ahora:</strong> Mantén el botón de sincronización manual (que ya implementamos aquí) para que el supervisor pueda forzar una consulta fresca de las últimas horas cuando lo desee.
          </p>
        </div>
      </div>
    </div>
  );
};
