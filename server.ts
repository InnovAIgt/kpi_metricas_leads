import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Credenciales protegidas en backend
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sbopifiiyezmvsadwkpg.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3BpZmlpeWV6bXZzYWR3a3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzM0OTYsImV4cCI6MjEwMDMwOTQ5Nn0.ZI5y8lroFF529Xr-Otm1fcq6H2lhbh9e3s-WU9O6I7A';

const supabaseHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Prefer: 'return=representation',
};

// ==========================================
// 1. ENDPOINT DE AUTENTICACIÓN (LOGIN)
// Usuario: Gabi | Password: 1234
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { usuario, password } = req.body;
  if (
    (usuario === 'Gabi' || usuario === 'gabi') &&
    password === '1234'
  ) {
    return res.json({
      exito: true,
      token: 'jwt-auth-token-gabi-session-2026',
      usuario: {
        nombre: 'Gabi',
        rol: 'Super Administrador / Auditor',
      },
    });
  }
  return res.status(401).json({
    exito: false,
    mensaje: 'Usuario o contraseña incorrectos.',
  });
});

// Helper para consultar REST de Supabase de manera segura
async function fetchSupabaseTable(endpoint: string) {
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${endpoint}`;
    const response = await fetch(url, { headers: supabaseHeaders });
    if (!response.ok) {
      console.warn(`Supabase ${endpoint} respondió HTTP ${response.status}`);
      return [];
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`Error consultando ${endpoint}:`, err);
    return [];
  }
}

// Helper con paginación automática para no truncar a 1,000 registros
async function fetchSupabaseTablePaginado(
  tabla: string,
  orden: string,
  maxTotal: number = 6000
) {
  let all: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  try {
    while (offset < maxTotal) {
      const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${tabla}?select=*&order=${orden}&offset=${offset}&limit=${pageSize}`;
      const response = await fetch(url, { headers: supabaseHeaders });
      if (!response.ok) {
        console.warn(`Supabase ${tabla} respondió HTTP ${response.status}`);
        break;
      }
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
  } catch (err) {
    console.error(`Error consultando paginado ${tabla}:`, err);
  }
  return all;
}

// Helper de validación estricta de Lead Calificado
function esLeadCalificadoValido(lead: any): boolean {
  if (!lead) return false;

  // 1. Validar fecha_agendada real
  const fAg = lead.fecha_agendada && lead.fecha_agendada !== 'null' ? String(lead.fecha_agendada).trim() : '';
  if (!fAg || fAg.length < 8) return false;

  // 2. Validar tipo_reunion (no debe ser "(sin reunion)", "sin reunion", etc.)
  const tipo = String(lead.tipo_reunion || lead.tipo || '').toLowerCase().trim();
  if (
    tipo.includes('sin reunion') ||
    tipo.includes('sin reunión') ||
    tipo.includes('sin agendar') ||
    tipo.includes('no agendad') ||
    tipo === '(sin reunion)' ||
    tipo === 'sin reunion'
  ) {
    return false;
  }

  // 3. Validar nombre del prospecto / empresa
  const rawNombre = String(
    lead.nombre_prospecto || lead.nombre || lead.cliente || lead.prospecto_nombre || ''
  ).trim();
  if (rawNombre.length < 2) return false;

  // Al menos 2 caracteres alfanuméricos Unicode (descarta emojis puros como "😎")
  const caracteresValidos = rawNombre.match(/[\p{L}\p{N}]/gu) || [];
  if (caracteresValidos.length < 2) return false;

  // Descartar placeholders y apodos informales
  const normalizado = rawNombre.toLowerCase();
  const invalidos = [
    'el amigo',
    'amigo',
    'elamigo',
    'amigo mio',
    'el compa',
    'prueba',
    'test',
    'tester',
    'asdf',
    'qwerty',
    'desconocido',
    'anonimo',
    'anónimo',
    'sin nombre',
    'no nombre',
    'cliente',
    'lead',
  ];
  if (invalidos.includes(normalizado)) return false;

  return true;
}

// ==========================================
// CONFIGURACIÓN Y APIS EXTERNAS EN CALIENTE
// ==========================================
const PBX_HOST = 'https://api.red.com.sv';
const PBX_USER = 'DBOLAINES';
const PBX_PASS = 'Intelfon1234';

let pbxBackendToken: string | null = null;
let pbxBackendTokenExp = 0;

