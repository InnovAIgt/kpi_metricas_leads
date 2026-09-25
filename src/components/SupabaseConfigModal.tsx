import React, { useState } from 'react';
import {
  X,
  Database,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Key,
  Code,
  Copy,
  Check,
  Table,
  Phone,
  MessageSquare,
  Users,
  Video,
  Play,
  Calendar,
  Layers,
} from 'lucide-react';
import { SupabaseConfig } from '../types';
import { probarConexionSupabase } from '../services/supabaseService';
import { triggerEdgeFunction } from '../services/apiService';
import codigoEdgeFunctionRaw from '../../supabase/functions/sincronizar-datos/index.ts?raw';

interface SupabaseConfigModalProps {
  abierto: boolean;
  onCerrar: () => void;
  config: SupabaseConfig;
  onGuardar: (nuevaConfig: SupabaseConfig) => void;
  onProbarSync?: () => void;
  onDatosActualizados?: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  abierto,
  onCerrar,
  config,
  onGuardar,
  onDatosActualizados,
}) => {
  const [form, setForm] = useState<SupabaseConfig>({
    ...config,
    edge_function_name: config.edge_function_name || 'sincronizar-datos',
  });
  const [probando, setProbando] = useState(false);
  const [sincronizandoEdge, setSincronizandoEdge] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [copiadoEdge, setCopiadoEdge] = useState(false);
  const [tabModal, setTabModal] = useState<'conexion' | 'sql' | 'edge' | 'tablas'>('edge');
  const [resultadoTest, setResultadoTest] = useState<{
    exito: boolean;
    mensaje: string;
    detalles?: any;
  } | null>(null);
  const [resultadoEdge, setResultadoEdge] = useState<{
    exito: boolean;
    mensaje: string;
    datos?: any;
  } | null>(null);

  // Parámetros de sincronización Edge Function
  const [fechaDesde, setFechaDesde] = useState('2026-09-01');
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [paisSync, setPaisSync] = useState<'AMBOS' | 'SV' | 'GT'>('AMBOS');

  if (!abierto) return null;

  const handleTest = async () => {
    setProbando(true);
    setResultadoTest(null);
    try {
      const res = await probarConexionSupabase(
        form.supabase_url,
        form.supabase_anon_key,
        form.edge_function_name
      );
      setResultadoTest(res);
      if (res.exito) {
        setForm((prev) => ({ ...prev, conectado: true }));
      }
    } catch (e: any) {
      setResultadoTest({
        exito: false,
        mensaje: e?.message || 'Error desconocido al probar conexión.',
      });
    } finally {
      setProbando(false);
    }
  };

  const handleEjecutarEdgeManual = async () => {
    setSincronizandoEdge(true);
    setResultadoEdge(null);
    try {
      const payload: any = {
        pbx_desde: fechaDesde,
        pbx_hasta: fechaHasta,
      };
      if (paisSync !== 'AMBOS') {
        payload.pbx_pais = paisSync;
      }

      const res = await triggerEdgeFunction(payload);
      if (res && (res.status === 'success' || res.recibidos)) {
        setResultadoEdge({
          exito: true,
          mensaje: `¡Sincronización exitosa! Se procesaron: ${res.recibidos?.pbx || 0} PBX, ${res.recibidos?.leads || res.recibidos?.leads_deduplicados || 0} Leads, ${res.recibidos?.celular || 0} Celular.`,
          datos: res,
        });
        if (onDatosActualizados) {
          onDatosActualizados();
        }
      } else {
        setResultadoEdge({
          exito: false,
          mensaje: res?.mensaje || res?.message || 'La Edge Function retornó un error o no pudo persistir.',
          datos: res,
        });
      }
    } catch (err: any) {
      setResultadoEdge({
        exito: false,
        mensaje: err?.message || 'Error de red al invocar la Edge Function.',
      });
    } finally {
      setSincronizandoEdge(false);
    }
  };

  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    onGuardar({
      ...form,
      conectado: Boolean(form.supabase_url && form.supabase_anon_key),
    });
    onCerrar();
  };

  const copiarTexto = (texto: string, setFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(texto);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  const sqlCompleto = `-- ==============================================================================
-- 1. CONSULTA DE INSPECCIÓN:
-- Copia y corre esto primero en Supabase SQL Editor para ver el nombre exacto de tus tablas y columnas:
-- ==============================================================================
SELECT 
    table_name, 
    column_name, 
    data_type
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND (
    table_name ILIKE '%lead%' 
    OR table_name ILIKE '%llamada%' 
    OR table_name ILIKE '%call%' 
    OR table_name ILIKE '%pbx%' 
    OR table_name ILIKE '%celular%' 
    OR table_name ILIKE '%what%' 
    OR table_name ILIKE '%team%' 
    OR table_name ILIKE '%catalog%' 
    OR table_name ILIKE '%asesor%' 
    OR table_name ILIKE '%ejecutiv%'
  )
ORDER BY table_name, ordinal_position;


-- ==============================================================================
-- 2. HABILITAR PERMISOS DE LECTURA (RLS) AL ROL ANON:
-- Corre este bloque para que la aplicación web pueda consultar las tablas con tu anon_key:
-- ==============================================================================
DO $$
DECLARE
    tbl text;
    tablas_candidatas text[] := ARRAY[
        'leads',
        'leads_calificados',
        'leads_no_calificados',
        'llamadas_pbx',
        'llamadas_celular',
        'llamadas_whatsapp',
        'mensajes_whatsapp',
        'reuniones_teams',
        'llamadas_teams',
        'catalogo_asesores',
        'catalogo_vendedores',
        'catalogo_usuarios',
        'extensiones_asesores'
    ];
BEGIN
    FOR i IN 1..array_length(tablas_candidatas, 1) LOOP
        tbl := tablas_candidatas[i];
        
        IF EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
            EXECUTE format('DROP POLICY IF EXISTS "Permitir_Lectura_Dashboard_%s" ON public.%I;', tbl, tbl);
            EXECUTE format(
                'CREATE POLICY "Permitir_Lectura_Dashboard_%s" ON public.%I FOR SELECT TO anon, authenticated USING (true);', 
                tbl, tbl
            );
            EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated;', tbl);
            RAISE NOTICE 'Permisos de lectura aplicados a tabla: %', tbl;
        END IF;
    END LOOP;
END $$;`;

  const codigoEdgeFunction = codigoEdgeFunctionRaw;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Conexión y Edge Function Supabase
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  Multicanal PBX, Leads, Celular
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Auditoría y Corrección de sincronizaciones entre PBX Asterisk, Prospektia y Supabase
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

        {/* Tabs de navegación interna */}
        <div className="flex border-b border-slate-800 bg-slate-950/80 px-5 gap-2 text-xs overflow-x-auto">
          <button
            onClick={() => setTabModal('edge')}
            className={`py-3 px-3 font-semibold border-b-2 flex items-center gap-1.5 shrink-0 ${
              tabModal === 'edge'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="h-3.5 w-3.5 text-indigo-400" />
            1. Edge Function Corregida (Fix 10-15 Sep)
          </button>
          <button
            onClick={() => setTabModal('sql')}
            className={`py-3 px-3 font-semibold border-b-2 flex items-center gap-1.5 shrink-0 ${
              tabModal === 'sql'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-cyan-400" />
            2. Script SQL de Permisos
          </button>
          <button
            onClick={() => setTabModal('conexion')}
            className={`py-3 px-3 font-semibold border-b-2 flex items-center gap-1.5 shrink-0 ${
              tabModal === 'conexion'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="h-3.5 w-3.5 text-amber-400" />
            3. Credenciales URL y Keys
          </button>
          <button
            onClick={() => setTabModal('tablas')}
            className={`py-3 px-3 font-semibold border-b-2 flex items-center gap-1.5 shrink-0 ${
              tabModal === 'tablas'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="h-3.5 w-3.5 text-emerald-400" />
            4. Ecosistema de Tablas
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {tabModal === 'edge' && (
            <div className="space-y-4">
              {/* Diagnóstico claro de los problemas identificados */}
              <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 space-y-2">
                <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs">
                  <CheckCircle2 className="h-4 w-4 text-indigo-400" />
                  <span>Diagnóstico y Razones por las que no se sincronizaban esos días:</span>
                </div>
                <ul className="text-[11px] text-slate-300 space-y-1.5 list-disc list-inside leading-relaxed">
                  <li>
                    <strong className="text-white">Ventana de 7 días hacia atrás:</strong> La función anterior calculaba dinámicamente <code className="text-amber-300">dRetro - 7 días</code> si no se enviaba parámetro. Al ejecutarse después del 17 de Septiembre, solo pedía desde el 17 en adelante, omitiendo del 10 al 15. <em>Ahora toma por defecto todo el mes en curso (desde el 1 de septiembre)</em>.
                  </li>
                  <li>
                    <strong className="text-white">Filtro de País Único (solo SV):</strong> La función previa solo pedía <code className="text-amber-300">pais=SV</code> y no incluía las llamadas de Guatemala (<code className="text-amber-300">pais=GT</code>, que contenía 1,727 registros). <em>Ahora consulta en paralelo ambos países (SV y GT)</em>.
                  </li>
                  <li>
                    <strong className="text-white">Conflicto de Duplicados en Leads:</strong> La API de Prospektia enviaba prospectos duplicados en el mismo payload. Postgres abortaba con error <code className="text-rose-400">ON CONFLICT DO UPDATE cannot affect row a second time</code>, rechazando lotes de 200 leads. <em>Ahora se deduplica automáticamente antes del lote</em>.
                  </li>
                  <li>
                    <strong className="text-white">Constraint inexistente en Leads No Calificados:</strong> Intentaba hacer upsert por <code className="text-rose-400">client_id,created_at_sv</code>, constraint que no existe en Supabase. <em>Ahora genera un UUID determinista v4 y hace upsert sobre la clave primaria `id`</em>.
                  </li>
                </ul>
              </div>

              {/* Panel de Ejecución Manual Inmediata */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-white flex items-center gap-2">
                      <Play className="h-4 w-4 text-emerald-400" />
                      Disparar Sincronización Inmediata a Supabase
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Ejecuta la sincronización directa recuperando PBX Asterisk, Prospektia Leads y Celular:
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleEjecutarEdgeManual}
                    disabled={sincronizandoEdge}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${sincronizandoEdge ? 'animate-spin' : ''}`} />
                    <span>{sincronizandoEdge ? 'Sincronizando...' : 'Ejecutar Sincronización Ahora'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold block mb-1">Fecha Desde:</label>
                    <input
                      type="date"
                      value={fechaDesde}
                      onChange={(e) => setFechaDesde(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold block mb-1">Fecha Hasta:</label>
                    <input
                      type="date"
                      value={fechaHasta}
                      onChange={(e) => setFechaHasta(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold block mb-1">País PBX:</label>
                    <select
                      value={paisSync}
                      onChange={(e: any) => setPaisSync(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="AMBOS">Ambos (🇸🇻 SV + 🇬🇹 GT)</option>
                      <option value="SV">Solo El Salvador (SV)</option>
                      <option value="GT">Solo Guatemala (GT)</option>
                    </select>
                  </div>
                </div>

                {/* Feedback de ejecución */}
                {resultadoEdge && (
                  <div
                    className={`p-4 rounded-xl border flex flex-col gap-3 text-xs ${
                      resultadoEdge.exito
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {resultadoEdge.exito ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
                      )}
                      <div>
                        <p className="font-bold text-sm text-white">{resultadoEdge.mensaje}</p>
                        {resultadoEdge.datos?.rango_sincronizado && (
                          <p className="text-[11px] text-slate-300 mt-0.5">
                            Rango: {resultadoEdge.datos.rango_sincronizado.desde} al {resultadoEdge.datos.rango_sincronizado.hasta} • Países: {Array.isArray(resultadoEdge.datos.rango_sincronizado.paises) ? resultadoEdge.datos.rango_sincronizado.paises.join(', ') : resultadoEdge.datos.rango_sincronizado.pais}
                          </p>
                        )}
                      </div>
                    </div>

                    {resultadoEdge.datos?.recibidos && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800">
                        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-medium">Llamadas PBX</span>
                          <span className="text-sm font-bold text-white">
                            {resultadoEdge.datos?.recibidos?.pbx ?? 0}
                          </span>
                        </div>
                        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-medium">Leads Calificados</span>
                          <span className="text-sm font-bold text-amber-300">
                            {resultadoEdge.datos?.recibidos?.leads_deduplicados ?? resultadoEdge.datos?.recibidos?.leads ?? 0}
                          </span>
                        </div>
                        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-medium">Leads No Calificados</span>
                          <span className="text-sm font-bold text-cyan-300">
                            {resultadoEdge.datos?.recibidos?.leads_no_calificados ?? resultadoEdge.datos?.recibidos?.leads_nc ?? 0}
                          </span>
                        </div>
                        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-medium">Llamadas Celular</span>
                          <span className="text-sm font-bold text-emerald-300">
                            {resultadoEdge.datos?.recibidos?.celular ?? 0}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botón copiar código completo */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
                <div>
                  <h4 className="text-white font-bold text-xs flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                    Código Actualizado para Supabase Edge Functions:
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Pégalo en Supabase &gt; Edge Functions &gt; <code className="text-indigo-300">sincronizar-datos</code>:
                  </p>
                </div>
                <button
                  onClick={() => copiarTexto(codigoEdgeFunction, setCopiadoEdge)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20"
                >
                  {copiadoEdge ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiadoEdge ? '¡Código Copiado!' : 'Copiar Código de Edge Function'}</span>
                </button>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-72 shadow-inner">
                <pre>{codigoEdgeFunction}</pre>
              </div>
            </div>
          )}

          {tabModal === 'sql' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-white font-bold text-xs flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Ejecuta esto en Supabase SQL Editor:
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Inspecciona tus columnas y habilita permisos de lectura automáticos para que la app pueda leer los canales:
                  </p>
                </div>
                <button
                  onClick={() => copiarTexto(sqlCompleto, setCopiado)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20"
                >
                  {copiado ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiado ? '¡Copiado al Portapapeles!' : 'Copiar Script SQL Completo'}</span>
                </button>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-80 shadow-inner">
                <pre>{sqlCompleto}</pre>
              </div>
            </div>
          )}

          {tabModal === 'conexion' && (
            <form onSubmit={handleGuardar} className="space-y-4">
              <div className="bg-indigo-500/10 border border-indigo-500/20 p-3.5 rounded-xl text-slate-300 space-y-1">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Database className="h-4 w-4 text-indigo-400" />
                  Conexión Directa con Supabase
                </span>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  Las credenciales del proyecto están configuradas de forma segura. Puedes probar la conectividad y verificar el estado en vivo.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-200 block">
                  Project URL de Supabase
                </label>
                <input
                  type="url"
                  value={form.supabase_url}
                  onChange={(e) => setForm({ ...form, supabase_url: e.target.value })}
                  placeholder="https://xyzabcdefg.supabase.co"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-200 block flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5 text-indigo-400" />
                    Supabase Anon / Service Role Key (JWT)
                  </span>
                  <span className="text-[10px] text-slate-500">Settings &gt; API &gt; Project API keys</span>
                </label>
                <input
                  type="password"
                  value={form.supabase_anon_key}
                  onChange={(e) => setForm({ ...form, supabase_anon_key: e.target.value })}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-200 block">
                  Nombre de la Edge Function
                </label>
                <input
                  type="text"
                  value={form.edge_function_name}
                  onChange={(e) => setForm({ ...form, edge_function_name: e.target.value })}
                  placeholder="sincronizar-datos"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              {resultadoTest && (
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                    resultadoTest.exito
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  }`}
                >
                  {resultadoTest.exito ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-semibold">{resultadoTest.mensaje}</p>
                    {resultadoTest.detalles && (
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">
                        {JSON.stringify(resultadoTest.detalles)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={probando || !form.supabase_url}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium disabled:opacity-40"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${probando ? 'animate-spin' : ''}`} />
                  <span>{probando ? 'Detectando tablas...' : 'Probar Conexión y Detectar Tablas'}</span>
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={onCerrar}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </div>
            </form>
          )}

          {tabModal === 'tablas' && (
            <div className="space-y-3">
              <h4 className="text-white font-bold text-xs">
                Mapeo de Canales y Fuentes que Soporta la Aplicación:
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold">
                    <Table className="h-4 w-4" />
                    <span>Citas y Leads</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Tablas: <code>leads</code>, <code>leads_calificados</code>, <code>citas_agendadas</code>.
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Campos clave: codigo_prospecto, fecha_agendada, hora_agendada, asesor_nombre, telefono.
                  </p>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 text-cyan-400 font-semibold">
                    <Phone className="h-4 w-4" />
                    <span>Telefonía PBX (getCalls2)</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Tablas: <code>llamadas_pbx</code>, <code>calls_pbx</code>.
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Campos: uniqueid, extension, destino, duracion_segundos, estado, fecha_hora, audio_url.
                  </p>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                    <Phone className="h-4 w-4" />
                    <span>Llamadas Celular</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Tablas: <code>llamadas_celular</code>, <code>historial_celular</code>.
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Campos: id, fecha, hora, destino, duracion, usuario, linea, operador.
                  </p>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 text-blue-400 font-semibold">
                    <Video className="h-4 w-4" />
                    <span>Microsoft Teams</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Tablas: <code>llamadas_teams</code>, <code>reuniones_teams</code>.
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Campos: id, codigo_prospecto, cliente, fecha_reunion, hora_reunion, estado_teams, evidencia_url.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
