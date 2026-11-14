import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const cliPortIdx = process.argv.indexOf('--port');
const cliPort = cliPortIdx >= 0 ? Number(process.argv[cliPortIdx + 1]) : NaN;
const nginxPort = Number(process.env.NGINX_PORT || 0);
const rawEnvPort = Number(process.env.PORT || 0);
const defaultAppPort = Number(process.env.DEFAULT_APP_PORT || 3000);
const PORT =
  (!Number.isNaN(cliPort) && cliPort > 0
    ? cliPort
    : process.env.NODE_ENV !== 'production' || (rawEnvPort && rawEnvPort === nginxPort)
    ? defaultAppPort
    : rawEnvPort || defaultAppPort) || 3000;

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    status: 'healthy',
    env: process.env.NODE_ENV || 'development',
    uptime_sec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

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

// Almacén persistente en servidor para estados KPI (SLA y Retroalimentación) en ambos modos
const KPI_DATA_DIR = process.env.KPI_DATA_DIR
  ? path.resolve(process.env.KPI_DATA_DIR)
  : path.resolve(__dirname, '.data');
const KPI_ESTADOS_FILE = path.join(KPI_DATA_DIR, 'kpi-estados.json');
const KPI_ESTADOS_TMP = path.join(os.tmpdir(), 'kpi-auditoria-estados.json');

type KpiTabla = 'leads' | 'leads_no_calificados';

function leerKpiEstadosPersistidos(): Record<string, Record<string, boolean>> {
  for (const file of [KPI_ESTADOS_FILE, KPI_ESTADOS_TMP]) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_) {}
  }
  return {};
}