async function getPbxJwtBackend(): Promise<string> {
  if (pbxBackendToken && Date.now() < pbxBackendTokenExp) {
    return pbxBackendToken;
  }
  const r = await fetch(`${PBX_HOST}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: PBX_USER, password: PBX_PASS }),
  });
  if (!r.ok) {
    throw new Error(`PBX login failed HTTP ${r.status}`);
  }
  const data = await r.json();
  const token = data.token || data.jwt || data.access_token;
  if (!token) throw new Error('No token in PBX login');
  pbxBackendToken = token;
  pbxBackendTokenExp = Date.now() + 23 * 3600 * 1000;
  return token;
}

// Generador de ventanas de 7 días (requisito estricto de PBX getCalls2 para no dar timeout)
function generarVentanasPbx(diasAtras = 60): [string, string][] {
  const rangos: [string, string][] = [];
  const hoy = new Date();
  const limite = new Date(hoy.getTime() - diasAtras * 24 * 3600 * 1000);
  let fin = new Date(hoy);

  while (fin > limite) {
    const inicio = new Date(fin.getTime() - 6 * 24 * 3600 * 1000);
    const startObj = inicio < limite ? limite : inicio;
    rangos.push([startObj.toISOString().slice(0, 10), fin.toISOString().slice(0, 10)]);
    fin = new Date(startObj.getTime() - 24 * 3600 * 1000);
  }
  return rangos;
}

// Consulta EN VIVO a PBX (api.red.com.sv) sin tocar Supabase
async function fetchPbxEnCaliente(): Promise<any[]> {
  try {
    const token = await getPbxJwtBackend();
    const ventanas = generarVentanasPbx(60); // 60 días hacia atrás hasta hoy
    const promises: Promise<any[]>[] = [];

    for (const [d, h] of ventanas) {
      for (const pais of ['SV', 'GT']) {
        promises.push(
          fetch(`${PBX_HOST}/pbx/api/v1/getCalls2?desde=${d}&hasta=${h}&pais=${pais}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((res) => {
              if (res && res.info && Array.isArray(res.info)) {
                return res.info.map((c: any) => ({ ...c, pais }));
              }
              return [];
            })
            .catch(() => [])
        );
      }
    }

    const resultados = await Promise.all(promises);
    const llamadasRaw = resultados.flat();

    // Normalizar a formato interno de llamadas PBX y ordenar descendente por fecha_hora
    const llamadasNormalizadas = llamadasRaw.map((c: any) => {
      const ext = c.EXTENSION ? String(c.EXTENSION).trim() : '';
      const durSec = Number(c.DURATION_SEC ?? Math.round(Number(c.DURACION_MINUTOS || 0) * 60));
      const fIso = c.FECHA || (c.SOLO_FECHA ? String(c.SOLO_FECHA).slice(0, 10) + 'T00:00:00.000Z' : new Date().toISOString());
      const pais = (c.pais || 'SV').toUpperCase();
      const y = c.ANIO || (c.FECHA ? new Date(c.FECHA).getUTCFullYear() : 2026);
      const m = String(c.MES || (c.FECHA ? new Date(c.FECHA).getUTCMonth() + 1 : 10)).padStart(2, '0');
      const d = String(c.DIA || (c.FECHA ? new Date(c.FECHA).getUTCDate() : 1)).padStart(2, '0');
      const fn = ext && c.uniqueid ? `Grabacion_Ext_${ext}_${c.uniqueid}.wav` : '';
      const grabacionUrl = fn
        ? (pais === 'GT'
            ? `${PBX_HOST}/pbx/api/v1/rawCalls?pais=GT&anio=${y}&mes=${m}&dia=${d}&archivo=${encodeURIComponent(fn)}`
            : `${PBX_HOST}/pbx/api/v1/getAudio/${y}/${m}/${d}/${fn}`)
        : null;

      return {
        id: c.uniqueid || `pbx_${Date.now()}_${Math.random()}`,
        uniqueid: c.uniqueid,
        nombre: c.NOMBRE,
        extension: ext,
        destino: c.DESTINO ? String(c.DESTINO).trim() : '',
        duracion_segundos: durSec,
        duracion_minutos: Number(c.DURACION_MINUTOS || (durSec / 60).toFixed(2)),
        duracion_hh_mm_ss: c.DURACION_HH_MM_SS,
        estado: c.ESTADO || (durSec > 0 ? 'CONTESTADA' : 'NO CONTESTADA'),
        fecha_hora: fIso,
        fecha: fIso.slice(0, 10),
        hora: fIso.slice(11, 19),
        anio: y,
        mes: Number(m),
        dia: Number(d),
        pais,
        audio_url: grabacionUrl,
        grabacion_url: grabacionUrl,
      };
    });

    llamadasNormalizadas.sort((a: any, b: any) => (b.fecha_hora || '').localeCompare(a.fecha_hora || ''));
    return llamadasNormalizadas;
  } catch (err) {
    console.error('Error obteniendo llamadas PBX en caliente:', err);
    return [];
  }
}

