// Serverless function para Vercel: /api/sync/datos-completos
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://sbopifiiyezmvsadwkpg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3BpZmlpeWV6bXZzYWR3a3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzM0OTYsImV4cCI6MjEwMDMwOTQ5Nn0.ZI5y8lroFF529Xr-Otm1fcq6H2lhbh9e3s-WU9O6I7A';

const supabaseHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

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
    const pbxOffsets = [0, 1000, 2000, 3000, 4000];
    const celOffsets = [0, 1000, 2000, 3000];

    const [
      catalogoRes,
      leadsRaw,
      ncRaw,
      pbxPages,
      celPages,
      teamsRaw,
      waRaw,
      prospektiaRes,
      prospektiaNcRes,
    ] = await Promise.all([
      fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/catalogo?select=*&order=id.asc`, { headers: supabaseHeaders }).then(r => r.ok ? r.json() : []),
      fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads?select=*&order=fecha_agendada.desc.nullslast,created_at.desc.nullslast`, { headers: supabaseHeaders }).then(r => r.ok ? r.json() : []),
      fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads_no_calificados?select=*&order=created_at.desc.nullslast`, { headers: supabaseHeaders }).then(r => r.ok ? r.json() : []),
      Promise.all(
        pbxOffsets.map((offset) =>
          fetch(
            `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/llamadas_pbx?select=id,uniqueid,nombre,extension,destino,duracion_segundos,estado,fecha_hora,audio_url,grabacion_url,pais&fecha_hora=not.is.null&order=fecha_hora.desc.nullslast&offset=${offset}&limit=1000`,
            { headers: supabaseHeaders }
          ).then(r => r.ok ? r.json() : [])
        )
      ).then(pages => pages.flat()),
      Promise.all(
        celOffsets.map((offset) =>
          fetch(
            `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/llamadas_celular?select=id,fecha,hora,destino,duracion,tipo,linea,usuario&order=fecha.desc.nullslast,hora.desc.nullslast&offset=${offset}&limit=1000`,
            { headers: supabaseHeaders }
          ).then(r => r.ok ? r.json() : [])
        )
      ).then(pages => pages.flat()),
      fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/llamadas_teams?select=*&order=fecha_reunion.desc.nullslast`, { headers: supabaseHeaders }).then(r => r.ok ? r.json() : []),
      fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/llamadas_whatsapp?select=*&order=fecha_llamada.desc.nullslast&limit=2000`, { headers: supabaseHeaders }).then(r => r.ok ? r.json() : []),
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
    (Array.isArray(leadsRaw) ? leadsRaw : []).forEach((l: any) => {
      const cod = String(l.codigo_prospecto || l.id || '').trim();
      if (cod) mapaLeads.set(cod, { ...l });
    });

    const leadsProspektiaApi = prospektiaRes?.leads || [];
    leadsProspektiaApi.forEach((pl: any) => {
      const cod = String(pl.codigo_prospecto || pl.id || '').trim();
      if (!cod) return;
      const fAg = pl.fecha_agendada ? String(pl.fecha_agendada).trim() : null;
      const hAg = pl.hora_agendada ? String(pl.hora_agendada).trim() : null;
      const existente = mapaLeads.get(cod);
      if (!existente) {
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
          status: pl.status || 'en_proceso',
          created_at: pl.created_at || (pl.fecha_creado ? `${pl.fecha_creado}T${pl.hora_creado || '00:00:00'}Z` : new Date().toISOString()),
        });
      } else {
        if (fAg && (!existente.fecha_agendada || existente.fecha_agendada === 'null')) existente.fecha_agendada = fAg;
        if (hAg && (!existente.hora_agendada || existente.hora_agendada === 'null')) existente.hora_agendada = hAg;
        if (pl.nombre_prospecto && !existente.nombre_prospecto) existente.nombre_prospecto = pl.nombre_prospecto;
      }
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
    (Array.isArray(ncRaw) ? ncRaw : []).forEach((nc: any) => {
      const k = String(nc.id || `${nc.client_id}_${nc.created_at}`).trim();
      if (k) mapaNc.set(k, { ...nc });
    });

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
        total_llamadas_pbx: pbxPages.length,
        total_llamadas_celular: celPages.length,
        total_llamadas_whatsapp: (Array.isArray(waRaw) ? waRaw : []).length,
        total_llamadas_teams: (Array.isArray(teamsRaw) ? teamsRaw : []).length,
        total_catalogo: (Array.isArray(catalogoRes) ? catalogoRes : []).length,
      },
      datos: {
        catalogo: Array.isArray(catalogoRes) ? catalogoRes : [],
        leads: leadsCalificadosValidos,
        leadsNoCalificados,
        llamadasPbx: pbxPages,
        llamadasCelular: celPages,
        llamadasTeams: Array.isArray(teamsRaw) ? teamsRaw : [],
        llamadasWhatsapp: Array.isArray(waRaw) ? waRaw : [],
      },
    });
  } catch (error: any) {
    console.error('Error en /api/sync/datos-completos (Vercel):', error);
    return res.status(500).json({ exito: false, error: error.message });
  }
}