function guardarKpiEstadoPersistido(
  tabla: KpiTabla,
  claves: string[],
  cambios: Record<string, any>
): Record<string, boolean> {
  const actual = leerKpiEstadosPersistidos();
  const soloKpi: Record<string, boolean> = {};
  const camposPermitidos = [
    'kpi_sla_etapa_1',
    'kpi_sla_etapa_2',
    'kpi_sla_etapa_3',
    'kpi_retroalimentacion_etapa_1',
    'kpi_retroalimentacion_etapa_2',
    'kpi_retroalimentacion_etapa_3',
    'kpi_retroalimentacion_etapa_4',
  ];
  for (const campo of camposPermitidos) {
    if (campo in cambios) {
      soloKpi[campo] = Boolean(cambios[campo]);
    }
  }
  for (const c of claves) {
    const clean = String(c || '').trim();
    if (!clean) continue;
    const key = `${tabla}:${clean}`;
    actual[key] = { ...(actual[key] || {}), ...soloKpi };
  }
  for (const file of [KPI_ESTADOS_FILE, KPI_ESTADOS_TMP]) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(actual, null, 2), 'utf8');
      break;
    } catch (_) {}
  }
  return soloKpi;
}

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
function generarVentanasPbx(diasAtras = 30): [string, string][] {
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
    const ventanas = generarVentanasPbx(45); // 45 días hacia atrás para cubrir todo el mes anterior completo (octubre) y mes actual (noviembre)
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
        id: String(pl.id || cod).trim(),
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

    // Filtrar PBX y Celular únicamente a ejecutivos/números/extensiones configurados en Catálogo
    const catExtSet = new Set<string>();
    const catUserSet = new Set<string>();
    const catNomSet = new Set<string>();
    const catCelSet = new Set<string>();

    if (catalogo.length > 0) {
      catalogo.forEach((cat: any) => {
        if (cat.extension && String(cat.extension).trim() !== 'null') {
          String(cat.extension)
            .split(/[,;/|]+/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
            .forEach((ext) => catExtSet.add(ext));
        }
        if (cat.usuario && String(cat.usuario).trim() !== 'null') {
          catUserSet.add(String(cat.usuario).trim().toLowerCase());
        }
        if (cat.nombre_ejecutivo && String(cat.nombre_ejecutivo).trim() !== 'null') {
          catNomSet.add(String(cat.nombre_ejecutivo).trim().toLowerCase());
        }
        if (cat.celular && String(cat.celular).trim() !== 'null') {
          const digits = String(cat.celular).replace(/\D/g, '');
          if (digits.length >= 7) {
            catCelSet.add(digits.length >= 8 ? digits.slice(-8) : digits.slice(-7));
          }
        }
      });
    }

    const perteneceCatalogoPbx = (p: any): boolean => {
      if (catalogo.length === 0) return true;
      const extRaw = String(p?.extension ?? '').replace(/^ext\.?\s*/i, '').trim().toLowerCase();
      if (extRaw && extRaw !== 'null' && extRaw !== 'undefined') {
        if (catExtSet.has(extRaw)) return true;
        const extDigits = extRaw.replace(/\D/g, '');
        if (extDigits.length >= 7 && catCelSet.has(extDigits.length >= 8 ? extDigits.slice(-8) : extDigits.slice(-7))) {
          return true;
        }
      }
      const nomRaw = String(p?.nombre ?? '').trim().toLowerCase();
      if (nomRaw && nomRaw !== 'null' && nomRaw !== 'undefined') {
        if (catUserSet.has(nomRaw) || catNomSet.has(nomRaw)) return true;
      }
      return false;
    };

    const perteneceCatalogoCel = (c: any): boolean => {
      if (catalogo.length === 0) return true;
      const lineaDigits = String(c?.linea ?? '').replace(/\D/g, '');
      if (lineaDigits.length >= 7 && catCelSet.has(lineaDigits.length >= 8 ? lineaDigits.slice(-8) : lineaDigits.slice(-7))) {
        return true;
      }
      const userRaw = String(c?.usuario ?? '').trim().toLowerCase();
      if (userRaw && userRaw !== 'null' && userRaw !== 'undefined') {
        if (catUserSet.has(userRaw) || catNomSet.has(userRaw)) return true;
      }
      return false;
    };

    // PBX y Celular provienen 100% de las APIs en vivo (filtrados estrictamente por Catálogo)
    const llamadasPbx = pbxDirecto.filter(perteneceCatalogoPbx);
    const llamadasCelular = celDirecto.filter(perteneceCatalogoCel);
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

    // 4B. Enriquecer cada llamada PBX con el N° de Lead y Nombre del Cliente según teléfono destino
    const indiceLeadsPorTel = new Map<string, any[]>();
    const registrarLeadEnIndice = (lead: any, tipo: 'calificado' | 'no_calificado') => {
      const digits = String(lead.telefono || lead.celular || lead.client_phone || '').replace(/\D/g, '');
      if (digits.length < 7) return;
      const key8 = digits.length >= 8 ? digits.slice(-8) : digits.slice(-7);
      const entry = {
        codigo: String(lead.codigo_prospecto || lead.client_id || lead.id || '').trim(),
        cliente: String(lead.nombre_prospecto || lead.client_name || lead.nombre || '').trim(),
        asesor: String(lead.asesor_nombre || lead.advisor_name || '').trim().toLowerCase(),
        fechaTs: new Date(lead.fecha_agendada || lead.fecha_creado || lead.created_at || 0).getTime() || 0,
        tipo,
      };
      if (!entry.codigo && !entry.cliente) return;
      const list = indiceLeadsPorTel.get(key8) || [];
      list.push(entry);
      indiceLeadsPorTel.set(key8, list);
    };
    leads.forEach((l: any) => registrarLeadEnIndice(l, 'calificado'));
    leadsNoCalificados.forEach((l: any) => registrarLeadEnIndice(l, 'no_calificado'));

    llamadasPbx.forEach((p: any) => {
      if (p.codigo_lead && p.cliente_nombre) return;
      const digits = String(p.destino || '').replace(/\D/g, '');
      if (digits.length < 7) return;
      const key = digits.length >= 8 ? digits.slice(-8) : digits.slice(-7);
      const candidatos = indiceLeadsPorTel.get(key);
      if (!candidatos || candidatos.length === 0) return;

      const asesorPbx = String(p.asesor_nombre || p.nombre || '').trim().toLowerCase();
      const tsPbx = new Date(p.fecha_hora || 0).getTime() || 0;

      let mejor = candidatos[0];
      let mejorScore = -Infinity;
      for (const c of candidatos) {
        let score = c.tipo === 'calificado' ? 10 : 0;
        if (asesorPbx && c.asesor && (asesorPbx.includes(c.asesor) || c.asesor.includes(asesorPbx))) {
          score += 50;
        }
        if (tsPbx && c.fechaTs) {
          const diffDays = Math.abs(tsPbx - c.fechaTs) / 86400000;
          score -= Math.min(diffDays, 30);
        }
        if (score > mejorScore) {
          mejorScore = score;
          mejor = c;
        }
      }
      if (!p.codigo_lead && mejor.codigo) p.codigo_lead = mejor.codigo;
      if (!p.cliente_nombre && mejor.cliente) p.cliente_nombre = mejor.cliente;
      if (!p.tipo_lead_match) p.tipo_lead_match = mejor.tipo;
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
            id: `lead-virtual-${lv.id || lv.codigo_prospecto}`,
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

    // 6. Combinar estados KPI (SLA y Retroalimentación) desde Supabase + almacén persistente local
    const kpiPersistidos = leerKpiEstadosPersistidos();
    const camposKpi = [
      'kpi_sla_etapa_1',
      'kpi_sla_etapa_2',
      'kpi_sla_etapa_3',
      'kpi_retroalimentacion_etapa_1',
      'kpi_retroalimentacion_etapa_2',
      'kpi_retroalimentacion_etapa_3',
      'kpi_retroalimentacion_etapa_4',
    ];

    try {
      const sbKpiRows = await fetchSupabaseTable(
        'leads?or=(kpi_sla_etapa_1.eq.true,kpi_sla_etapa_2.eq.true,kpi_sla_etapa_3.eq.true,kpi_retroalimentacion_etapa_1.eq.true,kpi_retroalimentacion_etapa_2.eq.true,kpi_retroalimentacion_etapa_3.eq.true,kpi_retroalimentacion_etapa_4.eq.true)&select=id,codigo_prospecto,kpi_sla_etapa_1,kpi_sla_etapa_2,kpi_sla_etapa_3,kpi_retroalimentacion_etapa_1,kpi_retroalimentacion_etapa_2,kpi_retroalimentacion_etapa_3,kpi_retroalimentacion_etapa_4&limit=1000'
      );
      sbKpiRows.forEach((row: any) => {
        const flags: Record<string, boolean> = {};
        camposKpi.forEach((f) => {
          if (typeof row[f] === 'boolean') flags[f] = row[f];
        });
        if (row.id) kpiPersistidos[`leads:${row.id}`] = { ...(kpiPersistidos[`leads:${row.id}`] || {}), ...flags };
        if (row.codigo_prospecto) {
          kpiPersistidos[`leads:${row.codigo_prospecto}`] = {
            ...(kpiPersistidos[`leads:${row.codigo_prospecto}`] || {}),
            ...flags,
          };
        }
      });
    } catch (_) {}

    const aplicarKpiFlags = (item: any, tabla: KpiTabla) => {
      const k1 = item.id ? kpiPersistidos[`${tabla}:${item.id}`] : undefined;
      const k2 = item.codigo_prospecto ? kpiPersistidos[`${tabla}:${item.codigo_prospecto}`] : undefined;
      const k3 = item.client_id ? kpiPersistidos[`${tabla}:${item.client_id}`] : undefined;
      const merged = { ...(k1 || {}), ...(k2 || {}), ...(k3 || {}) };
      camposKpi.forEach((campo) => {
        if (campo in merged) {
          item[campo] = Boolean(merged[campo]);
        } else {
          item[campo] = Boolean(item[campo]);
        }
      });
    };

    leads.forEach((l: any) => aplicarKpiFlags(l, 'leads'));
    leadsNoCalificados.forEach((l: any) => aplicarKpiFlags(l, 'leads_no_calificados'));

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
// Permite guardar desde la tabla los checkboxes/selects Sí/No en Calificados y No Calificados
// ==============================================================================
app.patch('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  const tabla: KpiTabla =
    req.query.tabla === 'leads_no_calificados' ? 'leads_no_calificados' : 'leads';
  const camposActualizables = req.body || {};

  // Extraer solo campos KPI permitidos para Supabase y persistencia local
  const payloadKpi = guardarKpiEstadoPersistido(tabla, [id], camposActualizables);

  try {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const colFiltro = esUuid
      ? 'id'
      : tabla === 'leads_no_calificados'
      ? 'client_id'
      : 'codigo_prospecto';
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${tabla}?${colFiltro}=eq.${encodeURIComponent(id)}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: supabaseHeaders,
      body: JSON.stringify(Object.keys(payloadKpi).length > 0 ? payloadKpi : camposActualizables),
    });

    cacheDatosCompletos = null;

    if (response.ok) {
      const data = await response.json().catch(() => []);
      return res.json({ exito: true, persisted: 'supabase+local', data });
    }

    // Si Supabase aún no tiene las columnas kpi_* en leads_no_calificados, mantener éxito con persistencia local
    const errTxt = await response.text().catch(() => '');
    return res.json({
      exito: true,
      persisted: 'local_cache',
      aviso_supabase: errTxt || `HTTP ${response.status}`,
      data: [{ id, ...payloadKpi }],
    });
  } catch (err: any) {
    cacheDatosCompletos = null;
    return res.json({
      exito: true,
      persisted: 'local_cache',
      aviso_supabase: err?.message,
      data: [{ id, ...payloadKpi }],
    });
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
      cacheDatosCompletos = null;
      if (!patchRes.ok) {
        return res.status(patchRes.status).json({ exito: false, mensaje: data?.message || 'Error al actualizar Teams', data });
      }
      return res.json({ exito: true, data });
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
      cacheDatosCompletos = null;
      if (!postRes.ok) {
        return res.status(postRes.status).json({ exito: false, mensaje: data?.message || 'Error al guardar Teams', data });
      }
      return res.json({ exito: true, data });
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
    const { nombre_ejecutivo, usuario, extension, celular, pais } = req.body || {};
    if (!nombre_ejecutivo || !String(nombre_ejecutivo).trim()) {
      return res.status(400).json({ exito: false, mensaje: 'El nombre del ejecutivo es obligatorio.' });
    }
    const payload = {
      nombre_ejecutivo: String(nombre_ejecutivo).trim(),
      usuario: usuario ? String(usuario).trim() : null,
      extension: extension ? String(extension).trim() : null,
      celular: celular ? String(celular).trim() : null,
      pais: pais ? String(pais).trim().toUpperCase() : 'SV',
    };
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/catalogo`;
    const response = await fetch(url, {
      method: 'POST',
      headers: supabaseHeaders,
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      return res.status(response.status).json({
        exito: false,
        mensaje: data?.message || data?.hint || `Error Supabase HTTP ${response.status}`,
        data,
      });
    }
    cacheDatosCompletos = null;
    return res.json({ exito: true, data: Array.isArray(data) ? data[0] : data });
  } catch (err: any) {
    return res.status(500).json({ exito: false, mensaje: err?.message });
  }
});

app.patch('/api/catalogo/:id', async (req, res) => {
  try {
    const { nombre_ejecutivo, usuario, extension, celular, pais } = req.body || {};
    const payload: Record<string, any> = {};
    if (nombre_ejecutivo !== undefined) payload.nombre_ejecutivo = String(nombre_ejecutivo).trim();
    if (usuario !== undefined) payload.usuario = usuario ? String(usuario).trim() : null;
    if (extension !== undefined) payload.extension = extension ? String(extension).trim() : null;
    if (celular !== undefined) payload.celular = celular ? String(celular).trim() : null;
    if (pais !== undefined) payload.pais = pais ? String(pais).trim().toUpperCase() : 'SV';

    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/catalogo?id=eq.${encodeURIComponent(req.params.id)}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: supabaseHeaders,
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      return res.status(response.status).json({
        exito: false,
        mensaje: data?.message || data?.hint || `Error Supabase HTTP ${response.status}`,
        data,
      });
    }
    cacheDatosCompletos = null;
    return res.json({ exito: true, data: Array.isArray(data) ? data[0] : data });
  } catch (err: any) {
    return res.status(500).json({ exito: false, mensaje: err?.message });
  }
});

app.delete('/api/catalogo/:id', async (req, res) => {
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/catalogo?id=eq.${encodeURIComponent(req.params.id)}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: supabaseHeaders,
    });
    const text = await response.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      return res.status(response.status).json({
        exito: false,
        mensaje: data?.message || data?.hint || `Error Supabase HTTP ${response.status}`,
        data,
      });
    }
    cacheDatosCompletos = null;
    return res.json({ exito: true, data });
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

// ==============================================================================
// 7. PROXY DE TRANSCRIPCIONES & ANÁLISIS QA DE LLAMADAS (desaIssabel)
// Endpoint: http://200.35.189.133:3000/idata/api/v1/desaIssabel/getResumenLlamada
// ==============================================================================
const ISSABEL_RESUMEN_URL = 'http://200.35.189.133:3000/idata/api/v1/desaIssabel/getResumenLlamada';
const cacheTranscripciones: { [key: string]: { data: any[]; timestamp: number } } = {};
const CACHE_TRANS_TTL = 60000; // 1 minuto de cache

app.get('/api/transcripciones/consultar', async (req, res) => {
  try {
    const {
      uniqueid = '',
      extension = '',
      nombre = '',
      destino = '',
      fecha = '',
      fechaInicial = '',
      fechaFinal = '',
      listar = 'false',
      estado = '',
      duracion = '',
    } = req.query as Record<string, string>;

    // Detección inteligente de troncales / extensión invertida:
    // Si la extensión tiene más de 5 dígitos (ej. 22990404) y el destino es 3-4 dígitos (ej. 6074), invertir.
    let cleanExt = String(extension || '').trim();
    let cleanDest = String(destino || '').trim();
    let cleanNombre = String(nombre || '').trim();

    if (cleanExt.length > 5 && cleanDest.length >= 3 && cleanDest.length <= 4) {
      const temp = cleanExt;
      cleanExt = cleanDest;
      cleanDest = temp;
    }

    // 1. Determinar rango de fechas para la consulta a la API de Issabel
    let fIni = fechaInicial;
    let fFin = fechaFinal;

    if (!fIni || !fFin) {
      if (fecha) {
        const d = new Date(fecha.length === 10 ? `${fecha}T12:00:00Z` : fecha);
        if (!isNaN(d.getTime())) {
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          fIni = `${y}-${m}-01`;
          const dPost = new Date(d);
          dPost.setDate(dPost.getDate() + 4);
          fFin = dPost.toISOString().slice(0, 10);
        }
      }
    }

    if (!fIni || !fFin) {
      const hoy = new Date();
      const hace15 = new Date();
      hace15.setDate(hace15.getDate() - 15);
      fIni = hace15.toISOString().slice(0, 10);
      fFin = hoy.toISOString().slice(0, 10);
    }

    const cacheKey = `${fIni}_${fFin}`;
    let llamadasInfo: any[] = [];

    if (cacheTranscripciones[cacheKey] && Date.now() - cacheTranscripciones[cacheKey].timestamp < CACHE_TRANS_TTL) {
      llamadasInfo = cacheTranscripciones[cacheKey].data;
    } else {
      const targetUrl = `${ISSABEL_RESUMEN_URL}?fechaInicial=${fIni}&fechaFinal=${fFin}`;
      const response = await fetch(targetUrl);
      if (response.ok) {
        const json = await response.json();
        if (json && Array.isArray(json.info)) {
          llamadasInfo = json.info;
          cacheTranscripciones[cacheKey] = { data: llamadasInfo, timestamp: Date.now() };
        }
      }
    }

    // 2. Si se solicita listar o explorar todas las llamadas con filtros de nombre / extensión:
    if (listar === 'true' || (!uniqueid && !cleanDest && (cleanNombre || cleanExt))) {
      let filtradas = llamadasInfo;
      if (cleanNombre) {
        const nLower = cleanNombre.toLowerCase().trim();
        filtradas = filtradas.filter(
          (c) => c.nombre && c.nombre.toLowerCase().includes(nLower)
        );
      }
      if (cleanExt) {
        filtradas = filtradas.filter(
          (c) => String(c.extension).trim() === cleanExt
        );
      }
      return res.json({
        exito: true,
        total: filtradas.length,
        items: filtradas,
        fechaInicial: fIni,
        fechaFinal: fFin,
      });
    }

    // Función auxiliar para obtener llamadas con transcripción confirmada
    const obtenerLlamadasRelacionadas = (extTarget: string, nomTarget: string) => {
      const conTrans = llamadasInfo.filter(
        (c) => Boolean(c.transcripcion && String(c.transcripcion).trim().length > 10)
      );

      // Coincidencia por misma extensión o asesor
      let rel = conTrans.filter((c) => {
        if (extTarget && String(c.extension).trim() === extTarget) return true;
        if (nomTarget && c.nombre && c.nombre.toLowerCase().includes(nomTarget.toLowerCase())) return true;
        return false;
      });

      // Si no hay de esa extensión, devolver las mejores transcripciones del periodo
      if (rel.length === 0) {
        rel = conTrans.slice(0, 8);
      } else {
        rel = rel.slice(0, 8);
      }
      return rel;
    };

    // 3. Buscar coincidencia de una llamada específica
    let match: any = null;

    if (uniqueid) {
      match = llamadasInfo.find((c) => String(c.uniqueid).trim() === String(uniqueid).trim());
    }

    // Fallback 1: Buscar por teléfono destino limpio (8 dígitos) con validación estricta de fecha y asesor
    if (!match && cleanDest) {
      const destClean = cleanDest.replace(/[^0-9]/g, '').slice(-8);
      const targetDia = fecha ? fecha.slice(0, 10) : '';

      if (destClean.length >= 7) {
        match = llamadasInfo.find((c) => {
          const cDest = String(c.destino || '').replace(/[^0-9]/g, '').slice(-8);
          if (!cDest || cDest !== destClean) return false;

          // Si hay fecha target, debe coincidir exactamente el mismo día (YYYY-MM-DD)
          if (targetDia) {
            const cDia = String(c.fecha || c.fecha_hora || '').slice(0, 10);
            if (cDia && cDia !== targetDia) return false;
          }

          // Debe coincidir la extensión o el asesor para no cruzar llamadas de otros ejecutivos
          const coincideExt = Boolean(cleanExt && String(c.extension).trim() === cleanExt);
          const coincideNom = Boolean(cleanNombre && c.nombre && c.nombre.toLowerCase().includes(cleanNombre.toLowerCase()));

          if (cleanExt || cleanNombre) {
            return coincideExt || coincideNom;
          }

          return false;
        });
      }
    }

    // Fallback 2: Buscar por extensión y proximidad horaria
    if (!match && cleanExt && fecha) {
      const fHoraTarget = fecha.slice(0, 16); // YYYY-MM-DDTHH:mm
      match = llamadasInfo.find((c) => {
        if (String(c.extension).trim() !== cleanExt) return false;
        if (c.fecha_hora && c.fecha_hora.slice(0, 16) === fHoraTarget) return true;
        return false;
      });
    }

    // 4. Si la llamada fue NO CONTESTADA, OCUPADA o FALLIDA (sin voz humana)
    const estadoUpper = String(estado).toUpperCase();
    const durNum = Number(duracion || 0);
    if ((estadoUpper.includes('NO CONTESTADA') || estadoUpper.includes('OCUPADA') || estadoUpper.includes('FALLIDA') || durNum === 0) && (!match || !match.transcripcion)) {
      return res.json({
        exito: true,
        disponible: false,
        motivo: 'no_contestada',
        mensaje: 'Esta llamada no fue contestada (sin conversación de voz para transcribir)',
        detalle: `El conmutador registró la llamada como ${estadoUpper || 'Sin contestar'} (0s), por lo que no existió diálogo con el cliente para analizar.`,
        llamadasRelacionadas: obtenerLlamadasRelacionadas(cleanExt, cleanNombre),
      });
    }

    // 5. Si no se encontró ningún registro directo en la base de Issabel
    if (!match) {
      return res.json({
        exito: true,
        disponible: false,
        motivo: 'no_encontrada',
        mensaje: 'En 24 horas podrás consultar la transcripción de esta llamada',
        detalle: 'La llamada aún no ha sido procesada o indexada por el motor de inteligencia artificial.',
        llamadasRelacionadas: obtenerLlamadasRelacionadas(cleanExt, cleanNombre),
      });
    }

    // 6. Si se encontró, verificar si tiene transcripción
    const tieneTranscripcion = Boolean(
      match.transcripcion && String(match.transcripcion).trim().length > 5
    );

    if (!tieneTranscripcion) {
      return res.json({
        exito: true,
        disponible: false,
        motivo: 'en_proceso',
        mensaje: 'En 24 horas podrás consultar la transcripción de esta llamada',
        detalle: 'Las transcripciones y resúmenes QA de llamadas están disponibles 24 horas después de realizada la llamada.',
        registro: match,
        llamadasRelacionadas: obtenerLlamadasRelacionadas(cleanExt, cleanNombre),
      });
    }

    // 7. Transcripción y QA disponibles exitosamente
    return res.json({
      exito: true,
      disponible: true,
      registro: match,
      llamadasRelacionadas: obtenerLlamadasRelacionadas(cleanExt, cleanNombre).filter(
        (c) => c.uniqueid !== match.uniqueid
      ),
    });
  } catch (err: any) {
    return res.status(500).json({
      exito: false,
      mensaje: 'Error al consultar API de transcripciones: ' + (err?.message || String(err)),
    });
  }
});

// Endpoint de catálogo de asesores con transcripciones disponibles
app.get('/api/transcripciones/catalogo-ejecutivos', async (_req, res) => {
  try {
    const fIni = '2026-10-01';
    const fFin = '2026-11-05';
    const cacheKey = `catalogo_${fIni}_${fFin}`;

    let data: any[] = [];
    if (cacheTranscripciones[cacheKey] && Date.now() - cacheTranscripciones[cacheKey].timestamp < 300000) {
      data = cacheTranscripciones[cacheKey].data;
    } else {
      const response = await fetch(`${ISSABEL_RESUMEN_URL}?fechaInicial=${fIni}&fechaFinal=${fFin}`);
      if (response.ok) {
        const json = await response.json();
        data = Array.isArray(json.info) ? json.info : [];
        cacheTranscripciones[cacheKey] = { data, timestamp: Date.now() };
      }
    }

    const conTrans = data.filter((c) => Boolean(c.transcripcion && c.transcripcion.trim().length > 10));
    const conteoPorEjecutivo: Record<string, { nombre: string; extension: string; total: number; pais: string; sample: any }> = {};

    conTrans.forEach((c) => {
      const key = `${c.extension || 'ext'}_${c.nombre || 'nom'}`;
      if (!conteoPorEjecutivo[key]) {
        conteoPorEjecutivo[key] = {
          nombre: c.nombre || `Ext. ${c.extension}`,
          extension: c.extension || '',
          total: 0,
          pais: c.pais || 'GT',
          sample: c,
        };
      }
      conteoPorEjecutivo[key].total += 1;
    });

    const lista = Object.values(conteoPorEjecutivo).sort((a, b) => b.total - a.total);
    return res.json({
      exito: true,
      total_con_transcripcion: conTrans.length,
      ejecutivos: lista,
    });
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor iniciado en puerto ${PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`Recibida señal ${signal}, cerrando servidor HTTP...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
