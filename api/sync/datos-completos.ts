// Serverless function para Vercel: /api/sync/datos-completos
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://sbopifiiyezmvsadwkpg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3BpZmlpeWV6bXZzYWR3a3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzM0OTYsImV4cCI6MjEwMDMwOTQ5Nn0.ZI5y8lroFF529Xr-Otm1fcq6H2lhbh9e3s-WU9O6I7A';

const supabaseHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

function normalizarTipoReunion(tipoReunion?: unknown, tipoLlamada?: unknown, tipoAlt?: unknown): string {
  for (const cand of [tipoReunion, tipoLlamada, tipoAlt]) {
    if (cand === null || cand === undefined) continue;
    const raw = String(cand).trim();
    const lower = raw.toLowerCase();
    if (!raw || ['null', 'undefined', 'none', 'n/a', 'na', '-', '(sin reunion)', 'sin reunion', 'sin reunión'].includes(lower)) continue;
    return raw;
  }
  return 'Llamada Telefonica';
}

function esTipoReunionVirtual(tipo?: unknown): boolean {
  const lower = String(tipo || '').toLowerCase().trim();
  return lower.includes('virtual') || lower.includes('teams');
}

const COLS_CATALOGO = 'id,pais,nombre_ejecutivo,usuario,extension,celular';
const COLS_TEAMS = 'id,codigo_prospecto,pais,ejecutivo,cliente,fecha_reunion,hora_reunion,evidencia_url,estado_teams';
const COLS_WHATSAPP = 'id,ejecutivo_id,numero_ejecutivo,numero_cliente,fecha_llamada,duracion_segundos,estado,direccion,nota';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
let cacheDatosVercel: CacheEntry<any> | null = null;
let cacheCatalogoVercel: CacheEntry<any[]> | null = null;
let cacheTeamsVercel: CacheEntry<any[]> | null = null;
let cacheWhatsappVercel: CacheEntry<any[]> | null = null;
let promiseDatosVercel: Promise<any> | null = null;
const CACHE_DATOS_TTL_MS = 3 * 60 * 1000;
const CACHE_SUPABASE_TTL_MS = 5 * 60 * 1000;

