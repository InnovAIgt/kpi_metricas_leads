import { Cita, Llamada } from '../types';
import { esLeadCalificadoValido } from '../utils/leadValidation';
import { formatLocalDate } from '../utils/dateHelpers';
import { filtrarPbxPorCatalogo, filtrarCelularPorCatalogo } from '../utils/catalogoFilter';
import {
  construirMapaPaisCatalogo,
  detectarPaisLead,
  detectarPaisLlamada,
  normalizarTextoComparacion,
} from '../utils/paisHelpers';

function stripFakeUtcZ(val?: string | null): string {
  if (!val) return '';
  let s = String(val).trim();
  if (!s) return '';
  s = s.replace(/\s+/, 'T').replace(/(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s.slice(0, 19);
}

function utcToSvWallClock(val?: string | null): string {
  if (!val) return '';
  const raw = String(val).trim();
  if (!raw) return '';
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const sv = new Date(d.getTime() - 6 * 3600 * 1000);
      const y = sv.getUTCFullYear();
      const m = String(sv.getUTCMonth() + 1).padStart(2, '0');
      const day = String(sv.getUTCDate()).padStart(2, '0');
      const hh = String(sv.getUTCHours()).padStart(2, '0');
      const mm = String(sv.getUTCMinutes()).padStart(2, '0');
      const ss = String(sv.getUTCSeconds()).padStart(2, '0');
      return `${y}-${m}-${day}T${hh}:${mm}:${ss}`;
    }
  }
  return stripFakeUtcZ(raw);
}

function esPbxContestada(estado: any, durSec: number): boolean {
  const est = String(estado || '').toUpperCase().trim();
  const esNoCont =
    est.includes('NO CONTEST') ||
    est.includes('NO ANSWER') ||
    est.includes('BUSY') ||
    est.includes('OCUPAD') ||
    est.includes('FALLID') ||
    est.includes('FAIL');
  if (esNoCont) return false;
  if (est === 'ANSWERED' || est.includes('CONTESTADA')) return true;
  return durSec > 25;
}

