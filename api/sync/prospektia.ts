// Serverless function para Vercel: /api/sync/prospektia
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://sbopifiiyezmvsadwkpg.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3BpZmlpeWV6bXZzYWR3a3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzM0OTYsImV4cCI6MjEwMDMwOTQ5Nn0.ZI5y8lroFF529Xr-Otm1fcq6H2lhbh9e3s-WU9O6I7A';

const supabaseHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

const PROSPEKTIA_HEADERS = {
  'X-API-Key': 'RedApi_2026_SuperSegura_9XK2',
  Accept: 'application/json',
};

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

function normalizarTipoReunion(tipoReunion?: unknown, tipoLlamada?: unknown, tipoAlt?: unknown): string {
  for (const cand of [tipoReunion, tipoLlamada, tipoAlt]) {
    if (cand === null || cand === undefined) continue;
    const raw = String(cand).trim();
    const lower = raw.toLowerCase();
    if (!raw || ['null', 'undefined', 'none', 'n/a', 'na', '-'].includes(lower)) continue;
    return raw;
  }
  return 'Llamada Telefonica';
}

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

function parseFechaHoraNcSv(
  createdAtSv?: string | null,
  createdAtIso?: string | null
): { fecha: string; hora: string } {
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

function esLeadCalificadoValido(lead: any): boolean {
  if (!lead) return false;
  const fAg = lead.fecha_agendada && lead.fecha_agendada !== 'null' ? String(lead.fecha_agendada).trim() : '';
  if (!fAg || fAg.length < 8) return false;

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
    'cliente',
    'lead',
  ];
  if (invalidos.includes(normalizado)) return false;

  return true;
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

const COLS_CATALOGO = 'id,pais,nombre_ejecutivo,usuario,extension,celular';
let cacheCatalogoProspektia: { data: any[]; timestamp: number } | null = null;
const CACHE_CATALOGO_TTL_MS = 5 * 60 * 1000;

async function fetchCatalogoWarm(): Promise<any[]> {
  if (cacheCatalogoProspektia && Date.now() - cacheCatalogoProspektia.timestamp < CACHE_CATALOGO_TTL_MS) {
    return cacheCatalogoProspektia.data;
  }
  const rows = await fetch(
    `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/catalogo?select=${COLS_CATALOGO}&order=id.asc&limit=500`,
    { headers: supabaseHeaders }
  )
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  const arr = Array.isArray(rows) ? rows : [];
  cacheCatalogoProspektia = { data: arr, timestamp: Date.now() };
  return arr;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tInicio = Date.now();
  try {
    const [catalogoRes, prospektiaRes, prospektiaNcItems] = await Promise.all([
      fetchCatalogoWarm(),
      fetch('https://prospektia.red.com.sv/api/external/leads-calificados', {
        headers: PROSPEKTIA_HEADERS,
        cache: 'no-store',
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetchProspektiaNoCalificadosPaginado(),
    ]);

    const catalogo = Array.isArray(catalogoRes) ? catalogoRes : [];

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
      if (cleanDigits && mapaCatalogo.porCelular[cleanDigits]) {
        return mapaCatalogo.porCelular[cleanDigits].nombre_ejecutivo;
      }
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
        const tNorm = norm.split(/\s+/).filter((t) => t.length >= 4);
        const tCat = nomCat.split(/\s+/).filter((t) => t.length >= 4);
        if (tNorm.length > 0 && tCat.length > 0) {
          const comunes = tNorm.filter((t) => tCat.includes(t));
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
        pl.asesor_nombre ? String(pl.asesor_nombre).trim() : 'Asesor General'
      );

      const leadObj: any = {
        id: String(pl.id || cod).trim(),
        codigo_prospecto: cod,
        nombre_prospecto: pl.nombre_prospecto || pl.nombre || `Prospecto ${cod}`,
        telefono: pl.telefono || '',
        fecha_agendada: fAg,
        hora_agendada: hAg,
        fecha_creado: pl.fecha_creado || null,
        hora_creado: pl.hora_creado || null,
        tipo_reunion: normalizarTipoReunion(pl.tipo_reunion, pl.tipo_llamada, pl.tipo),
        pais: pl.pais || '',
        asesor_id: pl.asesor_id ? String(pl.asesor_id) : null,
        asesor_nombre: asesorRes,
        asesor_email: pl.asesor_email || null,
        status: pl.status || 'Agendado',
        created_at:
          pl.created_at ||
          (pl.fecha_creado ? `${pl.fecha_creado}T${pl.hora_creado || '00:00:00'}Z` : new Date().toISOString()),
      };
      leadObj.pais = detectarPaisLeadBackend(leadObj);
      mapaLeads.set(cod, leadObj);
    });

    const todosLosLeads = Array.from(mapaLeads.values());
    const leads: any[] = [];
    const leadsTransferidos: any[] = [];

    todosLosLeads.forEach((l: any) => {
      if (esLeadCalificadoValido(l)) leads.push(l);
      else leadsTransferidos.push(l);
    });

    const mapaNc = new Map<string, any>();
    const clientIdsNc = new Set<string>();
    (Array.isArray(prospektiaNcItems) ? prospektiaNcItems : []).forEach((pnc: any) => {
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
          campaign_name: 'Campaña Inbound',
          pais: paisInf,
        });
      }
    });

    leadsTransferidos.forEach((l: any) => {
      const k = String(l.codigo_prospecto || l.id || '').trim();
      if (!k || mapaNc.has(k) || clientIdsNc.has(k)) return;
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
    });

    const leadsNoCalificados = Array.from(mapaNc.values());

    return res.status(200).json({
      exito: true,
      timestamp: Date.now(),
      tiempo_ms: Date.now() - tInicio,
      estadisticas: {
        total_leads: leads.length,
        total_leads_no_calificados: leadsNoCalificados.length,
        total_nc_sv: leadsNoCalificados.filter((l: any) => l.pais === 'SV').length,
        total_nc_gt: leadsNoCalificados.filter((l: any) => l.pais === 'GT').length,
      },
      datos: {
        catalogo,
        leads,
        leadsNoCalificados,
      },
    });
  } catch (error: any) {
    console.error('Error en /api/sync/prospektia (Vercel):', error);
    return res.status(500).json({ exito: false, error: error.message });
  }
}
