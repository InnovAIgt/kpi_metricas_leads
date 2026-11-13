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
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const waOffsets = [0, 1000];

    const [
      catalogoRes,
      pbxDirecto,
      celDirecto,
      teamsRawRes,
      waRawRes,
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

    const catalogo = Array.isArray(catalogoRes) ? catalogoRes : [];
    const teamsRaw = Array.isArray(teamsRawRes) ? teamsRawRes : [];
    const llamadasWhatsapp = Array.isArray(waRawRes) ? waRawRes : [];

    // Construir catálogo de asesores para enriquecimiento uniforme
    const mapaCatalogo = {
      porExtension: {} as Record<string, any>,
      porUsuario: {} as Record<string, any>,
      porCelular: {} as Record<string, any>,
      porNombre: {} as Record<string, any>,
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

    const mapaLeads = new Map<string, any>();
    const leadsProspektiaApi = prospektiaRes?.leads || [];
    leadsProspektiaApi.forEach((pl: any) => {
      const cod = String(pl.codigo_prospecto || pl.id || '').trim();
      if (!cod) return;
      const fAg = pl.fecha_agendada ? String(pl.fecha_agendada).trim() : null;
      const hAg = pl.hora_agendada ? String(pl.hora_agendada).trim() : null;
      mapaLeads.set(cod, {
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

    // Enriquecimiento uniforme de leads, llamadas y Teams
    leadsCalificadosValidos.forEach((l: any) => {
      l.asesor_nombre = resolverAsesorBackend(
        l.asesor_nombre || l.asesor_id,
        l.asesor_nombre ? String(l.asesor_nombre).trim() : 'Asesor General'
      );
      if (!l.nombre_prospecto) l.nombre_prospecto = l.codigo_prospecto ? `Prospecto ${l.codigo_prospecto}` : 'Prospecto Sin Nombre';
      l.pais = l.pais || detectarPais(l.telefono, 'SV');
      if (!l.status) l.status = 'Agendado';
    });

    leadsNoCalificados.forEach((l: any) => {
      l.advisor_name = resolverAsesorBackend(
        l.advisor_name,
        l.advisor_name ? String(l.advisor_name).trim() : 'Asesor Asignado'
      );
      if (!l.campaign_name) l.campaign_name = 'Campaña Inbound';
    });

    celDirecto.forEach((c: any) => {
      c.asesor_nombre = resolverAsesorBackend(c.usuario, resolverAsesorBackend(c.linea, c.usuario || 'Ejecutivo Celular'));
      if (!c.operador) c.operador = 'Claro / Tigo';
    });

    pbxDirecto.forEach((p: any) => {
      const extStr = p.extension ? String(p.extension).trim() : '';
      p.asesor_nombre = resolverAsesorBackend(
        extStr,
        resolverAsesorBackend(p.nombre, p.nombre || (extStr ? `Ext. ${extStr}` : 'Línea PBX'))
      );
      p.pais = p.pais || detectarPais(p.destino, 'SV');
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

    pbxDirecto.forEach((p: any) => {
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
      w.asesor_nombre = resolverAsesorBackend(
        w.numero_ejecutivo,
        w.numero_ejecutivo ? `Asesor ${w.numero_ejecutivo}` : 'Asesor WhatsApp'
      );
      if (!w.estado) w.estado = 'Entregado';
      if (!w.direccion) w.direccion = 'Saliente';
    });

    return res.status(200).json({
      exito: true,
      timestamp: Date.now(),
      estadisticas: {
        total_leads: leadsCalificadosValidos.length,
        total_leads_no_calificados: leadsNoCalificados.length,
        total_llamadas_pbx: pbxDirecto.length,
        total_llamadas_celular: celDirecto.length,
        total_llamadas_whatsapp: llamadasWhatsapp.length,
        total_llamadas_teams: llamadasTeams.length,
        total_catalogo: catalogo.length,
      },
      datos: {
        catalogo,
        leads: leadsCalificadosValidos,
        leadsNoCalificados,
        llamadasPbx: pbxDirecto,
        llamadasCelular: celDirecto,
        llamadasTeams,
        llamadasWhatsapp,
      },
    });
  } catch (error: any) {
    console.error('Error en /api/sync/datos-completos (Vercel):', error);
    return res.status(500).json({ exito: false, error: error.message });
  }
}