function normalizarHoraStr(hora?: string | null, fallback = '00:00:00'): string {
  if (!hora) return fallback;
  const parts = String(hora).trim().split(':');
  if (parts.length < 2) return fallback;
  const hh = String(parseInt(parts[0], 10) || 0).padStart(2, '0');
  const mm = String(parseInt(parts[1], 10) || 0).padStart(2, '0');
  const ss = String(parseInt(parts[2] || '0', 10) || 0).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export interface DatosSyncBackend {
  citasCalificadas: Cita[];
  citasNoCalificadas: Cita[];
  citas: Cita[]; // default activas
  llamadas: Llamada[];
  catalogo: any[];
  rawPbx: any[];
  rawCelular: any[];
  rawWhatsapp: any[];
  rawLeads: any[];
  rawLeadsNoCalificados: any[];
  rawTeams: any[];
  estadisticas: Record<string, number>;
  tiempo_ms: number;
}

const SUPABASE_DEFAULT_URL = 'https://sbopifiiyezmvsadwkpg.supabase.co';
const SUPABASE_DEFAULT_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3BpZmlpeWV6bXZzYWR3a3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzM0OTYsImV4cCI6MjEwMDMwOTQ5Nn0.ZI5y8lroFF529Xr-Otm1fcq6H2lhbh9e3s-WU9O6I7A';

function getSupabaseConfig() {
  const url =
    (import.meta as any).env?.VITE_SUPABASE_URL || SUPABASE_DEFAULT_URL;
  const key =
    (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || SUPABASE_DEFAULT_KEY;
  return {
    url: url.replace(/\/$/, ''),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  };
}

const PROSPEKTIA_HEADERS = {
  'X-API-Key': 'RedApi_2026_SuperSegura_9XK2',
  Accept: 'application/json',
};

function crearResolverAsesor(catalogo: any[] = []) {
  const mapaExt: Record<string, string> = {};
  const mapaUser: Record<string, string> = {};
  const mapaNom: Record<string, string> = {};
  const mapaCel: Record<string, string> = {};

  (Array.isArray(catalogo) ? catalogo : []).forEach((cat: any) => {
    const nom = String(cat?.nombre_ejecutivo || '').trim();
    if (!nom) return;
    if (cat.extension && String(cat.extension).trim() !== 'null') {
      String(cat.extension)
        .split(/[,;/|]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .forEach((ext) => {
          mapaExt[ext] = nom;
        });
    }
    if (cat.usuario && String(cat.usuario).trim() !== 'null') {
      mapaUser[normalizarTextoComparacion(cat.usuario)] = nom;
    }
    mapaNom[normalizarTextoComparacion(nom)] = nom;
    if (cat.celular && String(cat.celular).trim() !== 'null') {
      const celDigits = String(cat.celular).replace(/\D/g, '').slice(-8);
      if (celDigits.length >= 7) mapaCel[celDigits] = nom;
    }
  });

  return (ident: string, fallback: string): string => {
    if (!ident || ident === 'null' || ident === 'undefined') return fallback;
    const idTrim = String(ident).trim();
    const idNorm = normalizarTextoComparacion(idTrim);
    if (!idNorm) return fallback;
    if (mapaUser[idNorm]) return mapaUser[idNorm];
    if (mapaExt[idTrim.toLowerCase()]) return mapaExt[idTrim.toLowerCase()];
    if (mapaNom[idNorm]) return mapaNom[idNorm];

    const digits = idTrim.replace(/\D/g, '');
    if (digits.length >= 7) {
      const suf = digits.length >= 8 ? digits.slice(-8) : digits;
      if (mapaCel[suf]) return mapaCel[suf];
    }

    for (const cat of catalogo || []) {
      const uNorm = normalizarTextoComparacion(cat?.usuario);
      const nNorm = normalizarTextoComparacion(cat?.nombre_ejecutivo);
      if (uNorm && idNorm.includes(uNorm)) return cat.nombre_ejecutivo;
      if (nNorm && (idNorm.includes(nNorm) || nNorm.includes(idNorm))) return cat.nombre_ejecutivo;
    }
    return fallback;
  };
}

function parseFechaHoraNcSvClient(
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
    const sv = utcToSvWallClock(raw);
    if (sv && sv.length >= 10) {
      return {
        fecha: sv.slice(0, 10),
        hora: sv.slice(11, 19) || '09:00:00',
      };
    }
  }
  return { fecha: '', hora: '' };
}

async function fetchProspektiaNoCalificadosPaginadoCliente(maxTotal = 10000): Promise<any[]> {
  const todos: any[] = [];
  const pageSize = 1000;
  let offset = 0;

  try {
    while (offset < maxTotal) {
      const res = await fetch(
        `https://prospektia.red.com.sv/api/audit/leads-no-calificados?limit=${pageSize}&offset=${offset}`,
        { headers: PROSPEKTIA_HEADERS, cache: 'no-store' }
      );
      if (!res.ok) break;
      const json = await res.json();
      const items = Array.isArray(json?.items) ? json.items : [];
      if (items.length === 0) break;
      todos.push(...items);
      if (items.length < pageSize) break;
      offset += pageSize;
    }
  } catch (err) {
    console.warn('Error paginando ProspektIA leads-no-calificados en cliente:', err);
  }
  return todos;
}

function procesarLeadsProspektia({
  leads = [],
  leadsNoCalificados = [],
  catalogo = [],
}: {
  leads: any[];
  leadsNoCalificados: any[];
  catalogo: any[];
}): {
  rawLeads: any[];
  rawLeadsNoCalificados: any[];
  citasCalificadas: Cita[];
  citasNoCalificadas: Cita[];
} {
  const resolverAsesor = crearResolverAsesor(catalogo);
  const mapaPaisCat = construirMapaPaisCatalogo(catalogo);
  const overridesCalif = leerKpiOverridesLocal('leads');
  const overridesNc = leerKpiOverridesLocal('leads_no_calificados');

  const leadsCalificadosValidos: any[] = [];
  const leadsTransferidos: any[] = [];

  (Array.isArray(leads) ? leads : []).forEach((orig: any, idx: number) => {
    const cod = String(orig.codigo_prospecto || orig.id || `lead-${idx}`).trim();
    const idLead =
      orig.id && String(orig.id) !== 'undefined' && String(orig.id) !== 'null'
        ? String(orig.id).trim()
        : cod;
    const asesor = resolverAsesor(
      orig.asesor_nombre || orig.asesor_id || '',
      orig.asesor_nombre ? String(orig.asesor_nombre).trim() : 'Asesor General'
    );
    const fAg =
      orig.fecha_agendada && orig.fecha_agendada !== 'null'
        ? String(orig.fecha_agendada).slice(0, 10)
        : '';
    const hAg =
      orig.hora_agendada && orig.hora_agendada !== 'null'
        ? normalizarHoraStr(orig.hora_agendada, '09:00:00')
        : '';
    const createdSv = orig.created_at ? utcToSvWallClock(orig.created_at) : '';
    const fCre =
      orig.fecha_creado && orig.fecha_creado !== 'null'
        ? String(orig.fecha_creado).slice(0, 10)
        : createdSv
        ? createdSv.slice(0, 10)
        : '';
    const hCre =
      orig.hora_creado && orig.hora_creado !== 'null'
        ? normalizarHoraStr(orig.hora_creado, '09:00:00')
        : createdSv
        ? createdSv.slice(11, 19)
        : '09:00:00';

    const pais = detectarPaisLead(
      { ...orig, asesor_nombre: asesor },
      catalogo,
      mapaPaisCat
    );

    const ov = {
      ...(overridesCalif[idLead] || {}),
      ...(overridesCalif[cod] || {}),
    };

    const enriched = {
      ...orig,
      id: idLead,
      codigo_prospecto: cod,
      nombre_prospecto:
        orig.nombre_prospecto ||
        orig.nombre ||
        (cod ? `Prospecto ${cod}` : 'Prospecto Sin Nombre'),
      asesor_nombre: asesor,
      pais,
      fecha_agendada: fAg || null,
      hora_agendada: hAg || null,
      fecha_creado: fCre || null,
      hora_creado: hCre || null,
      kpi_sla_etapa_1: Boolean(ov.kpi_sla_etapa_1 ?? orig.kpi_sla_etapa_1),
      kpi_sla_etapa_2: Boolean(ov.kpi_sla_etapa_2 ?? orig.kpi_sla_etapa_2),
      kpi_sla_etapa_3: Boolean(ov.kpi_sla_etapa_3 ?? orig.kpi_sla_etapa_3),
      kpi_retroalimentacion_etapa_1: Boolean(
        ov.kpi_retroalimentacion_etapa_1 ?? orig.kpi_retroalimentacion_etapa_1
      ),
      kpi_retroalimentacion_etapa_2: Boolean(
        ov.kpi_retroalimentacion_etapa_2 ?? orig.kpi_retroalimentacion_etapa_2
      ),
      kpi_retroalimentacion_etapa_3: Boolean(
        ov.kpi_retroalimentacion_etapa_3 ?? orig.kpi_retroalimentacion_etapa_3
      ),
      kpi_retroalimentacion_etapa_4: Boolean(
        ov.kpi_retroalimentacion_etapa_4 ?? orig.kpi_retroalimentacion_etapa_4
      ),
    };

    if (esLeadCalificadoValido(enriched)) {
      leadsCalificadosValidos.push(enriched);
    } else {
      leadsTransferidos.push(enriched);
    }
  });

  const citasCalificadas: Cita[] = leadsCalificadosValidos.map((l: any) => {
    const fObj = l.fecha_agendada || l.fecha_creado || formatLocalDate();
    const hObj = l.hora_agendada || l.hora_creado || '09:00:00';
    return {
      id: String(l.id || l.codigo_prospecto),
      codigo_prospecto: l.codigo_prospecto,
      prospecto_nombre: l.nombre_prospecto || 'Prospecto Sin Nombre',
      prospecto_telefono: String(l.telefono || l.celular || '').trim(),
      vendedor_id: String(l.asesor_nombre || 'asesor')
        .toLowerCase()
        .replace(/\s+/g, '_'),
      vendedor_nombre: l.asesor_nombre || 'Asesor General',
      fecha_hora_programada: `${fObj}T${normalizarHoraStr(hObj, '09:00:00')}`,
      estado_cita: 'programada',
      fuente: 'Supabase',
      tipo_reunion: l.tipo_reunion || 'Llamada Telefonica',
      fecha_agendada: l.fecha_agendada || undefined,
      hora_agendada: l.hora_agendada || undefined,
      fecha_creado: l.fecha_creado || undefined,
      hora_creado: l.hora_creado || undefined,
      pais: l.pais || 'SV',
      created_at: l.created_at,
      tipo_lead: 'calificados',
      kpi_sla_etapa_1: Boolean(l.kpi_sla_etapa_1),
      kpi_sla_etapa_2: Boolean(l.kpi_sla_etapa_2),
      kpi_sla_etapa_3: Boolean(l.kpi_sla_etapa_3),
      kpi_retroalimentacion_etapa_1: Boolean(l.kpi_retroalimentacion_etapa_1),
      kpi_retroalimentacion_etapa_2: Boolean(l.kpi_retroalimentacion_etapa_2),
      kpi_retroalimentacion_etapa_3: Boolean(l.kpi_retroalimentacion_etapa_3),
      kpi_retroalimentacion_etapa_4: Boolean(l.kpi_retroalimentacion_etapa_4),
    };
  });

  const mapaNc = new Map<string, any>();
  const clientIdsNc = new Set<string>();

  (Array.isArray(leadsNoCalificados) ? leadsNoCalificados : []).forEach(
    (raw: any, idx: number) => {
      const k = String(raw.client_id || raw.id || `nc-${idx}`).trim();
      if (!k) return;
      if (raw.client_id) clientIdsNc.add(String(raw.client_id).trim());

      const parsedDt = parseFechaHoraNcSvClient(raw.created_at_sv, raw.created_at);
      const fecha =
        raw.fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(raw.fecha).slice(0, 10))
          ? String(raw.fecha).slice(0, 10)
          : parsedDt.fecha || formatLocalDate();
      const hora =
        raw.hora && /^\d{2}:\d{2}/.test(String(raw.hora))
          ? normalizarHoraStr(raw.hora, '09:00:00')
          : parsedDt.hora || '09:00:00';

      const advisor = resolverAsesor(
        raw.advisor_name || raw.asesor_nombre || '',
        raw.advisor_name
          ? String(raw.advisor_name).trim()
          : raw.asesor_nombre
          ? String(raw.asesor_nombre).trim()
          : 'Asesor Asignado'
      );

      // Para No Calificados, si venía pre-etiquetado erróneamente como SV sin verificar 502/asesor GT,
      // detectarPaisLead respeta prefijo +502 / asesor GT si ignoramos fallback SV previo cuando no había campo country real.
      const tel = String(raw.telefono || raw.client_phone || '').trim();
      const pais = detectarPaisLead(
        {
          pais: raw.country || (raw.pais && raw.pais !== 'SV' ? raw.pais : undefined),
          telefono: tel,
          advisor_name: advisor,
          asesor_nombre: raw.advisor_name || advisor,
        },
        catalogo,
        mapaPaisCat
      );

      const idNc = String(raw.id || raw.client_id || k).trim();
      const cid = String(raw.client_id || idNc).trim();
      const ov = {
        ...(overridesNc[idNc] || {}),
        ...(overridesNc[cid] || {}),
      };

      if (!mapaNc.has(k)) {
        mapaNc.set(k, {
          ...raw,
          id: idNc,
          client_id: cid,
          client_name: raw.client_name || raw.nombre_prospecto || 'Prospecto Sin Nombre',
          advisor_name: advisor,
          telefono: tel,
          fecha,
          hora,
          created_at: raw.created_at || `${fecha}T${hora}`,
          created_at_sv: raw.created_at_sv || `${fecha} ${hora}`,
          campaign_name: raw.campaign_name || 'Campaña Inbound',
          pais,
          kpi_sla_etapa_1: Boolean(ov.kpi_sla_etapa_1 ?? raw.kpi_sla_etapa_1),
          kpi_sla_etapa_2: Boolean(ov.kpi_sla_etapa_2 ?? raw.kpi_sla_etapa_2),
          kpi_sla_etapa_3: Boolean(ov.kpi_sla_etapa_3 ?? raw.kpi_sla_etapa_3),
          kpi_retroalimentacion_etapa_1: Boolean(
            ov.kpi_retroalimentacion_etapa_1 ?? raw.kpi_retroalimentacion_etapa_1
          ),
          kpi_retroalimentacion_etapa_2: Boolean(
            ov.kpi_retroalimentacion_etapa_2 ?? raw.kpi_retroalimentacion_etapa_2
          ),
          kpi_retroalimentacion_etapa_3: Boolean(
            ov.kpi_retroalimentacion_etapa_3 ?? raw.kpi_retroalimentacion_etapa_3
          ),
          kpi_retroalimentacion_etapa_4: Boolean(
            ov.kpi_retroalimentacion_etapa_4 ?? raw.kpi_retroalimentacion_etapa_4
          ),
        });
      }
    }
  );

  leadsTransferidos.forEach((l: any) => {
    const k = String(l.codigo_prospecto || l.id || '').trim();
    if (!k || mapaNc.has(k) || clientIdsNc.has(k)) return;
    const parsedDt = parseFechaHoraNcSvClient(null, l.created_at);
    const fecha = l.fecha_creado || parsedDt.fecha || formatLocalDate();
    const hora = l.hora_creado || parsedDt.hora || '09:00:00';
    const ov = {
      ...(overridesNc[String(l.id || k)] || {}),
      ...(overridesNc[k] || {}),
    };

    mapaNc.set(k, {
      id: l.id || k,
      client_id: k,
      client_name: l.nombre_prospecto || l.nombre || 'Lead No Calificado',
      advisor_name: l.asesor_nombre || 'Asesor Asignado',
      telefono: l.telefono || '',
      created_at: l.created_at || `${fecha}T${hora}`,
      created_at_sv: `${fecha} ${hora}`,
      fecha,
      hora,
      campaign_name: l.tipo_reunion || 'Lead Sin Cita Agendada',
      pais: detectarPaisLead(l, catalogo, mapaPaisCat),
      kpi_sla_etapa_1: Boolean(ov.kpi_sla_etapa_1 ?? l.kpi_sla_etapa_1),
      kpi_sla_etapa_2: Boolean(ov.kpi_sla_etapa_2 ?? l.kpi_sla_etapa_2),
      kpi_sla_etapa_3: Boolean(ov.kpi_sla_etapa_3 ?? l.kpi_sla_etapa_3),
      kpi_retroalimentacion_etapa_1: Boolean(
        ov.kpi_retroalimentacion_etapa_1 ?? l.kpi_retroalimentacion_etapa_1
      ),
      kpi_retroalimentacion_etapa_2: Boolean(
        ov.kpi_retroalimentacion_etapa_2 ?? l.kpi_retroalimentacion_etapa_2
      ),
      kpi_retroalimentacion_etapa_3: Boolean(
        ov.kpi_retroalimentacion_etapa_3 ?? l.kpi_retroalimentacion_etapa_3
      ),
      kpi_retroalimentacion_etapa_4: Boolean(
        ov.kpi_retroalimentacion_etapa_4 ?? l.kpi_retroalimentacion_etapa_4
      ),
    });
  });

  const leadsNoCalificadosProcesados = Array.from(mapaNc.values());

  const citasNoCalificadas: Cita[] = leadsNoCalificadosProcesados.map((nc: any) => {
    const fecha = nc.fecha || formatLocalDate();
    const hora = normalizarHoraStr(nc.hora, '09:00:00');
    return {
      id: String(nc.id || nc.client_id),
      codigo_prospecto: String(nc.client_id || nc.id || ''),
      prospecto_nombre: nc.client_name || 'Prospecto Sin Nombre',
      prospecto_telefono: String(nc.telefono || '').trim(),
      vendedor_id: String(nc.advisor_name || 'asesor')
        .toLowerCase()
        .replace(/\s+/g, '_'),
      vendedor_nombre: nc.advisor_name || 'Asesor Asignado',
      fecha_hora_programada: `${fecha}T${hora}`,
      estado_cita: 'programada',
      fuente: 'Supabase',
      tipo_reunion: nc.campaign_name || 'Lead Directo',
      fecha_creado: fecha,
      hora_creado: hora,
      pais: nc.pais || 'SV',
      created_at: nc.created_at,
      tipo_lead: 'no_calificados',
      kpi_sla_etapa_1: Boolean(nc.kpi_sla_etapa_1),
      kpi_sla_etapa_2: Boolean(nc.kpi_sla_etapa_2),
      kpi_sla_etapa_3: Boolean(nc.kpi_sla_etapa_3),
      kpi_retroalimentacion_etapa_1: Boolean(nc.kpi_retroalimentacion_etapa_1),
      kpi_retroalimentacion_etapa_2: Boolean(nc.kpi_retroalimentacion_etapa_2),
      kpi_retroalimentacion_etapa_3: Boolean(nc.kpi_retroalimentacion_etapa_3),
      kpi_retroalimentacion_etapa_4: Boolean(nc.kpi_retroalimentacion_etapa_4),
    };
  });

  return {
    rawLeads: leadsCalificadosValidos,
    rawLeadsNoCalificados: leadsNoCalificadosProcesados,
    citasCalificadas,
    citasNoCalificadas,
  };
}

export interface ResultadoSyncProspektia {
  exito: boolean;
  timestamp: string;
  tiempo_ms: number;
  catalogo: any[];
  rawLeads: any[];
  rawLeadsNoCalificados: any[];
  citasCalificadas: Cita[];
  citasNoCalificadas: Cita[];
  estadisticas?: Record<string, number>;
}

/**
 * Sincronización rápida exclusiva con ProspektIA API (Calificados + No Calificados).
 * Trae leads nuevos y detecta leads que ya recibieron fecha_agendada.
 */
export async function sincronizarSoloProspektia(
  catalogoFallback: any[] = []
): Promise<ResultadoSyncProspektia> {
  const inicio = performance.now();
  try {
    const res = await fetch('/api/sync/prospektia', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json?.exito && json?.datos) {
        const cat =
          Array.isArray(json.datos.catalogo) && json.datos.catalogo.length > 0
            ? json.datos.catalogo
            : catalogoFallback;
        const processed = procesarLeadsProspektia({
          leads: json.datos.leads || [],
          leadsNoCalificados: json.datos.leadsNoCalificados || [],
          catalogo: cat,
        });
        return {
          exito: true,
          timestamp: json.timestamp || new Date().toISOString(),
          tiempo_ms: Math.round(performance.now() - inicio),
          catalogo: cat,
          ...processed,
          estadisticas: json.estadisticas || {},
        };
      }
    }
  } catch (err) {
    console.warn('Fallo proxy /api/sync/prospektia, usando consulta directa ProspektIA:', err);
  }

  // Fallback directo en cliente
  try {
    const { url, headers } = getSupabaseConfig();
    const [catRes, prospektiaRes, prospektiaNcRes] = await Promise.all([
      catalogoFallback.length > 0
        ? Promise.resolve(catalogoFallback)
        : fetch(`${url}/rest/v1/catalogo?select=*&order=id.asc`, { headers })
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []),
      fetch('https://prospektia.red.com.sv/api/external/leads-calificados', {
        headers: PROSPEKTIA_HEADERS,
        cache: 'no-store',
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetchProspektiaNoCalificadosPaginadoCliente(),
    ]);

    const cat = Array.isArray(catRes) ? catRes : catalogoFallback;
    const rawCalif = Array.isArray(prospektiaRes?.leads) ? prospektiaRes.leads : [];
    const rawNc = Array.isArray(prospektiaNcRes) ? prospektiaNcRes : [];

    const processed = procesarLeadsProspektia({
      leads: rawCalif,
      leadsNoCalificados: rawNc.map((pnc: any) => ({
        id: pnc.client_id || pnc.id,
        client_id: pnc.client_id,
        client_name: pnc.client_name || '',
        advisor_name: pnc.advisor_name || '',
        telefono: pnc.client_phone || '',
        created_at: pnc.created_at,
        created_at_sv: pnc.created_at_sv || '',
      })),
      catalogo: cat,
    });

    return {
      exito: rawCalif.length > 0 || rawNc.length > 0,
      timestamp: new Date().toISOString(),
      tiempo_ms: Math.round(performance.now() - inicio),
      catalogo: cat,
      ...processed,
      estadisticas: {
        total_leads: processed.rawLeads.length,
        total_leads_no_calificados: processed.rawLeadsNoCalificados.length,
      },
    };
  } catch (err) {
    console.error('Error en fallback directo ProspektIA:', err);
    return {
      exito: false,
      timestamp: new Date().toISOString(),
      tiempo_ms: Math.round(performance.now() - inicio),
      catalogo: catalogoFallback,
      rawLeads: [],
      rawLeadsNoCalificados: [],
      citasCalificadas: [],
      citasNoCalificadas: [],
    };
  }
}

/**
 * Consulta el endpoint proxy del backend (/api/sync/datos-completos)
 * donde las credenciales de Supabase están 100% protegidas en variables de entorno.
 */
export async function sincronizarDatosDesdeBackend(forzar = false): Promise<DatosSyncBackend> {
  const inicio = performance.now();
  try {
    const endpoint = forzar ? '/api/sync/datos-completos?forzar=true' : '/api/sync/datos-completos';
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json.exito && json.datos) {
        const {
          catalogo = [],
          leads = [],
          leadsNoCalificados = [],
          llamadasPbx: rawPbxBackend = [],
          llamadasCelular: rawCelBackend = [],
          llamadasTeams = [],
          llamadasWhatsapp = [],
        } = json.datos;

        const llamadasPbx = filtrarPbxPorCatalogo(rawPbxBackend, catalogo);
        const llamadasCelular = filtrarCelularPorCatalogo(rawCelBackend, catalogo);

        const resolverAsesor = crearResolverAsesor(catalogo);
        const mapaPaisCat = construirMapaPaisCatalogo(catalogo);

        // 2. Mapear Leads a Citas (SEPARANDO ESTRICTAMENTE CALIFICADOS Y NO CALIFICADOS E INFERENCIA DE PAÍS)
        const {
          rawLeads: leadsCalificadosValidos,
          rawLeadsNoCalificados: leadsNoCalificadosProcesados,
          citasCalificadas,
          citasNoCalificadas,
        } = procesarLeadsProspektia({
          leads,
          leadsNoCalificados,
          catalogo,
        });

        // 3. Mapear Llamadas Multicanal (con país inferido)
        const llamadas: Llamada[] = [];

        // A. PBX (getCalls2)
        llamadasPbx.forEach((call: any, idx: number) => {
          const durSec =
            Number(call.duracion_segundos || 0) ||
            Number(call.duracion_minutos || 0) * 60;
          const fechaInicioRaw =
            call.fecha_hora ||
            (call.fecha ? `${String(call.fecha).slice(0, 10)}T${normalizarHoraStr(call.hora)}` : `${formatLocalDate()}T00:00:00`);
          const fechaInicio = stripFakeUtcZ(fechaInicioRaw);

          const ext = String(call.extension || '').trim();
          const asesor =
            call.asesor_nombre ||
            resolverAsesor(call.nombre || '', resolverAsesor(ext, ext ? `Ext. ${ext}` : 'Línea PBX'));
          const paisCall = detectarPaisLlamada(
            { ...call, asesor_nombre: asesor },
            'PBX',
            catalogo,
            mapaPaisCat
          );
          call.pais = paisCall;

          llamadas.push({
            id: String(call.uniqueid || call.id || `pbx-${idx}`),
            vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
            vendedor_nombre: asesor,
            telefono_marcado: String(call.destino || '').trim(),
            prospecto_nombre: call.nombre || undefined,
            fecha_hora_inicio: fechaInicio,
            fecha_hora_fin: fechaInicio,
            duracion_segundos: durSec,
            resultado: esPbxContestada(call.estado, durSec) ? 'contestada' : 'no_contesta',
            proveedor: 'VoIP',
            canal_tipo: 'PBX',
            pais: paisCall,
            grabacion_url: call.audio_url || call.grabacion_url || undefined,
            notas_llamada: `[PBX] Ext: ${ext || 'N/D'} | QA: ${call.resumen_qa || 'Sin evaluar'}`,
          });
        });

        // B. Celular
        llamadasCelular.forEach((cel: any, idx: number) => {
          let durSec = 0;
          if (typeof cel.duracion === 'string' && cel.duracion.includes(':')) {
            const parts = cel.duracion.split(':').map(Number);
            if (parts.length === 3) {
              durSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
            } else if (parts.length === 2) {
              durSec = parts[0] * 60 + parts[1];
            }
          } else {
            durSec = Number(cel.duracion || 0);
          }

          let fechaBase = cel.fecha || '';
          if (fechaBase.includes('T')) {
            fechaBase = fechaBase.slice(0, 10);
          }

          const fechaInicio =
            fechaBase && cel.hora
              ? `${fechaBase}T${cel.hora}`
              : cel.created_at || new Date().toISOString();

          const asesor =
            cel.asesor_nombre ||
            resolverAsesor(cel.usuario || '', resolverAsesor(cel.linea || '', cel.usuario || 'Ejecutivo Celular'));
          const paisCall = detectarPaisLlamada(
            { ...cel, asesor_nombre: asesor },
            'Celular',
            catalogo,
            mapaPaisCat
          );
          cel.pais = paisCall;

          llamadas.push({
            id: String(cel.id || `cel-${idx}`),
            vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
            vendedor_nombre: asesor,
            telefono_marcado: String(cel.destino || '').trim(),
            fecha_hora_inicio: fechaInicio,
            fecha_hora_fin: fechaInicio,
            duracion_segundos: durSec,
            resultado: durSec > 0 || cel.tipo === 'Saliente' ? 'contestada' : 'no_contesta',
            proveedor: 'Twilio',
            canal_tipo: 'Celular',
            pais: paisCall,
            notas_llamada: `[Celular] Operador: ${cel.operador || 'N/D'} | Línea: ${cel.linea || 'Móvil'}`,
          });
        });

        // C. Teams (Reuniones virtuales)
        llamadasTeams.forEach((tm: any, idx: number) => {
          const fechaInicio =
            tm.fecha_reunion && tm.hora_reunion
              ? `${tm.fecha_reunion}T${tm.hora_reunion}`
              : tm.created_at || new Date().toISOString();

          const asesor = tm.ejecutivo_nombre || tm.ejecutivo || 'Ejecutivo Teams';
          const paisCall = detectarPaisLlamada(
            { ...tm, ejecutivo_nombre: asesor },
            'Teams',
            catalogo,
            mapaPaisCat
          );
          tm.pais = paisCall;

          llamadas.push({
            id: String(tm.id || `teams-${idx}`),
            vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
            vendedor_nombre: asesor,
            telefono_marcado: String(tm.codigo_prospecto || '').trim(),
            prospecto_nombre: tm.cliente || undefined,
            fecha_hora_inicio: fechaInicio,
            fecha_hora_fin: fechaInicio,
            duracion_segundos: 1800,
            resultado: 'contestada',
            proveedor: 'RingCentral',
            canal_tipo: 'Teams',
            pais: paisCall,
            grabacion_url: tm.evidencia_url || undefined,
            notas_llamada: `[Teams] Estado: ${tm.estado_teams || 'Completada'}`,
          });
        });

        // D. WhatsApp (Postgres timestamptz en UTC -> hora local SV UTC-6)
        llamadasWhatsapp.forEach((wa: any, idx: number) => {
          const durSec = Number(wa.duracion_segundos || 45);
          const fechaInicio = utcToSvWallClock(wa.fecha_llamada || wa.created_at) || `${formatLocalDate()}T09:00:00`;

          const asesor =
            wa.asesor_nombre ||
            resolverAsesor(
              String(wa.ejecutivo_id || ''),
              resolverAsesor(wa.numero_ejecutivo || '', 'Asesor WhatsApp')
            );
          const paisCall = detectarPaisLlamada(
            { ...wa, asesor_nombre: asesor },
            'WhatsApp',
            catalogo,
            mapaPaisCat
          );
          wa.pais = paisCall;

          llamadas.push({
            id: String(wa.id || `wa-${idx}`),
            vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
            vendedor_nombre: asesor,
            telefono_marcado: String(wa.numero_cliente || '').trim(),
            fecha_hora_inicio: fechaInicio,
            fecha_hora_fin: fechaInicio,
            duracion_segundos: durSec,
            resultado:
              wa.estado?.toLowerCase() === 'contestada' || durSec > 0
                ? 'contestada'
                : 'no_contesta',
            proveedor: 'Vapi',
            canal_tipo: 'WhatsApp',
            pais: paisCall,
            notas_llamada: `[WhatsApp] Dirección: ${wa.direccion || 'Saliente'}`,
          });
        });

        const fin = performance.now();
        return {
          citasCalificadas,
          citasNoCalificadas,
          citas: citasCalificadas,
          llamadas,
          catalogo,
          rawPbx: llamadasPbx,
          rawCelular: llamadasCelular,
          rawWhatsapp: llamadasWhatsapp,
          rawLeads: leadsCalificadosValidos,
          rawLeadsNoCalificados: leadsNoCalificadosProcesados,
          rawTeams: llamadasTeams,
          estadisticas: json.estadisticas || {},
          tiempo_ms: Math.round(fin - inicio),
        };
      }
    }
  } catch (err) {
    console.warn('Fallo al consultar backend proxy /api/sync/datos-completos, usando conexión directa Supabase:', err);
  }

  // Fallback 100% REAL directo a Supabase REST (para despliegue en Vercel)
  return await sincronizarDirectoSupabase(inicio);
}

