// Serverless function para Vercel: /api/sync/datos-completos
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://sbopifiiyezmvsadwkpg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3BpZmlpeWV6bXZzYWR3a3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzM0OTYsImV4cCI6MjEwMDMwOTQ5Nn0.ZI5y8lroFF529Xr-Otm1fcq6H2lhbh9e3s-WU9O6I7A';

const supabaseHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

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

async function fetchPbxEnCaliente(): Promise<any[]> {
  try {
    const token = await getPbxJwt();
    const ventanas = generarVentanasPbx(60);
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

    return llamadasRaw.map((c: any) => {
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

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const waOffsets = [0, 1000];

    // PBX, Celular y Leads 100% EN VIVO desde sus respectivas APIs
    // Únicamente Catalogo, WhatsApp y Teams se leen de Supabase
    const [
      catalogoRes,
      pbxDirecto,
      celDirecto,
      teamsRaw,
      waRaw,
      prospektiaRes,
      prospektiaNcRes,
    ] = await Promise.all([
      fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/catalogo?select=*&order=id.asc`, { headers: supabaseHeaders }).then(r => r.ok ? r.json() : []),
      fetchPbxEnCaliente(),
      fetchCelularEnCaliente(),
      fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/llamadas_teams?select=*&order=fecha_reunion.desc.nullslast`, { headers: supabaseHeaders }).then(r => r.ok ? r.json() : []),
      Promise.all(
        waOffsets.map((offset) =>
          fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/llamadas_whatsapp?select=*&order=fecha_llamada.desc.nullslast&offset=${offset}&limit=1000`, { headers: supabaseHeaders }).then(r => r.ok ? r.json() : [])
        )
      ).then(pages => pages.flat()),
      fetch('https://prospektia.red.com.sv/api/external/leads-calificados', {
        headers: { 'X-API-Key': 'RedApi_2026_SuperSegura_9XK2', Accept: 'application/json' },
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      Promise.all([
        fetch('https://prospektia.red.com.sv/api/audit/leads-no-calificados?limit=1000&offset=0', {
          headers: { 'X-API-Key': 'RedApi_2026_SuperSegura_9XK2', Accept: 'application/json' },
        }).then(r => r.ok ? r.json() : null),
        fetch('https://prospektia.red.com.sv/api/audit/leads-no-calificados?limit=1000&offset=1000', {
          headers: { 'X-API-Key': 'RedApi_2026_SuperSegura_9XK2', Accept: 'application/json' },
        }).then(r => r.ok ? r.json() : null),
      ]).then(([p1, p2]) => [...(p1?.items || []), ...(p2?.items || [])]).catch(() => []),
    ]);

    const mapaLeads = new Map<string, any>();
    const leadsProspektiaApi = prospektiaRes?.leads || [];
    leadsProspektiaApi.forEach((pl: any) => {
      const cod = String(pl.codigo_prospecto || pl.id || '').trim();
      if (!cod) return;
      const fAg = pl.fecha_agendada ? String(pl.fecha_agendada).trim() : null;
      const hAg = pl.hora_agendada ? String(pl.hora_agendada).trim() : null;
      mapaLeads.set(cod, {
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
      });
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

    // Ordenar calificados por fecha agendada desc
    leadsCalificadosValidos.sort((a, b) => {
      const fA = `${a.fecha_agendada || a.created_at || ''}T${a.hora_agendada || '00:00'}`;
      const fB = `${b.fecha_agendada || b.created_at || ''}T${b.hora_agendada || '00:00'}`;
      return fB.localeCompare(fA);
    });

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

    return res.status(200).json({
      exito: true,
      timestamp: Date.now(),
      estadisticas: {
        total_leads: leadsCalificadosValidos.length,
        total_leads_no_calificados: leadsNoCalificados.length,
        total_llamadas_pbx: pbxDirecto.length,
        total_llamadas_celular: celDirecto.length,
        total_llamadas_whatsapp: (Array.isArray(waRaw) ? waRaw : []).length,
        total_llamadas_teams: (Array.isArray(teamsRaw) ? teamsRaw : []).length,
        total_catalogo: (Array.isArray(catalogoRes) ? catalogoRes : []).length,
      },
      datos: {
        catalogo: Array.isArray(catalogoRes) ? catalogoRes : [],
        leads: leadsCalificadosValidos,
        leadsNoCalificados,
        llamadasPbx: pbxDirecto,
        llamadasCelular: celDirecto,
        llamadasTeams: Array.isArray(teamsRaw) ? teamsRaw : [],
        llamadasWhatsapp: Array.isArray(waRaw) ? waRaw : [],
      },
    });
  } catch (error: any) {
    console.error('Error en /api/sync/datos-completos (Vercel):', error);
    return res.status(500).json({ exito: false, error: error.message });
  }
}