async function fetchWhatsappVercel(forzar = false, incluirHistorico = false): Promise<any[]> {
  if (!forzar && !incluirHistorico && cacheWhatsappVercel && Date.now() - cacheWhatsappVercel.timestamp < CACHE_SUPABASE_TTL_MS) {
    return cacheWhatsappVercel.data;
  }
  const dCorte = new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const filtro = incluirHistorico ? '' : `&fecha_llamada=gte.${dCorte}T00:00:00Z`;
  const all: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  const maxTotal = incluirHistorico ? 3000 : 2000;
  while (offset < maxTotal) {
    const r = await fetch(
      `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/llamadas_whatsapp?select=${COLS_WHATSAPP}${filtro}&order=fecha_llamada.desc.nullslast&offset=${offset}&limit=${pageSize}`,
      { headers: supabaseHeaders }
    );
    if (!r.ok) break;
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  if (!incluirHistorico) {
    cacheWhatsappVercel = { data: all, timestamp: Date.now() };
  }
  return all;
}

const PBX_HOST = 'https://api.red.com.sv';
const PBX_USER = 'DBOLAINES';
const PBX_PASS = 'Intelfon1234';

let pbxBackendToken: string | null = null;
let pbxBackendTokenExp = 0;

async function getPbxJwt(): Promise<string> {
  if (pbxBackendToken && Date.now() < pbxBackendTokenExp) {
    return pbxBackendToken;
  }
  const r = await fetch(`${PBX_HOST}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: PBX_USER, password: PBX_PASS }),
  });
  if (!r.ok) throw new Error(`PBX login failed HTTP ${r.status}`);
  const data = await r.json();
  const token = data.token || data.jwt || data.access_token;
  if (!token) throw new Error('No token in PBX login');
  pbxBackendToken = token;
  pbxBackendTokenExp = Date.now() + 23 * 3600 * 1000;
  return token;
}

export const maxDuration = 30; // Soporte extendido para Vercel Functions
export const dynamic = 'force-dynamic';

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

async function fetchPbxEnCaliente(): Promise<any[]> {
  try {
    const token = await getPbxJwt();
    const ventanas = generarVentanasPbx(45); // 45 días para cubrir todo el mes anterior completo (octubre) y actual (noviembre)
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
    console.error('Error PBX en caliente Vercel:', err);
    return [];
  }
}

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
    console.error('Error Celular en caliente Vercel:', err);
    return [];
  }
}

function esLeadCalificadoValido(lead: any): boolean {
  if (!lead) return false;
  const fAg = lead.fecha_agendada && lead.fecha_agendada !== 'null' ? String(lead.fecha_agendada).trim() : '';
  if (!fAg || fAg.length < 8) return false;

  const rawNombre = String(
    lead.nombre_prospecto || lead.nombre || lead.cliente || lead.prospecto_nombre || ''
  ).trim();
  if (rawNombre.length < 2) return false;

  const caracteresValidos = rawNombre.match(/[\p{L}\p{N}]/gu) || [];
  if (caracteresValidos.length < 2) return false;

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
    'lead',
  ];
  if (invalidos.includes(normalizado)) return false;

  return true;
}

const PROSPEKTIA_HEADERS = {
  'X-API-Key': 'RedApi_2026_SuperSegura_9XK2',
  Accept: 'application/json',
};

function normalizarTexto(val?: string | null): string {
  if (!val) return '';
  return String(val)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizarPais(pais?: string | null): 'SV' | 'GT' | null {
  if (!pais) return null;
  const clean = normalizarTexto(pais).toUpperCase();
  if (clean === 'GT' || clean === 'GUATEMALA' || clean === 'GUA') return 'GT';
  if (clean === 'SV' || clean === 'EL SALVADOR' || clean === 'SLV' || clean === 'ESA') return 'SV';
  return null;
}

function detectarPaisTel(tel?: string | number | null): 'SV' | 'GT' | null {
  if (tel === undefined || tel === null) return null;
  const digits = String(tel).replace(/\D/g, '');
  if (!digits || digits.length < 7) return null;
  if (digits.startsWith('502')) return 'GT';
  if (digits.startsWith('503')) return 'SV';
  if (digits.length === 8) {
    if (['3', '4', '5'].includes(digits[0])) return 'GT';
    if (['2', '6', '7'].includes(digits[0])) return 'SV';
  }
  return null;
}

function parseFechaHoraNcSv(createdAtSv?: string | null, createdAtIso?: string | null): { fecha: string; hora: string } {
  if (createdAtSv && typeof createdAtSv === 'string') {
    const m = createdAtSv.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (m) {
      const [, dd, mm, yyyy, hh, min, ampm] = m;
      let hourNum = parseInt(hh, 10);
      if (ampm?.toUpperCase() === 'PM' && hourNum < 12) hourNum += 12;
      if (ampm?.toUpperCase() === 'AM' && hourNum === 12) hourNum = 0;
      return {
        fecha: `${yyyy}-${String(parseInt(mm, 10)).padStart(2, '0')}-${String(parseInt(dd, 10)).padStart(2, '0')}`,
        hora: `${String(hourNum).padStart(2, '0')}:${min}:00`,
      };
    }
  }
  if (createdAtIso) {
    const raw = String(createdAtIso).trim();
    const d = new Date(raw);
    if (!isNaN(d.getTime()) && /(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
      const sv = new Date(d.getTime() - 6 * 3600 * 1000);
      return {
        fecha: sv.toISOString().slice(0, 10),
        hora: sv.toISOString().slice(11, 19),
      };
    }
    return {
      fecha: raw.slice(0, 10),
      hora: raw.slice(11, 19) || '09:00:00',
    };
  }
  return { fecha: '', hora: '' };
}

async function fetchProspektiaNoCalificadosPaginado(maxTotal = 10000): Promise<any[]> {
  const todos: any[] = [];
  const pageSize = 1000;
  let offset = 0;
  try {
    while (offset < maxTotal) {
      const r = await fetch(
        `https://prospektia.red.com.sv/api/audit/leads-no-calificados?limit=${pageSize}&offset=${offset}`,
        { headers: PROSPEKTIA_HEADERS, cache: 'no-store' }
      );
      if (!r.ok) break;
      const json = await r.json();
      const items = Array.isArray(json?.items) ? json.items : [];
      if (items.length === 0) break;
      todos.push(...items);
      if (items.length < pageSize) break;
      offset += pageSize;
    }
  } catch (err) {
    console.warn('Error paginando ProspektIA NC Vercel:', err);
  }
  return todos;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const forzar = req.query?.forzar === 'true';
  const incluirHistorico = req.query?.historico === 'true';

  if (!forzar && !incluirHistorico && cacheDatosVercel && Date.now() - cacheDatosVercel.timestamp < CACHE_DATOS_TTL_MS) {
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json(cacheDatosVercel.data);
  }

  if (!incluirHistorico && promiseDatosVercel) {
    try {
      const cached = await promiseDatosVercel;
      return res.status(200).json(cached);
    } catch (_) {}
  }

  const ejecutar = (async () => {
    const fetchCatalogo = async () => {
      if (!forzar && cacheCatalogoVercel && Date.now() - cacheCatalogoVercel.timestamp < CACHE_SUPABASE_TTL_MS) {
        return cacheCatalogoVercel.data;
      }
      const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/catalogo?select=${COLS_CATALOGO}&order=id.asc&limit=500`, {
        headers: supabaseHeaders,
      });
      const data = r.ok ? await r.json() : [];
      cacheCatalogoVercel = { data: Array.isArray(data) ? data : [], timestamp: Date.now() };
      return cacheCatalogoVercel.data;
    };

    const fetchTeams = async () => {
      if (!forzar && cacheTeamsVercel && Date.now() - cacheTeamsVercel.timestamp < CACHE_SUPABASE_TTL_MS) {
        return cacheTeamsVercel.data;
      }
      const r = await fetch(
        `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/llamadas_teams?select=${COLS_TEAMS}&order=fecha_reunion.desc.nullslast&limit=500`,
        { headers: supabaseHeaders }
      );
      const data = r.ok ? await r.json() : [];
      cacheTeamsVercel = { data: Array.isArray(data) ? data : [], timestamp: Date.now() };
      return cacheTeamsVercel.data;
    };

    const [
      catalogoRes,
      pbxDirecto,
      celDirecto,
      teamsRawRes,
      waRawRes,
      prospektiaRes,
      prospektiaNcRes,
    ] = await Promise.all([
      fetchCatalogo(),
      fetchPbxEnCaliente(),
      fetchCelularEnCaliente(),
      fetchTeams(),
      fetchWhatsappVercel(forzar, incluirHistorico),
      fetch('https://prospektia.red.com.sv/api/external/leads-calificados', {
        headers: PROSPEKTIA_HEADERS,
        cache: 'no-store',
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetchProspektiaNoCalificadosPaginado(),
    ]);

    const catalogo = Array.isArray(catalogoRes) ? catalogoRes : [];
    const teamsRaw = Array.isArray(teamsRawRes) ? teamsRawRes : [];
    const llamadasWhatsapp = Array.isArray(waRawRes) ? waRawRes : [];

    // Construir catálogo de asesores para enriquecimiento uniforme (sin sensibilidad a acentos)
    const mapaCatalogo = {
      porExtension: {} as Record<string, any>,
      porUsuario: {} as Record<string, any>,
      porCelular: {} as Record<string, any>,
      porNombre: {} as Record<string, any>,
    };
    const paisPorUsuario: Record<string, 'SV' | 'GT'> = {};
    const paisPorNombre: Record<string, 'SV' | 'GT'> = {};
    const paisPorExt: Record<string, 'SV' | 'GT'> = {};
    const paisPorCel: Record<string, 'SV' | 'GT'> = {};

    catalogo.forEach((cat: any) => {
      const pCat = normalizarPais(cat.pais);
      if (cat.extension && cat.extension !== 'null') {
        const ext = String(cat.extension).trim();
        mapaCatalogo.porExtension[ext] = cat;
        if (pCat) paisPorExt[ext.toLowerCase()] = pCat;
      }
      if (cat.usuario && cat.usuario !== 'null') {
        const uNorm = normalizarTexto(cat.usuario);
        mapaCatalogo.porUsuario[uNorm] = cat;
        if (pCat) paisPorUsuario[uNorm] = pCat;
      }
      if (cat.nombre_ejecutivo) {
        const nNorm = normalizarTexto(cat.nombre_ejecutivo);
        mapaCatalogo.porNombre[nNorm] = cat;
        if (pCat) paisPorNombre[nNorm] = pCat;
      }
      if (cat.celular && cat.celular !== 'null') {
        const cleanTel = String(cat.celular).replace(/[^0-9]/g, '').slice(-8);
        if (cleanTel) {
          mapaCatalogo.porCelular[cleanTel] = cat;
          if (pCat) paisPorCel[cleanTel] = pCat;
        }
      }
    });

    const resolverAsesorBackend = (ident: string, fallback: string) => {
      if (!ident || ident === 'null' || ident === 'undefined') return fallback;
      const idTrim = String(ident).trim();
      const idNorm = normalizarTexto(idTrim);
      if (mapaCatalogo.porUsuario[idNorm]) return mapaCatalogo.porUsuario[idNorm].nombre_ejecutivo;
      if (mapaCatalogo.porExtension[idTrim]) return mapaCatalogo.porExtension[idTrim].nombre_ejecutivo;
      if (mapaCatalogo.porNombre[idNorm]) return mapaCatalogo.porNombre[idNorm].nombre_ejecutivo;
      const cleanDigits = idTrim.replace(/[^0-9]/g, '').slice(-8);
      if (cleanDigits && mapaCatalogo.porCelular[cleanDigits]) return mapaCatalogo.porCelular[cleanDigits].nombre_ejecutivo;
      for (const cat of catalogo) {
        const uNorm = normalizarTexto(cat.usuario);
        const nNorm = normalizarTexto(cat.nombre_ejecutivo);
        if (uNorm && idNorm.includes(uNorm)) return cat.nombre_ejecutivo;
        if (nNorm && (idNorm.includes(nNorm) || nNorm.includes(idNorm))) return cat.nombre_ejecutivo;
      }
      return fallback;
    };

    const detectarPaisPorAsesor = (ident?: string | null, email?: string | null): 'SV' | 'GT' | null => {
      if (email) {
        const eLow = String(email).toLowerCase().trim();
        if (eLow.endsWith('.gt') || eLow.includes('.gt@')) return 'GT';
        if (eLow.endsWith('.sv') || eLow.includes('.sv@')) return 'SV';
      }
      if (!ident) return null;
      const norm = normalizarTexto(ident);
      if (!norm || norm === 'null' || norm === 'undefined') return null;
      if (paisPorUsuario[norm]) return paisPorUsuario[norm];
      if (paisPorNombre[norm]) return paisPorNombre[norm];
      if (paisPorExt[norm]) return paisPorExt[norm];
      const digits = norm.replace(/\D/g, '');
      if (digits.length >= 7) {
        const k = digits.length >= 8 ? digits.slice(-8) : digits;
        if (paisPorCel[k]) return paisPorCel[k];
      }
      for (const [nomCat, paisCat] of Object.entries(paisPorNombre)) {
        if (norm.includes(nomCat) || nomCat.includes(norm)) return paisCat;
        const tNorm = norm.split(/\s+/).filter(t => t.length >= 4);
        const tCat = nomCat.split(/\s+/).filter(t => t.length >= 4);
        if (tNorm.length > 0 && tCat.length > 0) {
          const comunes = tNorm.filter(t => tCat.includes(t));
          if (comunes.length >= 2 || (comunes.length === 1 && tNorm.length === 1)) return paisCat;
        }
      }
      for (const [uCat, paisCat] of Object.entries(paisPorUsuario)) {
        if (uCat.length >= 4 && norm.includes(uCat)) return paisCat;
      }
      return null;
    };

    const detectarPaisLeadBackend = (lead: any): 'SV' | 'GT' => {
      const explicito = normalizarPais(lead?.pais || lead?.country);
      if (explicito) return explicito;
      const porTel = detectarPaisTel(lead?.telefono || lead?.client_phone || lead?.phone || lead?.celular);
      if (porTel) return porTel;
      const porAsesor = detectarPaisPorAsesor(
        lead?.asesor_nombre || lead?.advisor_name || lead?.asesor || lead?.asesor_id,
        lead?.asesor_email || lead?.email
      );
      if (porAsesor) return porAsesor;
      return 'SV';
    };

    const mapaLeads = new Map<string, any>();
    const leadsProspektiaApi = prospektiaRes?.leads || [];
    leadsProspektiaApi.forEach((pl: any) => {
      const cod = String(pl.codigo_prospecto || pl.id || '').trim();
      if (!cod) return;
      const fAg = pl.fecha_agendada ? String(pl.fecha_agendada).trim() : null;
      const hAg = pl.hora_agendada ? String(pl.hora_agendada).trim() : null;
      const asesorRes = resolverAsesorBackend(
        pl.asesor_nombre || pl.asesor_id || '',
        pl.asesor_nombre ? String(pl.asesor_nombre).trim() : ''
      );
      const leadObj: any = {
        id: String(pl.id || cod).trim(),
        codigo_prospecto: cod,
        nombre_prospecto: pl.nombre_prospecto || pl.nombre || '',
        telefono: pl.telefono || '',
        fecha_agendada: fAg,
        hora_agendada: hAg,
        fecha_creado: pl.fecha_creado || null,
        hora_creado: pl.hora_creado || null,
        tipo_reunion: normalizarTipoReunion(pl.tipo_reunion, pl.tipo_llamada, pl.tipo),
        pais: pl.pais || '',
        asesor_id: pl.asesor_id ? String(pl.asesor_id) : null,
        asesor_nombre: asesorRes || pl.asesor_nombre || null,
        asesor_email: pl.asesor_email || null,
        status: pl.status || 'Agendado',
        created_at: pl.created_at || (pl.fecha_creado ? `${pl.fecha_creado}T${pl.hora_creado || '00:00:00'}Z` : new Date().toISOString()),
      };
      leadObj.pais = detectarPaisLeadBackend(leadObj);
      mapaLeads.set(cod, leadObj);
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

    leadsCalificadosValidos.sort((a, b) => {
      const fA = `${a.fecha_agendada || a.created_at || ''}T${a.hora_agendada || '00:00'}`;
      const fB = `${b.fecha_agendada || b.created_at || ''}T${b.hora_agendada || '00:00'}`;
      return fB.localeCompare(fA);
    });

    const mapaNc = new Map<string, any>();
    const clientIdsNc = new Set<string>();
    const prospektiaNcItems = Array.isArray(prospektiaNcRes) ? prospektiaNcRes : [];
    prospektiaNcItems.forEach((pnc: any) => {
      const k = String(pnc.id || `${pnc.client_id}_${pnc.created_at}`).trim();
      if (!k) return;
      if (pnc.client_id) clientIdsNc.add(String(pnc.client_id).trim());
      if (!mapaNc.has(k)) {
        const advisorRes = resolverAsesorBackend(
          pnc.advisor_name || '',
          pnc.advisor_name ? String(pnc.advisor_name).trim() : 'Asesor Asignado'
        );
        const { fecha, hora } = parseFechaHoraNcSv(pnc.created_at_sv, pnc.created_at);
        const paisInf = detectarPaisLeadBackend({
          pais: pnc.pais || pnc.country,
          telefono: pnc.client_phone,
          advisor_name: advisorRes,
          asesor_nombre: pnc.advisor_name,
        });
        mapaNc.set(k, {
          id: pnc.client_id || pnc.id,
          client_id: pnc.client_id,
          client_name: pnc.client_name || '',
          advisor_name: advisorRes,
          telefono: pnc.client_phone || '',
          created_at: pnc.created_at,
          created_at_sv: pnc.created_at_sv || '',
          fecha,
          hora,
          pais: paisInf,
        });
      }
    });

    leadsNoCalificadosTransferidos.forEach((l: any) => {
      const k = String(l.codigo_prospecto || l.id || '').trim();
      if (!k) return;
      if (!mapaNc.has(k) && !clientIdsNc.has(k)) {
        const parsedCreado = l.created_at ? parseFechaHoraNcSv(null, l.created_at) : { fecha: '', hora: '' };
        const fRef = l.fecha_creado || parsedCreado.fecha;
        const hRef = l.hora_creado || parsedCreado.hora;
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
          pais: detectarPaisLeadBackend(l),
        });
      }
    });

    const leadsNoCalificados = Array.from(mapaNc.values());

    // Enriquecimiento uniforme de leads, llamadas y Teams
    leadsCalificadosValidos.forEach((l: any) => {
      l.asesor_nombre = resolverAsesorBackend(
        l.asesor_nombre || l.asesor_id,
        l.asesor_nombre ? String(l.asesor_nombre).trim() : 'Asesor General'
      );
      if (!l.nombre_prospecto) l.nombre_prospecto = l.codigo_prospecto ? `Prospecto ${l.codigo_prospecto}` : 'Prospecto Sin Nombre';
      l.pais = detectarPaisLeadBackend(l);
      if (!l.status) l.status = 'Agendado';
    });

    leadsNoCalificados.forEach((l: any) => {
      l.advisor_name = resolverAsesorBackend(
        l.advisor_name,
        l.advisor_name ? String(l.advisor_name).trim() : 'Asesor Asignado'
      );
      l.pais = detectarPaisLeadBackend(l);
      if (!l.campaign_name) l.campaign_name = 'Campaña Inbound';
    });

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

    const pbxFiltrado =
      catalogo.length > 0
        ? pbxDirecto.filter((p: any) => {
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
          })
        : pbxDirecto;

    const celFiltrado =
      catalogo.length > 0
        ? celDirecto.filter((c: any) => {
            const lineaDigits = String(c?.linea ?? '').replace(/\D/g, '');
            if (lineaDigits.length >= 7 && catCelSet.has(lineaDigits.length >= 8 ? lineaDigits.slice(-8) : lineaDigits.slice(-7))) {
              return true;
            }
            const userRaw = String(c?.usuario ?? '').trim().toLowerCase();
            if (userRaw && userRaw !== 'null' && userRaw !== 'undefined') {
              if (catUserSet.has(userRaw) || catNomSet.has(userRaw)) return true;
            }
            return false;
          })
        : celDirecto;

    celFiltrado.forEach((c: any) => {
      c.asesor_nombre = resolverAsesorBackend(c.usuario, resolverAsesorBackend(c.linea, c.usuario || 'Ejecutivo Celular'));
      if (!c.operador) c.operador = 'Claro / Tigo';
      const opUpper = normalizarTexto(c.operador).toUpperCase();
      c.pais =
        normalizarPais(c.pais) ||
        (opUpper.includes('GT') || opUpper.includes('GUATE') ? 'GT' : opUpper.includes('SV') ? 'SV' : null) ||
        detectarPaisTel(c.linea) ||
        detectarPaisPorAsesor(c.asesor_nombre || c.usuario || c.linea) ||
        detectarPaisTel(c.destino) ||
        'SV';
    });

    pbxFiltrado.forEach((p: any) => {
      const extStr = p.extension ? String(p.extension).trim() : '';
      p.asesor_nombre = resolverAsesorBackend(
        extStr,
        resolverAsesorBackend(p.nombre, p.nombre || (extStr ? `Ext. ${extStr}` : 'Línea PBX'))
      );
      p.pais =
        normalizarPais(p.pais) ||
        detectarPaisPorAsesor(extStr || p.asesor_nombre || p.nombre) ||
        detectarPaisTel(p.destino) ||
        'SV';
    });

    // Enriquecer cada llamada PBX con N° Lead y Nombre del Cliente
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
    leadsCalificadosValidos.forEach((l: any) => registrarLeadEnIndice(l, 'calificado'));
    leadsNoCalificados.forEach((l: any) => registrarLeadEnIndice(l, 'no_calificado'));

    pbxFiltrado.forEach((p: any) => {
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
          score -= Math.min(Math.abs(tsPbx - c.fechaTs) / 86400000, 30);
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

    const mapaTeamsExistente = new Map<string, any>();
    teamsRaw.forEach((t: any) => {
      if (t.codigo_prospecto) {
        mapaTeamsExistente.set(String(t.codigo_prospecto).trim().toLowerCase(), t);
      }
    });

    const llamadasTeams = [...teamsRaw];
    leadsCalificadosValidos.forEach((lv: any) => {
      if (esTipoReunionVirtual(lv.tipo_reunion)) {
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
      t.pais =
        normalizarPais(t.pais) ||
        detectarPaisPorAsesor(t.ejecutivo_nombre || t.ejecutivo) ||
        detectarPaisTel(t.telefono) ||
        'SV';
    });

    llamadasWhatsapp.forEach((w: any) => {
      w.asesor_nombre = resolverAsesorBackend(
        w.numero_ejecutivo,
        w.numero_ejecutivo ? `Asesor ${w.numero_ejecutivo}` : 'Asesor WhatsApp'
      );
      if (!w.estado) w.estado = 'Entregado';
      if (!w.direccion) w.direccion = 'Saliente';
      w.pais =
        normalizarPais(w.pais) ||
        detectarPaisPorAsesor(w.asesor_nombre || w.numero_ejecutivo || w.ejecutivo_id) ||
        detectarPaisTel(w.numero_cliente || w.numero_ejecutivo) ||
        'SV';
    });

    const payloadFinal = {
      exito: true,
      timestamp: Date.now(),
      estadisticas: {
        total_leads: leadsCalificadosValidos.length,
        total_leads_no_calificados: leadsNoCalificados.length,
        total_llamadas_pbx: pbxFiltrado.length,
        total_llamadas_celular: celFiltrado.length,
        total_llamadas_whatsapp: llamadasWhatsapp.length,
        total_llamadas_teams: llamadasTeams.length,
        total_catalogo: catalogo.length,
      },
      datos: {
        catalogo,
        leads: leadsCalificadosValidos,
        leadsNoCalificados,
        llamadasPbx: pbxFiltrado,
        llamadasCelular: celFiltrado,
        llamadasTeams,
        llamadasWhatsapp,
      },
    };
    if (!incluirHistorico) {
      cacheDatosVercel = { data: payloadFinal, timestamp: Date.now() };
    }
    return payloadFinal;
  })();

  if (!incluirHistorico) {
    promiseDatosVercel = ejecutar;
  }

  try {
    const payload = await ejecutar;
    return res.status(200).json(payload);
  } catch (error: any) {
    console.error('Error en /api/sync/datos-completos (Vercel):', error);
    if (cacheDatosVercel) {
      return res.status(200).json(cacheDatosVercel.data);
    }
    return res.status(500).json({ exito: false, error: error.message });
  } finally {
    if (!incluirHistorico) {
      promiseDatosVercel = null;
    }
  }
}