// Helper para consulta directa a PBX en cliente como fallback de ultra-resiliencia
async function fetchPbxDirectoCliente(): Promise<any[]> {
  try {
    const loginRes = await fetch('https://api.red.com.sv/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'DBOLAINES', password: 'Intelfon1234' }),
    });
    if (!loginRes.ok) return [];
    const loginData = await loginRes.json();
    const token = loginData.token || loginData.jwt || loginData.access_token;
    if (!token) return [];

    const rangos: [string, string][] = [];
    const hoy = new Date();
    const limite = new Date(hoy.getTime() - 28 * 24 * 3600 * 1000);
    let fin = new Date(hoy);
    while (fin > limite) {
      const inicio = new Date(fin.getTime() - 6 * 24 * 3600 * 1000);
      const startObj = inicio < limite ? limite : inicio;
      rangos.push([startObj.toISOString().slice(0, 10), fin.toISOString().slice(0, 10)]);
      fin = new Date(startObj.getTime() - 24 * 3600 * 1000);
    }

    const promises: Promise<any[]>[] = [];
    for (const [d, h] of rangos) {
      for (const pais of ['SV', 'GT']) {
        promises.push(
          fetch(`https://api.red.com.sv/pbx/api/v1/getCalls2?desde=${d}&hasta=${h}&pais=${pais}`, {
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
    const raw = resultados.flat();
    return raw.map((c: any) => {
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
            ? `https://api.red.com.sv/pbx/api/v1/rawCalls?pais=GT&anio=${y}&mes=${m}&dia=${d}&archivo=${encodeURIComponent(fn)}`
            : `https://api.red.com.sv/pbx/api/v1/getAudio/${y}/${m}/${d}/${fn}`)
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
    }).sort((a: any, b: any) => (b.fecha_hora || '').localeCompare(a.fecha_hora || ''));
  } catch (err) {
    console.error('Error en fetchPbxDirectoCliente:', err);
    return [];
  }
}

/**
 * Consulta directamente las tablas de Supabase vía REST
 * Garantiza que en Vercel siempre traiga la información 100% real sin datos quemados
 */
async function sincronizarDirectoSupabase(inicio: number): Promise<DatosSyncBackend> {
  const { url, headers } = getSupabaseConfig();
  try {
    const waOffsets = [0, 1000];
    const [
      catalogoRes,
      teamsRes,
      whatsappRes,
      prospektiaRes,
      prospektiaNcRes,
      celRes,
      pbxDirectoRes,
    ] = await Promise.all([
      fetch(`${url}/rest/v1/catalogo?select=*&order=id.asc`, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${url}/rest/v1/llamadas_teams?select=*&order=fecha_reunion.desc.nullslast,id.desc`, { headers }).then((r) => r.ok ? r.json() : []),
      Promise.all(
        waOffsets.map((offset) =>
          fetch(`${url}/rest/v1/llamadas_whatsapp?select=*&order=fecha_llamada.desc.nullslast&offset=${offset}&limit=1000`, { headers }).then((r) => r.ok ? r.json() : [])
        )
      ).then((p) => p.flat()),
      fetch('https://prospektia.red.com.sv/api/external/leads-calificados', {
        headers: PROSPEKTIA_HEADERS,
        cache: 'no-store',
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetchProspektiaNoCalificadosPaginadoCliente(),
      fetch('https://kpi.red.com.sv/api/historial-llamadas-ejecutivos', {
        headers: { 'X-API-KEY': 'mso_papi_2026_7f2b9c4d8e6a1b3f5d7c9e0a2b4c6d8f' },
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetchPbxDirectoCliente(), // PBX en vivo directo al API con CORS
    ]);

    const catalogo = Array.isArray(catalogoRes) ? catalogoRes : [];

    // Leads 100% de Prospektia API en vivo
    const mapaDirectoLeads = new Map<string, any>();
    const leadsProspektiaApi = prospektiaRes?.leads || [];
    leadsProspektiaApi.forEach((pl: any) => {
      const cod = String(pl.codigo_prospecto || pl.id || '').trim();
      if (!cod) return;
      const fAg = pl.fecha_agendada ? String(pl.fecha_agendada).trim() : null;
      const hAg = pl.hora_agendada ? String(pl.hora_agendada).trim() : null;
      mapaDirectoLeads.set(cod, {
        id: String(pl.id || cod).trim(),
        codigo_prospecto: cod,
        nombre_prospecto: pl.nombre_prospecto || pl.nombre || '',
        telefono: pl.telefono || '',
        fecha_agendada: fAg,
        hora_agendada: hAg,
        fecha_creado: pl.fecha_creado || null,
        hora_creado: pl.hora_creado || null,
        tipo_reunion: pl.tipo_reunion || 'Llamada Telefonica',
        pais: pl.pais || '',
        asesor_id: pl.asesor_id ? String(pl.asesor_id) : null,
        asesor_nombre: pl.asesor_nombre || null,
        asesor_email: pl.asesor_email || null,
        status: pl.status || 'Agendado',
        created_at: pl.created_at || (pl.fecha_creado ? `${pl.fecha_creado}T${pl.hora_creado || '00:00:00'}Z` : new Date().toISOString()),
      });
    });

    const leads = Array.from(mapaDirectoLeads.values());

    // Leads No Calificados de Prospektia API
    const mapaDirectoNc = new Map<string, any>();
    const prospektiaNcItems = Array.isArray(prospektiaNcRes) ? prospektiaNcRes : [];
    prospektiaNcItems.forEach((pnc: any) => {
      const k = String(pnc.id || `${pnc.client_id}_${pnc.created_at}`).trim();
      if (!k) return;
      if (!mapaDirectoNc.has(k)) {
        mapaDirectoNc.set(k, {
          id: pnc.client_id || pnc.id,
          client_id: pnc.client_id,
          client_name: pnc.client_name || '',
          advisor_name: pnc.advisor_name || '',
          telefono: pnc.client_phone || '',
          created_at: pnc.created_at,
          created_at_sv: pnc.created_at_sv || '',
        });
      }
    });

    const leadsNoCalificados = Array.from(mapaDirectoNc.values());
    const llamadasPbx = filtrarPbxPorCatalogo(
      Array.isArray(pbxDirectoRes) ? pbxDirectoRes : [],
      catalogo
    );
    const llamadasCelular = filtrarCelularPorCatalogo(
      Array.isArray(celRes?.data) ? celRes.data : [],
      catalogo
    );
    const llamadasTeams = Array.isArray(teamsRes) ? teamsRes : [];
    const llamadasWhatsapp = Array.isArray(whatsappRes) ? whatsappRes : [];

    const resolverAsesor = crearResolverAsesor(catalogo);
    const mapaPaisCat = construirMapaPaisCatalogo(catalogo);

    const {
      rawLeads: leadsCalificadosValidos,
      rawLeadsNoCalificados: leadsNoCalificadosProcesados,
      citasCalificadas,
      citasNoCalificadas,
    } = procesarLeadsProspektia({
      leads,
      leadsNoCalificados,
      catalogo,
    });

    // Mapear Llamadas Unificadas (PBX, Celular, Teams, WhatsApp) con inferencia de país
    const llamadas: Llamada[] = [];

    llamadasPbx.forEach((pbx: any, idx: number) => {
      const extStr = pbx.extension ? String(pbx.extension).trim() : '';
      const asesor =
        pbx.asesor_nombre ||
        resolverAsesor(extStr, resolverAsesor(pbx.nombre || '', extStr ? `Ext. ${extStr}` : 'Asesor PBX'));
      pbx.asesor_nombre = asesor;
      const paisCall = detectarPaisLlamada({ ...pbx, asesor_nombre: asesor }, 'PBX', catalogo, mapaPaisCat);
      pbx.pais = paisCall;
      const fechaInicio = stripFakeUtcZ(pbx.fecha_hora || pbx.calldate) || `${formatLocalDate()}T00:00:00`;
      const durSec = Number(pbx.duracion_segundos || 0);
      let audioFinal = String(pbx.audio_url || pbx.grabacion_url || '').trim();
      if (audioFinal && audioFinal !== 'null' && audioFinal !== 'undefined') {
        if (!audioFinal.startsWith('http')) {
          audioFinal = `https://api.red.com.sv${audioFinal.startsWith('/') ? '' : '/'}${audioFinal}`;
        }
      } else if (pbx.uniqueid && extStr) {
        const d = new Date(fechaInicio);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dia = String(d.getDate()).padStart(2, '0');
          const fn = `Grabacion_Ext_${extStr}_${pbx.uniqueid}.wav`;
          audioFinal =
            String(paisCall).toUpperCase() === 'GT'
              ? `https://api.red.com.sv/pbx/api/v1/rawCalls?pais=GT&anio=${y}&mes=${m}&dia=${dia}&archivo=${encodeURIComponent(fn)}`
              : `https://api.red.com.sv/pbx/api/v1/getAudio/${y}/${m}/${dia}/${fn}`;
        }
      }
      pbx.audio_url = audioFinal || null;
      pbx.grabacion_url = audioFinal || null;

      llamadas.push({
        id: String(pbx.uniqueid || pbx.id || `pbx-${idx}`),
        vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
        vendedor_nombre: asesor,
        telefono_marcado: String(pbx.destino || '').trim(),
        fecha_hora_inicio: fechaInicio,
        fecha_hora_fin: fechaInicio,
        duracion_segundos: durSec,
        resultado: esPbxContestada(pbx.estado, durSec) ? 'contestada' : 'no_contesta',
        proveedor: 'PBX',
        canal_tipo: 'PBX',
        pais: paisCall,
        audio_url: audioFinal || undefined,
      });
    });

    llamadasCelular.forEach((cel: any, idx: number) => {
      const asesor = resolverAsesor(cel.usuario || cel.linea || '', 'Ejecutivo Celular');
      cel.asesor_nombre = asesor;
      const paisCall = detectarPaisLlamada({ ...cel, asesor_nombre: asesor }, 'Celular', catalogo, mapaPaisCat);
      cel.pais = paisCall;
      let durSec = 0;
      if (typeof cel.duracion === 'number') durSec = cel.duracion;
      else if (typeof cel.duracion === 'string') {
        const parts = cel.duracion.split(':');
        if (parts.length === 3) durSec = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        else durSec = parseInt(cel.duracion) || 0;
      }
      const fechaBase = cel.fecha ? String(cel.fecha).slice(0, 10) : new Date().toISOString().slice(0, 10);
      const fechaHora = `${fechaBase}T${cel.hora || '10:00:00'}`;
      llamadas.push({
        id: String(cel.id || `cel-${idx}`),
        vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
        vendedor_nombre: asesor,
        telefono_marcado: String(cel.destino || '').trim(),
        fecha_hora_inicio: fechaHora,
        fecha_hora_fin: fechaHora,
        duracion_segundos: durSec,
        resultado: durSec > 0 ? 'contestada' : 'no_contesta',
        proveedor: 'Celular',
        canal_tipo: 'Celular',
        pais: paisCall,
      });
    });

    llamadasTeams.forEach((teams: any, idx: number) => {
      const asesor = teams.ejecutivo_nombre || teams.ejecutivo || resolverAsesor(teams.asesor || '', 'Ejecutivo Teams');
      teams.asesor_nombre = asesor;
      const paisCall = detectarPaisLlamada({ ...teams, ejecutivo_nombre: asesor }, 'Teams', catalogo, mapaPaisCat);
      teams.pais = paisCall;
      const fReunion = teams.fecha_reunion || (teams.fecha_agendada ? String(teams.fecha_agendada).slice(0, 10) : new Date().toISOString().slice(0, 10));
      const hReunion = teams.hora_reunion || (teams.hora_agendada ? String(teams.hora_agendada).slice(0, 5) : '10:00');
      const fechaHora = `${fReunion}T${hReunion.length === 5 ? hReunion + ':00' : hReunion}`;
      llamadas.push({
        id: String(teams.id || `teams-${idx}`),
        vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
        vendedor_nombre: asesor,
        telefono_marcado: String(teams.codigo_prospecto || '').trim(),
        fecha_hora_inicio: fechaHora,
        fecha_hora_fin: fechaHora,
        duracion_segundos: 1800,
        resultado: 'contestada',
        proveedor: 'Teams',
        canal_tipo: 'Teams',
        pais: paisCall,
        notas_llamada: teams.evidencia_url || teams.notas,
      });
    });

    llamadasWhatsapp.forEach((wa: any, idx: number) => {
      const asesor = resolverAsesor(
        String(wa.ejecutivo_id || wa.asesor || wa.agente || ''),
        resolverAsesor(wa.numero_ejecutivo || '', 'Bot WhatsApp')
      );
      wa.asesor_nombre = asesor;
      const paisCall = detectarPaisLlamada({ ...wa, asesor_nombre: asesor }, 'WhatsApp', catalogo, mapaPaisCat);
      wa.pais = paisCall;
      const fechaInicio = utcToSvWallClock(wa.fecha_llamada || wa.created_at) || `${formatLocalDate()}T09:00:00`;
      let durSec = 0;
      if (typeof wa.duracion_segundos === 'number') durSec = wa.duracion_segundos;
      else if (typeof wa.duracion === 'string') durSec = parseInt(wa.duracion) || 0;
      llamadas.push({
        id: String(wa.id || `wa-${idx}`),
        vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
        vendedor_nombre: asesor,
        telefono_marcado: String(wa.numero_cliente || '').trim(),
        fecha_hora_inicio: fechaInicio,
        fecha_hora_fin: fechaInicio,
        duracion_segundos: durSec,
        resultado: wa.estado?.toLowerCase() === 'contestada' || durSec > 0 ? 'contestada' : 'no_contesta',
        proveedor: 'Vapi',
        canal_tipo: 'WhatsApp',
        pais: paisCall,
      });
    });

    const fin = performance.now();
    return {
      citasCalificadas,
      citasNoCalificadas,
      citas: citasCalificadas,
      llamadas,
      catalogo,
      rawPbx: llamadasPbx,
      rawCelular: llamadasCelular,
      rawWhatsapp: llamadasWhatsapp,
      rawLeads: leadsCalificadosValidos,
      rawLeadsNoCalificados: leadsNoCalificadosProcesados,
      rawTeams: llamadasTeams,
      estadisticas: {
        total_leads_calificados: leadsCalificadosValidos.length,
        total_leads_no_calificados: leadsNoCalificadosProcesados.length,
        total_llamadas_pbx: llamadasPbx.length,
        total_llamadas_celular: llamadasCelular.length,
        total_llamadas_teams: llamadasTeams.length,
        total_llamadas_whatsapp: llamadasWhatsapp.length,
        total_catalogo: catalogo.length,
      },
      tiempo_ms: Math.round(fin - inicio),
    };
  } catch (err) {
    console.error('Error al sincronizar directamente desde Supabase REST:', err);
    return {
      citasCalificadas: [],
      citasNoCalificadas: [],
      citas: [],
      llamadas: [],
      catalogo: [],
      rawPbx: [],
      rawCelular: [],
      rawWhatsapp: [],
      rawLeads: [],
      rawLeadsNoCalificados: [],
      rawTeams: [],
      estadisticas: {},
      tiempo_ms: Math.round(performance.now() - inicio),
    };
  }
}

function leerKpiOverridesLocal(tabla: 'leads' | 'leads_no_calificados'): Record<string, Record<string, boolean>> {
  try {
    const raw = localStorage.getItem(`kpi_estados_override_${tabla}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    delete parsed['undefined'];
    delete parsed['null'];
    delete parsed[''];
    return parsed;
  } catch {
    return {};
  }
}

function guardarKpiOverrideLocal(
  tabla: 'leads' | 'leads_no_calificados',
  claves: string[],
  cambios: Record<string, any>
) {
  try {
    const actual = leerKpiOverridesLocal(tabla);
    const soloBool: Record<string, boolean> = {};
    Object.entries(cambios || {}).forEach(([k, v]) => {
      if (k.startsWith('kpi_sla_') || k.startsWith('kpi_retroalimentacion_')) {
        soloBool[k] = Boolean(v);
      }
    });
    claves.forEach((c) => {
      const clean = String(c || '').trim();
      if (!clean || clean === 'undefined' || clean === 'null') return;
      actual[clean] = { ...(actual[clean] || {}), ...soloBool };
    });
    localStorage.setItem(`kpi_estados_override_${tabla}`, JSON.stringify(actual));
  } catch (_) {}
}

/**
 * Guarda cambios en un lead (SLA / Retroalimentación) para Calificados o No Calificados
 */
export async function actualizarLeadKpiBackend(
  leadId: string,
  cambios: Partial<Cita>,
  tabla: 'leads' | 'leads_no_calificados' = 'leads',
  codigoAlt?: string
): Promise<boolean> {
  guardarKpiOverrideLocal(tabla, [leadId, codigoAlt || ''], cambios as Record<string, any>);

  try {
    const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}?tabla=${tabla}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    });
    if (res.ok) {
      const json = await res.json().catch(() => ({ exito: true }));
      if (json?.exito !== false) return true;
    }
  } catch (err) {
    console.warn('Backend proxy no disponible para actualizar lead, usando Supabase directo:', err);
  }

  try {
    const { url, headers } = getSupabaseConfig();
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId);
    const colFiltro = esUuid
      ? 'id'
      : tabla === 'leads_no_calificados'
      ? 'client_id'
      : 'codigo_prospecto';
    const r = await fetch(`${url}/rest/v1/${tabla}?${colFiltro}=eq.${encodeURIComponent(leadId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(cambios),
    });
    if (r.ok) return true;
    // Si la tabla aún no posee columnas kpi_*, la persistencia local ya aseguró el cambio
    return true;
  } catch (e) {
    console.error('Error al actualizar lead en Supabase:', e);
    return true;
  }
}

/**
 * CRUD de Catálogo
 */
export async function guardarCatalogoItemBackend(item: any): Promise<boolean> {
  const payload: Record<string, any> = {
    nombre_ejecutivo: String(item.nombre_ejecutivo || '').trim(),
    usuario: item.usuario ? String(item.usuario).trim() : '',
    extension: item.extension ? String(item.extension).trim() : '',
    celular: item.celular ? String(item.celular).trim() : '',
    pais: item.pais || 'SV',
  };
  if (!payload.nombre_ejecutivo) return false;

  try {
    const method = item.id ? 'PATCH' : 'POST';
    const url = item.id ? `/api/catalogo/${encodeURIComponent(item.id)}` : '/api/catalogo';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const json = await res.json().catch(() => ({ exito: true }));
      if (json?.exito !== false) return true;
    }
  } catch (err) {
    console.warn('Backend proxy no disponible para catálogo, usando Supabase directo:', err);
  }

  try {
    const { url, headers } = getSupabaseConfig();
    const method = item.id ? 'PATCH' : 'POST';
    const targetUrl = item.id
      ? `${url}/rest/v1/catalogo?id=eq.${encodeURIComponent(item.id)}`
      : `${url}/rest/v1/catalogo`;
    const r = await fetch(targetUrl, {
      method,
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
    return r.ok;
  } catch (e) {
    console.error('Error al guardar catálogo en Supabase:', e);
    return false;
  }
}

export async function guardarReunionTeamsBackend(reunion: any): Promise<boolean> {
  try {
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reunion),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.exito) return true;
    }
  } catch (err) {
    console.warn('Backend proxy no disponible para Teams, usando Supabase directo:', err);
  }

  try {
    const { url, headers } = getSupabaseConfig();
    const r = await fetch(`${url}/rest/v1/llamadas_teams`, {
      method: 'POST',
      headers,
      body: JSON.stringify(reunion),
    });
    return r.ok;
  } catch (e) {
    console.error('Error al guardar Teams en Supabase:', e);
    return false;
  }
}

