import { Cita, Llamada, SupabaseConfig } from '../types';
import { CITAS_INICIALES, LLAMADAS_INICIALES } from '../data/mockData';

const CONFIG_STORAGE_KEY = 'kpi_citas_supabase_config';

export const DEFAULT_SUPABASE_CONFIG: SupabaseConfig = {
  supabase_url: '',
  supabase_anon_key: '',
  edge_function_name: 'sincronizar-datos',
  almacenar_en_bd: true,
  frecuencia_sync_minutos: 15,
  ultima_sincronizacion: new Date().toISOString(),
  conectado: false,
};

export function obtenerConfiguracionSupabase(): SupabaseConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SUPABASE_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Error al leer configuración de Supabase:', e);
  }
  return DEFAULT_SUPABASE_CONFIG;
}

export function guardarConfiguracionSupabase(config: SupabaseConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Error al guardar configuración de Supabase:', e);
  }
}

/**
 * Consulta resiliente que intenta leer una lista de posibles nombres de tabla
 */
async function fetchPrimerTablaDisponible(
  baseUrl: string,
  headers: Record<string, string>,
  posiblesTablas: string[],
  selectQuery: string,
  orderQuery: string = '',
  limit: number = 250,
  extraFilter: string = ''
): Promise<{ tablaEncontrada: string | null; data: any[] }> {
  for (const nombreTabla of posiblesTablas) {
    try {
      const orderParam = orderQuery ? `&order=${orderQuery}` : '';
      const filterParam = extraFilter ? `&${extraFilter}` : '';
      const url = `${baseUrl}/rest/v1/${nombreTabla}?select=${selectQuery}${filterParam}${orderParam}&limit=${limit}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return { tablaEncontrada: nombreTabla, data };
        }
      }
    } catch (_) {
      // Intentar siguiente candidato
    }
  }
  return { tablaEncontrada: null, data: [] };
}

async function verificarTablaMinima(
  baseUrl: string,
  headers: Record<string, string>,
  posiblesTablas: string[]
): Promise<{ tablaEncontrada: string | null; totalEstimado: number }> {
  for (const nombreTabla of posiblesTablas) {
    try {
      const url = `${baseUrl}/rest/v1/${nombreTabla}?select=id&limit=1`;
      const res = await fetch(url, {
        headers: { ...headers, Prefer: 'count=estimated' },
      });
      if (res.ok) {
        const cr = res.headers.get('content-range') || '';
        const totalMatch = cr.match(/\/(\d+)$/);
        const totalEstimado = totalMatch ? parseInt(totalMatch[1], 10) : 0;
        return { tablaEncontrada: nombreTabla, totalEstimado };
      }
    } catch (_) {
      // Intentar siguiente candidato
    }
  }
  return { tablaEncontrada: null, totalEstimado: 0 };
}

/**
 * Consulta dinámica y multicanal de todas las tablas de Supabase con selección estricta de columnas
 * y ventana de fechas para minimizar consumo de ancho de banda (egress).
 */
export async function consultarTablasSupabase(
  url: string,
  anonKey: string
): Promise<{
  citas: Cita[];
  llamadas: Llamada[];
  conteos: Record<string, number>;
  tablasDetectadas: Record<string, string | null>;
  catalogoAsesores: Record<string, string>;
}> {
  const baseUrl = url.replace(/\/$/, '');
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const hace60Dias = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // 1. Cargar solo columnas necesarias y ventanas de tiempo acotadas (sin SELECT *)
  const [
    catalogoRes,
    leadsCalificadosRes,
    leadsNoCalificadosRes,
    pbxRes,
    celularRes,
    whatsappRes,
    teamsRes,
  ] = await Promise.all([
    fetchPrimerTablaDisponible(
      baseUrl,
      headers,
      ['catalogo', 'catalogo_asesores', 'catalogo_vendedores', 'catalogo_usuarios', 'extensiones_asesores'],
      'id,pais,nombre_ejecutivo,usuario,extension,celular',
      'id.asc',
      200
    ),
    fetchPrimerTablaDisponible(
      baseUrl,
      headers,
      ['leads', 'leads_calificados', 'citas_agendadas', 'prospektia_leads'],
      'id,codigo_prospecto,nombre_prospecto,telefono,fecha_agendada,hora_agendada,tipo_reunion,pais,asesor_nombre,created_at',
      'created_at.desc.nullslast',
      250,
      `created_at=gte.${hace60Dias}T00:00:00Z`
    ),
    fetchPrimerTablaDisponible(
      baseUrl,
      headers,
      ['leads_no_calificados', 'prospektia_no_calificados', 'leads_descartados'],
      'id,client_id,client_name,advisor_name,telefono,created_at,created_at_sv',
      'created_at.desc.nullslast',
      250,
      `created_at=gte.${hace60Dias}T00:00:00Z`
    ),
    fetchPrimerTablaDisponible(
      baseUrl,
      headers,
      ['llamadas_pbx', 'calls_pbx', 'historial_pbx', 'pbx_calls'],
      'id,uniqueid,nombre,extension,destino,duracion_segundos,duracion_minutos,duracion_hh_mm_ss,estado,fecha_hora,fecha,audio_url,grabacion_url',
      'fecha_hora.desc.nullslast',
      250,
      `fecha=gte.${hace60Dias}`
    ),
    fetchPrimerTablaDisponible(
      baseUrl,
      headers,
      ['llamadas_celular', 'historial_celular', 'celular_llamadas', 'llamadas_movil'],
      'id,fecha,hora,destino,duracion,tipo,linea,usuario,operador',
      'fecha.desc.nullslast',
      250,
      `fecha=gte.${hace60Dias}`
    ),
    fetchPrimerTablaDisponible(
      baseUrl,
      headers,
      ['llamadas_whatsapp', 'whatsapp_calls', 'mensajes_whatsapp', 'whatsapp_logs'],
      'id,ejecutivo_id,numero_ejecutivo,numero_cliente,fecha_llamada,duracion_segundos,estado,direccion',
      'fecha_llamada.desc.nullslast',
      250,
      `fecha_llamada=gte.${hace60Dias}T00:00:00Z`
    ),
    fetchPrimerTablaDisponible(
      baseUrl,
      headers,
      ['llamadas_teams', 'reuniones_teams', 'teams_meetings', 'teams_calls'],
      'id,codigo_prospecto,pais,ejecutivo,cliente,fecha_reunion,hora_reunion,evidencia_url,estado_teams',
      'fecha_reunion.desc.nullslast',
      200
    ),
  ]);

  // Mapa de Catálogo de Asesores (ej: extensión -> Nombre o celular -> Nombre)
  const mapaCatalogo: Record<string, string> = {};
  if (catalogoRes.data.length > 0) {
    catalogoRes.data.forEach((item: any) => {
      const nombre = item.nombre || item.asesor_nombre || item.advisor_name || item.usuario || '';
      const ext = item.extension || item.ext || item.linea || '';
      const tel = item.telefono || item.celular || '';
      if (ext && nombre) mapaCatalogo[String(ext).trim()] = nombre;
      if (tel && nombre) mapaCatalogo[String(tel).replace(/[^0-9]/g, '')] = nombre;
    });
  }

  // Helper para resolver el nombre del asesor
  const resolverAsesor = (idOExt: string, fallback: string = 'Asesor General'): string => {
    if (!idOExt) return fallback;
    const clean = String(idOExt).trim();
    if (mapaCatalogo[clean]) return mapaCatalogo[clean];
    const cleanNum = clean.replace(/[^0-9]/g, '');
    if (mapaCatalogo[cleanNum]) return mapaCatalogo[cleanNum];
    return fallback;
  };

  // Mapear Leads Calificados y No Calificados a Citas
  const citas: Cita[] = [];

  // A. Leads Calificados
  leadsCalificadosRes.data.forEach((lead: any, idx: number) => {
    const fechaHora =
      lead.fecha_agendada && lead.hora_agendada
        ? `${lead.fecha_agendada}T${lead.hora_agendada}:00`
        : lead.created_at || new Date().toISOString();

    const asesorNombre =
      lead.asesor_nombre ||
      lead.advisor_name ||
      resolverAsesor(lead.extension || '', 'Asesor General');

    citas.push({
      id: String(lead.codigo_prospecto || lead.id || `lead-${idx}`),
      prospecto_nombre: lead.nombre || lead.prospecto || 'Prospecto sin nombre',
      prospecto_telefono: String(lead.telefono || lead.phone || '').trim(),
      prospecto_email: lead.email || '',
      vendedor_id: asesorNombre.toLowerCase().replace(/\s+/g, '_'),
      vendedor_nombre: asesorNombre,
      fecha_hora_programada: fechaHora,
      estado_cita: 'programada',
      fuente: 'Supabase',
      tipo_reunion: (lead.tipo_reunion as any) || 'Demostración',
      notas: `País: ${lead.pais || 'SV'} | Origen: ${leadsCalificadosRes.tablaEncontrada || 'leads'}`,
    });
  });

  // B. Leads No Calificados (para control de auditoría de descartes)
  leadsNoCalificadosRes.data.forEach((lead: any, idx: number) => {
    const fechaHora = lead.created_at || lead.created_at_sv || new Date().toISOString();
    const asesor = lead.advisor_name || lead.asesor_nombre || 'Asesor Asignado';

    citas.push({
      id: String(lead.client_id || `no-calif-${idx}`),
      prospecto_nombre: lead.client_name || lead.nombre || 'Lead No Calificado',
      prospecto_telefono: String(lead.telefono || '').trim(),
      prospecto_email: '',
      vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
      vendedor_nombre: asesor,
      fecha_hora_programada: fechaHora,
      estado_cita: 'no_show',
      fuente: 'Supabase',
      tipo_reunion: 'Discovery Call',
      notas: `Lead No Calificado | Creado: ${lead.created_at_sv || lead.created_at || ''}`,
    });
  });

  // Mapear todas las llamadas (PBX, Celular, WhatsApp, Teams)
  const llamadas: Llamada[] = [];

  // 1. PBX
  pbxRes.data.forEach((call: any, idx: number) => {
    const durSec =
      Number(call.duracion_segundos || 0) ||
      (Number(call.duracion_minutos || 0) * 60) ||
      0;
    const fechaInicio =
      call.fecha_hora ||
      (call.fecha ? `${call.fecha}T${call.hora || '00:00:00'}` : new Date().toISOString());

    const ext = String(call.extension || call.usuario || '').trim();
    const asesorNombre =
      call.nombre ||
      resolverAsesor(ext, ext ? `Extensión ${ext}` : 'Línea PBX');

    llamadas.push({
      id: String(call.uniqueid || call.id || `pbx-${idx}`),
      vendedor_id: `ext_${ext || 'pbx'}`,
      vendedor_nombre: asesorNombre,
      telefono_marcado: String(call.destino || call.telefono || '').trim(),
      prospecto_nombre: call.nombre || undefined,
      fecha_hora_inicio: fechaInicio,
      fecha_hora_fin: fechaInicio,
      duracion_segundos: durSec,
      resultado:
        (call.estado?.toLowerCase() === 'answered' || durSec > 30)
          ? 'contestada'
          : 'no_contesta',
      proveedor: 'VoIP',
      grabacion_url: call.audio_url || call.grabacion_url || undefined,
      notas_llamada: `[PBX] Ext: ${ext || 'N/D'} | Estado: ${call.estado || 'N/D'} | Dur: ${call.duracion_hh_mm_ss || durSec + 's'}`,
    });
  });

  // 2. Celular
  celularRes.data.forEach((cel: any, idx: number) => {
    const durSec = Number(cel.duracion || 0);
    const fechaInicio =
      cel.fecha && cel.hora ? `${cel.fecha}T${cel.hora}` : new Date().toISOString();

    const asesorNombre = cel.usuario || resolverAsesor(cel.linea || '', `Línea Móvil ${cel.linea || ''}`);

    llamadas.push({
      id: String(cel.id || `cel-${idx}`),
      vendedor_id: asesorNombre.toLowerCase().replace(/\s+/g, '_'),
      vendedor_nombre: asesorNombre,
      telefono_marcado: String(cel.destino || '').trim(),
      fecha_hora_inicio: fechaInicio,
      fecha_hora_fin: fechaInicio,
      duracion_segundos: durSec,
      resultado: durSec > 15 ? 'contestada' : 'no_contesta',
      proveedor: 'Twilio',
      notas_llamada: `[Celular] Operador: ${cel.operador || 'N/D'} | Línea: ${cel.linea || 'N/D'} | Tipo: ${cel.tipo || 'Saliente'}`,
    });
  });

  // 3. WhatsApp (Llamadas o interacción)
  whatsappRes.data.forEach((wa: any, idx: number) => {
    const durSec = Number(wa.duracion || wa.duracion_segundos || 45);
    const fechaInicio = wa.fecha_hora || wa.created_at || new Date().toISOString();
    const asesor = wa.asesor_nombre || wa.usuario || resolverAsesor(wa.linea || '', 'Asesor WhatsApp');

    llamadas.push({
      id: String(wa.id || `wa-${idx}`),
      vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
      vendedor_nombre: asesor,
      telefono_marcado: String(wa.telefono || wa.destino || '').trim(),
      fecha_hora_inicio: fechaInicio,
      fecha_hora_fin: fechaInicio,
      duracion_segundos: durSec,
      resultado: 'contestada',
      proveedor: 'Vapi',
      notas_llamada: `[WhatsApp] Estado: ${wa.estado || 'Completada'} | Conversación WhatsApp`,
    });
  });

  // 4. Teams (Reuniones / Llamadas)
  teamsRes.data.forEach((tm: any, idx: number) => {
    const durSec = Number(tm.duracion_segundos || tm.duracion || 1800);
    const fechaInicio = tm.fecha_hora_inicio || tm.fecha_hora || tm.created_at || new Date().toISOString();
    const asesor = tm.organizador || tm.asesor_nombre || 'Asesor Teams';

    llamadas.push({
      id: String(tm.id || `tm-${idx}`),
      vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
      vendedor_nombre: asesor,
      telefono_marcado: String(tm.telefono || tm.participante || '').trim(),
      fecha_hora_inicio: fechaInicio,
      fecha_hora_fin: fechaInicio,
      duracion_segundos: durSec,
      resultado: 'contestada',
      proveedor: 'RingCentral',
      notas_llamada: `[Teams] Reunión virtual MS Teams | Duración: ${Math.round(durSec / 60)} min`,
    });
  });

  return {
    citas,
    llamadas,
    conteos: {
      leads_calificados: leadsCalificadosRes.data.length,
      leads_no_calificados: leadsNoCalificadosRes.data.length,
      llamadas_pbx: pbxRes.data.length,
      llamadas_celular: celularRes.data.length,
      llamadas_whatsapp: whatsappRes.data.length,
      reuniones_teams: teamsRes.data.length,
      catalogo_asesores: catalogoRes.data.length,
    },
    tablasDetectadas: {
      leads: leadsCalificadosRes.tablaEncontrada,
      leads_no_calificados: leadsNoCalificadosRes.tablaEncontrada,
      llamadas_pbx: pbxRes.tablaEncontrada,
      llamadas_celular: celularRes.tablaEncontrada,
      llamadas_whatsapp: whatsappRes.tablaEncontrada,
      llamadas_teams: teamsRes.tablaEncontrada,
      catalogo_asesores: catalogoRes.tablaEncontrada,
    },
    catalogoAsesores: mapaCatalogo,
  };
}

/**
 * Prueba la conectividad con Supabase y detecta qué tablas existen
 */
export async function probarConexionSupabase(
  url: string,
  anonKey: string,
  edgeFunctionName: string
): Promise<{ exito: boolean; mensaje: string; detalles?: any }> {
  if (!url) {
    return {
      exito: false,
      mensaje: 'La URL del proyecto Supabase es requerida (ej: https://xyz.supabase.co).',
    };
  }

  const baseUrl = url.replace(/\/$/, '');
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  try {
    // Prueba ligera sin descargar miles de filas (solo select=id&limit=1 + count=estimated)
    const [cat, leads, nc, pbx, cel, wa, teams] = await Promise.all([
      verificarTablaMinima(baseUrl, headers, ['catalogo', 'catalogo_asesores']),
      verificarTablaMinima(baseUrl, headers, ['leads', 'leads_calificados']),
      verificarTablaMinima(baseUrl, headers, ['leads_no_calificados']),
      verificarTablaMinima(baseUrl, headers, ['llamadas_pbx', 'calls_pbx']),
      verificarTablaMinima(baseUrl, headers, ['llamadas_celular']),
      verificarTablaMinima(baseUrl, headers, ['llamadas_whatsapp']),
      verificarTablaMinima(baseUrl, headers, ['llamadas_teams', 'reuniones_teams']),
    ]);

    const tablas = {
      catalogo: cat,
      leads,
      leads_no_calificados: nc,
      llamadas_pbx: pbx,
      llamadas_celular: cel,
      llamadas_whatsapp: wa,
      llamadas_teams: teams,
    };

    const encontradas = Object.entries(tablas)
      .filter(([_, t]) => t.tablaEncontrada !== null)
      .map(([tipo, t]) => `${tipo}: ${t.tablaEncontrada} (~${t.totalEstimado})`);

    const conteos = Object.fromEntries(
      Object.entries(tablas).map(([k, v]) => [k, v.totalEstimado])
    );

    if (encontradas.length > 0) {
      return {
        exito: true,
        mensaje: `¡Conexión exitosa a Supabase! Se detectaron tablas activas: ${encontradas.join(', ')}.`,
        detalles: conteos,
      };
    } else {
      return {
        exito: true,
        mensaje: 'Conexión a Supabase lograda, pero las tablas aún no tienen políticas RLS activas o están vacías. Ejecuta el script SQL en Supabase para conceder SELECT al rol anon.',
      };
    }
  } catch (err: any) {
    return {
      exito: false,
      mensaje: `No se pudo conectar a Supabase: ${err.message || 'Error de red o CORS.'}`,
    };
  }
}

/**
 * Sincroniza datos de citas y llamadas desde Supabase (Lectura directa + Fallback Edge)
 */
export async function sincronizarDatosDesdeSupabase(
  config: SupabaseConfig
): Promise<{
  citas: Cita[];
  llamadas: Llamada[];
  origen: 'supabase_edge_function' | 'supabase_db_direct' | 'demo_almacenada';
  tiempo_ejecucion_ms: number;
  detalles_sync?: any;
}> {
  const inicio = performance.now();

  if (config.supabase_url && config.supabase_anon_key) {
    try {
      const res = await consultarTablasSupabase(config.supabase_url, config.supabase_anon_key);
      if (res.citas.length > 0 || res.llamadas.length > 0) {
        const fin = performance.now();
        return {
          citas: res.citas.length > 0 ? res.citas : CITAS_INICIALES,
          llamadas: res.llamadas.length > 0 ? res.llamadas : LLAMADAS_INICIALES,
          origen: 'supabase_db_direct',
          tiempo_ejecucion_ms: Math.round(fin - inicio),
          detalles_sync: res.conteos,
        };
      }
    } catch (e) {
      console.warn('Lectura de tablas Supabase arrojó error:', e);
    }
  }

  // Demo fallback
  await new Promise((resolve) => setTimeout(resolve, 350));
  const fin = performance.now();

  return {
    citas: [...CITAS_INICIALES],
    llamadas: [...LLAMADAS_INICIALES],
    origen: 'demo_almacenada',
    tiempo_ejecucion_ms: Math.round(fin - inicio),
  };
}