// Consulta EN VIVO a Celular (kpi.red.com.sv) sin tocar Supabase
async function fetchCelularEnCaliente(): Promise<any[]> {
  try {
    const res = await fetch('https://kpi.red.com.sv/api/historial-llamadas-ejecutivos', {
      headers: { 'X-API-KEY': 'mso_papi_2026_7f2b9c4d8e6a1b3f5d7c9e0a2b4c6d8f' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const items = json && Array.isArray(json.data) ? json.data : [];

    const itemsNormalizados = items.map((c: any) => {
      let durSec = 0;
      if (typeof c.duracion === 'string' && c.duracion.includes(':')) {
        const p = c.duracion.split(':').map(Number);
        if (p.length === 3) durSec = p[0] * 3600 + p[1] * 60 + p[2];
        else if (p.length === 2) durSec = p[0] * 60 + p[1];
      } else {
        durSec = Number(c.duracion || 0);
      }
      const f = c.fecha ? String(c.fecha).slice(0, 10) : '';
      const h = c.hora || '00:00:00';
      return {
        id: c.id,
        fecha: f,
        hora: h,
        destino: c.destino ? String(c.destino).trim() : '',
        duracion: durSec,
        duracion_texto: c.duracion,
        tipo: c.tipo || 'Saliente',
        linea: c.linea || '',
        usuario: c.usuario || '',
        operador: c.operador || 'Claro / Tigo',
      };
    });

    itemsNormalizados.sort((a: any, b: any) => `${b.fecha}T${b.hora}`.localeCompare(`${a.fecha}T${a.hora}`));
    return itemsNormalizados;
  } catch (err) {
    console.error('Error obteniendo llamadas Celular en caliente:', err);
    return [];
  }
}

// Cache en memoria para respuestas ultra-rápidas (<5ms)
let cacheDatosCompletos: { data: any; timestamp: number } | null = null;
let syncPromiseEnVuelo: Promise<any> | null = null;
const CACHE_TTL_MS = 30000; // 30 segundos de cache

// ==============================================================================
// 2. ENDPOINT PROXY UNIFICADO DE DATOS (PBX, Celular y Leads EN CALIENTE)
// ==============================================================================
app.get('/api/sync/datos-completos', async (req, res) => {
  const forzar = req.query.forzar === 'true';

  // Si tenemos caché reciente y no se fuerza recarga, responder al instante
  if (!forzar && cacheDatosCompletos && Date.now() - cacheDatosCompletos.timestamp < CACHE_TTL_MS) {
    return res.json(cacheDatosCompletos.data);
  }

  // Si ya hay una consulta en proceso, esperar la misma promesa
  if (syncPromiseEnVuelo) {
    try {
      const data = await syncPromiseEnVuelo;
      return res.json(data);
    } catch (_) {}
  }

  const tInicio = Date.now();
  syncPromiseEnVuelo = (async () => {
    // 1. Obtener primero el Catálogo de Asesores Oficial desde Supabase
    const catalogo = await fetchSupabaseTable('catalogo?select=*&order=id.asc');

    // Construir mapa de búsqueda rápida
    const mapaCatalogo = {
      porExtension: {} as Record<string, any>,
      porUsuario: {} as Record<string, any>,
      porCelular: {} as Record<string, any>,
      porNombre: {} as Record<string, any>,
      todos: catalogo,
    };

    catalogo.forEach((cat: any) => {
      if (cat.extension && cat.extension !== 'null') mapaCatalogo.porExtension[String(cat.extension).trim()] = cat;
      if (cat.usuario && cat.usuario !== 'null') mapaCatalogo.porUsuario[String(cat.usuario).trim().toLowerCase()] = cat;
      if (cat.nombre_ejecutivo) mapaCatalogo.porNombre[String(cat.nombre_ejecutivo).trim().toLowerCase()] = cat;
      if (cat.celular && cat.celular !== 'null') {
        const cleanTel = String(cat.celular).replace(/[^0-9]/g, '').slice(-8);
        if (cleanTel) mapaCatalogo.porCelular[cleanTel] = cat;
      }
    });

    const resolverAsesorBackend = (ident: string, fallback: string) => {
      if (!ident || ident === 'null' || ident === 'undefined') return fallback;
      const idTrim = String(ident).trim();
      const idLower = idTrim.toLowerCase();
      if (mapaCatalogo.porUsuario[idLower]) return mapaCatalogo.porUsuario[idLower].nombre_ejecutivo;
      if (mapaCatalogo.porExtension[idTrim]) return mapaCatalogo.porExtension[idTrim].nombre_ejecutivo;
      if (mapaCatalogo.porNombre[idLower]) return mapaCatalogo.porNombre[idLower].nombre_ejecutivo;
      const cleanDigits = idTrim.replace(/[^0-9]/g, '').slice(-8);
      if (cleanDigits && mapaCatalogo.porCelular[cleanDigits]) return mapaCatalogo.porCelular[cleanDigits].nombre_ejecutivo;
      
      for (const cat of catalogo) {
        if (cat.usuario && idLower.includes(String(cat.usuario).toLowerCase())) return cat.nombre_ejecutivo;
        if (cat.nombre_ejecutivo && idLower.includes(String(cat.nombre_ejecutivo).toLowerCase())) return cat.nombre_ejecutivo;
      }
      return fallback;
    };

    // 2. Consultas: PBX, Celular y Leads 100% EN VIVO de sus APIs externas.
    // Solo WhatsApp, Catálogo y Teams provienen de Supabase.
    const waOffsets = [0, 1000]; // 2,000 llamadas WhatsApp

    const [
      pbxDirecto,
      celDirecto,
      teamsRaw,
      waRaw,
      prospektiaRes,
      prospektiaNcRes,
    ] = await Promise.all([
      fetchPbxEnCaliente(),     // 100% EN VIVO PBX api.red.com.sv
      fetchCelularEnCaliente(), // 100% EN VIVO Celular kpi.red.com.sv
      fetchSupabaseTable('llamadas_teams?select=*&order=fecha_reunion.desc.nullslast'),
      Promise.all(
        waOffsets.map((offset) =>
          fetchSupabaseTable(
            `llamadas_whatsapp?select=*&order=fecha_llamada.desc.nullslast&offset=${offset}&limit=1000`
          )
        )
      ).then((pages) => pages.flat()),
      fetch('https://prospektia.red.com.sv/api/external/leads-calificados', {
        headers: { 'X-API-Key': 'RedApi_2026_SuperSegura_9XK2', Accept: 'application/json' },
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      Promise.all([
        fetch('https://prospektia.red.com.sv/api/audit/leads-no-calificados?limit=1000&offset=0', {
          headers: { 'X-API-Key': 'RedApi_2026_SuperSegura_9XK2', Accept: 'application/json' },
        }).then((r) => (r.ok ? r.json() : null)),
        fetch('https://prospektia.red.com.sv/api/audit/leads-no-calificados?limit=1000&offset=1000', {
          headers: { 'X-API-Key': 'RedApi_2026_SuperSegura_9XK2', Accept: 'application/json' },
        }).then((r) => (r.ok ? r.json() : null)),
      ]).then(([p1, p2]) => [...(p1?.items || []), ...(p2?.items || [])])
        .catch(() => []),
    ]);

    // 3. Procesar leads DIRECTAMENTE desde Prospektia API (0 dependencia de tabla leads en Supabase)
    const mapaLeads = new Map<string, any>();
    const leadsProspektiaApi = prospektiaRes?.leads || [];

    leadsProspektiaApi.forEach((pl: any) => {
      const cod = String(pl.codigo_prospecto || pl.id || '').trim();
      if (!cod) return;
      const fAg = pl.fecha_agendada ? String(pl.fecha_agendada).trim() : null;
      const hAg = pl.hora_agendada ? String(pl.hora_agendada).trim() : null;

      const leadItem = {
        codigo_prospecto: cod,
        nombre_prospecto: pl.nombre_prospecto || pl.nombre || '',
        telefono: pl.telefono || '',
        fecha_agendada: fAg,
        hora_agendada: hAg,
        fecha_creado: pl.fecha_creado || null,
        hora_creado: pl.hora_creado || null,
        tipo_reunion: pl.tipo_reunion || 'Llamada Telefonica',
        pais: pl.pais || 'SV',
        asesor_id: pl.asesor_id ? String(pl.asesor_id) : null,
        asesor_nombre: pl.asesor_nombre || null,
        asesor_email: pl.asesor_email || null,
        status: pl.status || 'Agendado',
        created_at: pl.created_at || (pl.fecha_creado ? `${pl.fecha_creado}T${pl.hora_creado || '00:00:00'}Z` : new Date().toISOString()),
      };

      mapaLeads.set(cod, leadItem);
    });
    const todosLosLeads = Array.from(mapaLeads.values());
    const leadsCalificadosValidos: any[] = [];
    const leadsNoCalificadosTransferidos: any[] = [];

    todosLosLeads.forEach((l: any) => {
      if (esLeadCalificadoValido(l)) {
        leadsCalificadosValidos.push(l);
      } else {
        leadsNoCalificadosTransferidos.push(l);
      }
    });

    const leads = leadsCalificadosValidos;

    // Procesar Leads No Calificados de Prospektia API (sin tocar Supabase)
    const mapaNc = new Map<string, any>();
    const prospektiaNcItems = Array.isArray(prospektiaNcRes) ? prospektiaNcRes : [];
    prospektiaNcItems.forEach((pnc: any) => {
      const k = String(pnc.id || `${pnc.client_id}_${pnc.created_at}`).trim();
      if (!k) return;
      if (!mapaNc.has(k)) {
        mapaNc.set(k, {
          id: pnc.client_id || pnc.id,
          client_id: pnc.client_id,
          client_name: pnc.client_name || '',
          advisor_name: pnc.advisor_name || '',
          telefono: pnc.client_phone || '',
          created_at: pnc.created_at,
          created_at_sv: pnc.created_at_sv || '',
          fecha: pnc.created_at ? String(pnc.created_at).slice(0, 10) : '',
          hora: pnc.created_at ? String(pnc.created_at).slice(11, 19) : '',
        });
      }
    });

    // Transferir a No Calificados cualquier lead de Prospektia que no cumpla los requisitos de cita agendada o nombre
    leadsNoCalificadosTransferidos.forEach((l: any) => {
      const k = String(l.codigo_prospecto || l.id || '').trim();
      if (!k) return;
      if (!mapaNc.has(k)) {
        const fRef = l.fecha_creado || (l.created_at ? String(l.created_at).slice(0, 10) : '');
        const hRef = l.hora_creado || (l.created_at ? String(l.created_at).slice(11, 19) : '');
        mapaNc.set(k, {
          id: l.id || l.codigo_prospecto,
          client_id: l.codigo_prospecto,
          client_name: l.nombre_prospecto || l.nombre || 'Lead No Calificado',
          advisor_name: l.asesor_nombre || 'Asesor Asignado',
          telefono: l.telefono || '',
          created_at: l.created_at || (fRef ? `${fRef}T${hRef || '00:00:00'}` : new Date().toISOString()),
          fecha: fRef,
          hora: hRef,
          campaign_name: l.tipo_reunion || 'Lead Sin Cita Agendada',
          pais: l.pais || 'SV',
        });
      }
    });

    const leadsNoCalificados = Array.from(mapaNc.values());

    // PBX y Celular provienen 100% de las APIs en vivo (sin Supabase)
    const llamadasPbx = pbxDirecto;
    const llamadasCelular = celDirecto;
    const llamadasWhatsapp = waRaw;

    // Helper para detectar país según teléfono o código
    const detectarPais = (tel?: string, fallback = 'SV'): string => {
      if (!tel) return fallback;
      const num = String(tel).replace(/[^0-9]/g, '');
      if (num.startsWith('503')) return 'SV';
      if (num.startsWith('502')) return 'GT';
      if (num.length === 8) {
        if (['2', '6', '7'].includes(num[0])) return 'SV';
        if (['3', '4', '5'].includes(num[0])) return 'GT';
      }
      return fallback;
    };

    // 4. Enriquecer registros para evitar campos vacíos o 'undefined'
    leads.forEach((l: any) => {
      l.asesor_nombre = resolverAsesorBackend(l.asesor_nombre || l.asesor_id, l.asesor_nombre ? String(l.asesor_nombre).trim() : 'Asesor General');
      if (!l.nombre_prospecto) l.nombre_prospecto = l.codigo_prospecto ? `Prospecto ${l.codigo_prospecto}` : 'Prospecto Sin Nombre';
      l.pais = l.pais || detectarPais(l.telefono, 'SV');
      if (!l.status) l.status = 'Agendado';
    });

    leadsNoCalificados.forEach((l: any) => {
      l.advisor_name = resolverAsesorBackend(l.advisor_name, l.advisor_name ? String(l.advisor_name).trim() : 'Asesor Asignado');
      if (!l.campaign_name) l.campaign_name = 'Campaña Inbound';
    });

    llamadasCelular.forEach((c: any) => {
      c.asesor_nombre = resolverAsesorBackend(c.usuario, resolverAsesorBackend(c.linea, c.usuario || 'Ejecutivo Celular'));
      if (!c.operador) c.operador = 'Claro / Tigo';
    });

    llamadasPbx.forEach((p: any) => {
      const extStr = p.extension ? String(p.extension).trim() : '';
      p.asesor_nombre =
        resolverAsesorBackend(extStr,
          resolverAsesorBackend(p.nombre,
            p.nombre || (extStr ? `Ext. ${extStr}` : 'Línea PBX')
          )
        );
      p.pais = p.pais || detectarPais(p.destino, 'SV');

      let audioFinal = String(p.audio_url || p.grabacion_url || '').trim();
      if (audioFinal && audioFinal !== 'null' && audioFinal !== 'undefined') {
        if (!audioFinal.startsWith('http')) {
          audioFinal = `https://api.red.com.sv${audioFinal.startsWith('/') ? '' : '/'}${audioFinal}`;
        }
      } else if (p.uniqueid && extStr) {
        const d = new Date(p.fecha_hora || Date.now());
        if (!isNaN(d.getTime())) {
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          const dia = String(d.getUTCDate()).padStart(2, '0');
          const fn = `Grabacion_Ext_${extStr}_${p.uniqueid}.wav`;
          audioFinal =
            String(p.pais).toUpperCase() === 'GT'
              ? `https://api.red.com.sv/pbx/api/v1/rawCalls?pais=GT&anio=${y}&mes=${m}&dia=${dia}&archivo=${fn}`
              : `https://api.red.com.sv/pbx/api/v1/getAudio/${y}/${m}/${dia}/${fn}`;
        }
      }
      p.audio_url = audioFinal || null;
      p.grabacion_url = audioFinal || null;
    });

    // 5. Jalar automáticamente prospectos con reunión virtual de Leads hacia Teams
    const mapaTeamsExistente = new Map<string, any>();
    teamsRaw.forEach((t: any) => {
      if (t.codigo_prospecto) {
        mapaTeamsExistente.set(String(t.codigo_prospecto).trim().toLowerCase(), t);
      }
    });

    const llamadasTeams = [...teamsRaw];

    leads.forEach((lv: any) => {
      const tipo = String(lv.tipo_reunion || '').toLowerCase();
      if (tipo.includes('virtual')) {
        const cod = String(lv.codigo_prospecto || '').trim().toLowerCase();
        if (!mapaTeamsExistente.has(cod)) {
          llamadasTeams.push({
            id: `lead-virtual-${lv.id}`,
            codigo_prospecto: lv.codigo_prospecto,
            pais: lv.pais || 'SV',
            ejecutivo: lv.asesor_nombre,
            ejecutivo_nombre: lv.asesor_nombre,
            cliente: lv.nombre_prospecto || (lv.codigo_prospecto ? `Prospecto ${lv.codigo_prospecto}` : 'Cliente Virtual'),
            fecha_reunion: lv.fecha_agendada || lv.fecha_creado,
            hora_reunion: lv.hora_agendada || lv.hora_creado,
            evidencia_url: '',
            estado_teams: 'Pendiente de realizar',
            origen_lead_virtual: true,
            lead_id: lv.id,
            telefono: lv.telefono,
          });
        }
      }
    });

    llamadasTeams.forEach((t: any) => {
      if (t.ejecutivo) {
        t.ejecutivo_nombre = resolverAsesorBackend(t.ejecutivo, t.ejecutivo);
      }
      if (!t.cliente && t.codigo_prospecto) {
        t.cliente = `Prospecto ${t.codigo_prospecto}`;
      }
      if (!t.estado_teams) t.estado_teams = 'Pendiente de realizar';
    });

    llamadasWhatsapp.forEach((w: any) => {
      w.asesor_nombre = resolverAsesorBackend(w.numero_ejecutivo, w.numero_ejecutivo ? `Asesor ${w.numero_ejecutivo}` : 'Asesor WhatsApp');
      if (!w.estado) w.estado = 'Entregado';
      if (!w.direccion) w.direccion = 'Saliente';
    });

    const payloadFinal = {
      exito: true,
      tiempo_ms: Date.now() - tInicio,
      estadisticas: {
        total_catalogo: catalogo.length,
        total_leads: leads.length,
        total_leads_no_calificados: leadsNoCalificados.length,
        total_llamadas_pbx: llamadasPbx.length,
        total_llamadas_celular: llamadasCelular.length,
        total_llamadas_teams: llamadasTeams.length,
        total_llamadas_whatsapp: llamadasWhatsapp.length,
      },
      datos: {
        catalogo,
        mapaCatalogo,
        leads,
        leadsNoCalificados,
        llamadasPbx,
        llamadasCelular,
        llamadasTeams,
        llamadasWhatsapp,
      },
    };

    cacheDatosCompletos = {
      data: payloadFinal,
      timestamp: Date.now(),
    };

    return payloadFinal;
  })();

  try {
    const data = await syncPromiseEnVuelo;
    return res.json(data);
  } catch (error: any) {
    console.error('Error en /api/sync/datos-completos:', error);
    if (cacheDatosCompletos) {
      return res.json(cacheDatosCompletos.data);
    }
    return res.status(500).json({
      exito: false,
      mensaje: error?.message || 'Error al obtener datos desde Supabase',
    });
  } finally {
    syncPromiseEnVuelo = null;
  }
});

// ==============================================================================
// 3. ACTUALIZAR LEAD (KPI SLA y Retroalimentación de Etapas)
// Permite guardar desde la tabla los checkboxes/selects Sí/No en public.leads
// ==============================================================================
app.patch('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  const tabla = req.query.tabla === 'leads_no_calificados' ? 'leads_no_calificados' : 'leads';
  const camposActualizables = req.body;

  try {
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${tabla}?id=eq.${id}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: supabaseHeaders,
      body: JSON.stringify(camposActualizables),
    });

    if (!response.ok) {
      const errTxt = await response.text();
      return res.status(response.status).json({ exito: false, mensaje: errTxt });
    }

    const data = await response.json();
    return res.json({ exito: true, data });
  } catch (err: any) {
    return res.status(500).json({ exito: false, mensaje: err?.message });
  }
});

// ==============================================================================
// 4. GUARDAR O ACTUALIZAR REUNIÓN VIRTUAL TEAMS
// Permite guardar evidencia y estado de la llamada virtual en public.llamadas_teams
// ==============================================================================
app.post('/api/teams', async (req, res) => {
  try {
    const { codigo_prospecto, pais, ejecutivo, cliente, fecha_reunion, hora_reunion, evidencia_url, estado_teams, id } = req.body;

    let existingId: any = null;
    if (typeof id === 'number') {
      existingId = id;
    } else if (codigo_prospecto) {
      const checkRes = await fetch(
        `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/llamadas_teams?codigo_prospecto=eq.${codigo_prospecto}&select=id`,
        { headers: supabaseHeaders }
      );
      const checkData = await checkRes.json();
      if (Array.isArray(checkData) && checkData.length > 0) {
        existingId = checkData[0].id;
      }
    }

    if (existingId) {
      const patchRes = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/llamadas_teams?id=eq.${existingId}`, {
        method: 'PATCH',
        headers: supabaseHeaders,
        body: JSON.stringify({
          evidencia_url: evidencia_url || '',
          estado_teams: estado_teams || 'Si se hizo y tiene evidencia',
          ejecutivo: ejecutivo || 'Asesor General',
          cliente: cliente || 'Cliente',
          fecha_reunion,
          hora_reunion,
          pais: pais || 'SV',
        }),
      });
      const data = await patchRes.json();
      return res.json({ exito: patchRes.ok, data });
    } else {
      const postRes = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/llamadas_teams`, {
        method: 'POST',
        headers: supabaseHeaders,
        body: JSON.stringify({
          codigo_prospecto,
          pais: pais || 'SV',
          ejecutivo: ejecutivo || 'Asesor General',
          cliente: cliente || 'Cliente',
          fecha_reunion: fecha_reunion || new Date().toISOString().slice(0, 10),
          hora_reunion: hora_reunion || '10:00:00',
          evidencia_url: evidencia_url || '',
          estado_teams: estado_teams || 'Si se hizo y tiene evidencia',
        }),
      });
      const data = await postRes.json();
      return res.json({ exito: postRes.ok, data });
    }
  } catch (err: any) {
    return res.status(500).json({ exito: false, mensaje: err?.message });
  }
});

// ==============================================================================
// REGISTRAR LLAMADAS MANUALES (PBX Y CELULAR)
// Permite ingresar llamadas asociadas a códigos de lead / ejecutivos en Supabase
// ==============================================================================
app.post('/api/llamadas/pbx', async (req, res) => {
  try {
    const {
      codigo_lead,
      prospecto_nombre,
      telefono_destino,
      ejecutivo,
      extension,
      fecha,
      hora,
      duracion_segundos = 180,
      estado = 'CONTESTADA',
      pais = 'SV',
    } = req.body;

    const fechaFinal = fecha || new Date().toISOString().slice(0, 10);
    const horaFinal = hora || '10:00:00';
    const fechaHora = `${fechaFinal}T${horaFinal}`;
    const uniqueid = `manual_pbx_${Date.now()}`;

    const payload = {
      uniqueid,
      nombre: ejecutivo || 'LCANAS',
      extension: extension || '4031',
      prefijo: '9',
      destino: telefono_destino ? String(telefono_destino).trim() : '',
      duracion_segundos: Number(duracion_segundos || 180),
      duracion_minutos: Math.round((Number(duracion_segundos || 180) / 60) * 100) / 100,
      duracion_hh_mm_ss: '00:03:00',
      estado: estado || 'CONTESTADA',
      fecha_hora: fechaHora,
      fecha: fechaFinal,
      anio: Number(fechaFinal.slice(0, 4)),
      mes: Number(fechaFinal.slice(5, 7)),
      dia: Number(fechaFinal.slice(8, 10)),
      pais: pais || 'SV',
    };

    const supabaseRes = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/llamadas_pbx`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    const data = await supabaseRes.json();
    cacheDatosCompletos = null; // invalidar cache para recarga inmediata
    return res.json({ exito: supabaseRes.ok, data: Array.isArray(data) ? data[0] : data });
  } catch (err: any) {
    return res.status(500).json({ exito: false, mensaje: err?.message });
  }
});

app.post('/api/llamadas/celular', async (req, res) => {
  try {
    const {
      codigo_lead,
      prospecto_nombre,
      telefono_destino,
      ejecutivo,
      fecha,
      hora,
      duracion_segundos = 180,
      estado = 'CONTESTADA',
    } = req.body;

    const fechaFinal = fecha || new Date().toISOString().slice(0, 10);
    const horaFinal = hora || '10:00:00';

    const payload = {
      id: Date.now(),
      fecha: fechaFinal,
      hora: horaFinal,
      destino: telefono_destino ? String(telefono_destino).trim() : '',
      duracion: Number(duracion_segundos || 180),
      tipo: 'Saliente',
      linea: 'Manual',
      usuario: ejecutivo || 'PAGUILAR',
    };

    const supabaseRes = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/llamadas_celular`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    const data = await supabaseRes.json();
    cacheDatosCompletos = null; // invalidar cache para recarga inmediata
    return res.json({ exito: supabaseRes.ok, data: Array.isArray(data) ? data[0] : data });
  } catch (err: any) {
    return res.status(500).json({ exito: false, mensaje: err?.message });
  }
});

// ==============================================================================
// AUTENTICACIÓN DIRECTA (Gabi / 1234 y acceso de auditor)
// ==============================================================================
app.post('/api/auth/login', (req, res) => {
  const { usuario = '', password = '' } = req.body || {};
  const userTrim = String(usuario).trim();
  const passTrim = String(password).trim();

  // Permite ingreso con 'Gabi'/'1234', 'admin', o cualquier acceso directo
  const nombre = userTrim || 'Gabi';
  return res.json({
    exito: true,
    token: 'jwt-kpi-auditor-2026',
    usuario: {
      nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1),
      rol: 'Super Administrador / Auditor',
    },
  });
});