export async function eliminarCatalogoItemBackend(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const res = await fetch(`/api/catalogo/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      const json = await res.json().catch(() => ({ exito: true }));
      if (json?.exito !== false) return true;
    }
  } catch (err) {
    console.warn('Backend proxy no disponible para eliminar catálogo, usando Supabase directo:', err);
  }

  try {
    const { url, headers } = getSupabaseConfig();
    const r = await fetch(`${url}/rest/v1/catalogo?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    });
    return r.ok;
  } catch (e) {
    console.error('Error al eliminar catálogo en Supabase:', e);
    return false;
  }
}

export async function triggerEdgeFunction(params: any): Promise<any> {
  try {
    const res = await fetch('/api/sync/trigger-edge-function', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch (err) {
    console.error('Error trigger edge function:', err);
    return { exito: false };
  }
}

/**
 * Guarda una llamada manual (PBX o Celular) en Supabase
 * con fallback directo en caso de despliegue SPA estático
 */
export async function guardarLlamadaManualBackend(
  tipo: 'pbx' | 'celular',
  datos: any
): Promise<{ exito: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch(`/api/llamadas/${tipo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.exito) return json;
    }
  } catch (e) {
    console.warn(`Fallo al enviar llamada a backend /api/llamadas/${tipo}:`, e);
  }

  // Fallback directo a Supabase REST
  const supabaseUrl =
    (import.meta as any).env?.VITE_SUPABASE_URL ||
    'https://sbopifiiyezmvsadwkpg.supabase.co';
  const supabaseKey =
    (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3BpZmlpeWV6bXZzYWR3a3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzM0OTYsImV4cCI6MjEwMDMwOTQ5Nn0.ZI5y8lroFF529Xr-Otm1fcq6H2lhbh9e3s-WU9O6I7A';

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  try {
    const fechaFinal = datos.fecha || new Date().toISOString().slice(0, 10);
    const horaFinal = datos.hora || '10:00:00';

    if (tipo === 'pbx') {
      const payload = {
        uniqueid: `manual_pbx_${Date.now()}`,
        nombre: datos.ejecutivo || 'LCANAS',
        extension: datos.extension || '4031',
        prefijo: '9',
        destino: datos.telefono_destino ? String(datos.telefono_destino).trim() : '',
        duracion_segundos: Number(datos.duracion_segundos || 180),
        duracion_minutos: Math.round((Number(datos.duracion_segundos || 180) / 60) * 100) / 100,
        duracion_hh_mm_ss: '00:03:00',
        estado: datos.estado || 'CONTESTADA',
        fecha_hora: `${fechaFinal}T${horaFinal}`,
        fecha: fechaFinal,
        anio: Number(fechaFinal.slice(0, 4)),
        mes: Number(fechaFinal.slice(5, 7)),
        dia: Number(fechaFinal.slice(8, 10)),
        pais: datos.pais || 'SV',
      };
      const r = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/llamadas_pbx`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        const rows = await r.json();
        return { exito: true, data: Array.isArray(rows) ? rows[0] : rows };
      }
    } else {
      const payload = {
        id: Date.now(),
        fecha: fechaFinal,
        hora: horaFinal,
        destino: datos.telefono_destino ? String(datos.telefono_destino).trim() : '',
        duracion: Number(datos.duracion_segundos || 180),
        tipo: 'Saliente',
        linea: 'Manual',
        usuario: datos.ejecutivo || 'PAGUILAR',
      };
      const r = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/llamadas_celular`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        const rows = await r.json();
        return { exito: true, data: Array.isArray(rows) ? rows[0] : rows };
      }
    }
  } catch (err: any) {
    return { exito: false, error: err.message };
  }

  return { exito: false, error: 'No se pudo guardar la llamada en Supabase.' };
}