app.get('/api/auth/me', (req, res) => {
  return res.json({
    exito: true,
    usuario: {
      nombre: 'Gabi',
      rol: 'Super Administrador / Auditor',
    },
  });
});

// ==============================================================================
// 4. CRUD CATÁLOGO (Insertar, Editar, Borrar ejecutivos)
// ==============================================================================
app.post('/api/catalogo', async (req, res) => {
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/catalogo`;
    const response = await fetch(url, {
      method: 'POST',
      headers: supabaseHeaders,
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    return res.json({ exito: response.ok, data });
  } catch (err: any) {
    return res.status(500).json({ exito: false, mensaje: err?.message });
  }
});

app.patch('/api/catalogo/:id', async (req, res) => {
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/catalogo?id=eq.${req.params.id}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: supabaseHeaders,
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    return res.json({ exito: response.ok, data });
  } catch (err: any) {
    return res.status(500).json({ exito: false, mensaje: err?.message });
  }
});

app.delete('/api/catalogo/:id', async (req, res) => {
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/catalogo?id=eq.${req.params.id}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: supabaseHeaders,
    });
    return res.json({ exito: response.ok });
  } catch (err: any) {
    return res.status(500).json({ exito: false, mensaje: err?.message });
  }
});

// ==========================================
// 5. PROXY REAL DE AUDIO / GRABACIONES PBX
// ==========================================
app.get(['/api/audio-proxy', '/api/audio'], async (req, res) => {
  try {
    const rawAudioUrl = (req.query.url as string) || '';
    const uniqueid = (req.query.uniqueid as string) || (req.query.id as string) || '';
    let pais = ((req.query.pais as string) || 'SV').toUpperCase();
    if (pais !== 'GT' && pais !== 'SV') pais = 'SV';

    let anio = (req.query.anio as string) || '2026';
    let mes = (req.query.mes as string) || '10';
    let dia = (req.query.dia as string) || '22';
    let archivo = (req.query.archivo as string) || '';

    // Extraer parámetros si viene URL con formato rawCalls o getAudio
    if (rawAudioUrl) {
      try {
        const u = new URL(rawAudioUrl.startsWith('http') ? rawAudioUrl : `${PBX_HOST}${rawAudioUrl}`);
        const p = u.searchParams.get('pais')?.toUpperCase();
        if (p === 'GT' || p === 'SV') pais = p;
        if (u.searchParams.get('anio')) anio = u.searchParams.get('anio')!;
        if (u.searchParams.get('mes')) mes = u.searchParams.get('mes')!;
        if (u.searchParams.get('dia')) dia = u.searchParams.get('dia')!;
        if (u.searchParams.get('archivo')) archivo = u.searchParams.get('archivo')!;
      } catch (_) {
        if (rawAudioUrl.includes('/getAudio/')) {
          const partes = rawAudioUrl.split('/getAudio/')[1]?.split('/') || [];
          if (partes.length >= 4) {
            anio = partes[0];
            mes = partes[1];
            dia = partes[2];
            archivo = partes.slice(3).join('/');
          }
        }
      }
    }

    if (!uniqueid && !archivo && !rawAudioUrl) {
      return res.status(400).json({ exito: false, mensaje: 'ID, uniqueid o archivo de audio requerido' });
    }

    let token = await getPbxJwtBackend();

    let targetUrl = '';
    if (archivo) {
      targetUrl = `${PBX_HOST}/pbx/api/v1/rawCalls?pais=${pais}&anio=${anio}&mes=${mes}&dia=${dia}&archivo=${encodeURIComponent(archivo)}`;
    }

    const rangeHeader = req.headers.range;
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Authorization: `Bearer ${token}`,
      Accept: 'audio/*,*/*',
    };
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    let pbxRes: Response | null = null;
    if (targetUrl) {
      pbxRes = await fetch(targetUrl, { headers: fetchHeaders });
      if (pbxRes.status === 401) {
        token = await getPbxJwtBackend();
        fetchHeaders.Authorization = `Bearer ${token}`;
        pbxRes = await fetch(targetUrl, { headers: fetchHeaders });
      }
    }

    // Si falló 404 o no teníamos nombre exacto de archivo, buscar en el listado del día por uniqueid
    if ((!pbxRes || !pbxRes.ok || pbxRes.status === 404) && uniqueid) {
      for (const p of [pais, pais === 'GT' ? 'SV' : 'GT']) {
        try {
          const listUrl = `${PBX_HOST}/pbx/api/v1/rawCalls?pais=${p}&anio=${anio}&mes=${mes}&dia=${dia}`;
          const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (listRes.ok) {
            const files = await listRes.json();
            if (Array.isArray(files)) {
              const match = files.find((f: any) => f.name && f.name.includes(uniqueid));
              if (match) {
                targetUrl = `${PBX_HOST}/pbx/api/v1/rawCalls?pais=${p}&anio=${anio}&mes=${mes}&dia=${dia}&archivo=${encodeURIComponent(match.name)}`;
                pbxRes = await fetch(targetUrl, { headers: fetchHeaders });
                break;
              }
            }
          }
        } catch (_) {}
      }
    }

    if (pbxRes && pbxRes.ok) {
      const contentType = pbxRes.headers.get('content-type') || 'audio/wav';
      const contentLength = pbxRes.headers.get('content-length');
      const contentRange = pbxRes.headers.get('content-range');
      const acceptRanges = pbxRes.headers.get('accept-ranges') || 'bytes';

      res.setHeader('Content-Type', contentType.startsWith('audio/') ? contentType : 'audio/wav');
      res.setHeader('Accept-Ranges', acceptRanges);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (contentRange) res.setHeader('Content-Range', contentRange);

      const arrayBuffer = await pbxRes.arrayBuffer();
      return res.status(pbxRes.status).send(Buffer.from(arrayBuffer));
    }

    return res.status(404).json({
      exito: false,
      mensaje: 'Esta llamada no cuenta con archivo de audio grabado en la PBX (llamada no contestada, fallida o sin grabación).',
    });
  } catch (err: any) {
    return res.status(500).json({
      exito: false,
      mensaje: 'Error al procesar audio PBX: ' + (err?.message || String(err)),
    });
  }
});

// ==========================================
// 6. PROXY PARA TRIGGER DE EDGE FUNCTION
// ==========================================
app.post('/api/sync/trigger-edge-function', async (req, res) => {
  try {
    const { pbx_desde, pbx_hasta, pbx_pais } = req.body;
    const functionUrl = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/sincronizar-datos`;

    const dAnt = new Date();
    dAnt.setMonth(dAnt.getMonth() - 1, 1);
    const defaultDesde = dAnt.toISOString().slice(0, 10);

    const bodyPayload: any = {
      pbx_desde: pbx_desde || defaultDesde,
      pbx_hasta: pbx_hasta || new Date().toISOString().slice(0, 10),
      ...(req.body || {}),
    };
    if (pbx_pais) {
      bodyPayload.pbx_pais = pbx_pais;
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: supabaseHeaders,
      body: JSON.stringify(bodyPayload),
    });

    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ exito: false, mensaje: err?.message });
  }
});

// Vite Middleware para desarrollo o estáticos en producción
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Servir build de producción
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor iniciado en puerto ${PORT}`);
  });
}

startServer();
