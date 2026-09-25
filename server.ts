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

// Cache en memoria para respuestas ultra-rápidas (<5ms) y evitar sobrecarga de Supabase
let cacheDatosCompletos: { data: any; timestamp: number } | null = null;
let syncPromiseEnVuelo: Promise<any> | null = null;
const CACHE_TTL_MS = 30000; // 30 segundos de cache

// ==============================================================================
// 2. ENDPOINT PROXY UNIFICADO DE DATOS (Backend a Supabase)
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
    // 1. Obtener primero el Catálogo de Asesores Oficial
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

    const perteneceACatalogo = (ident: string): boolean => {
      if (!ident || ident === 'null' || ident === 'undefined') return false;
      const res = resolverAsesorBackend(ident, '__NO__');
      return res !== '__NO__';
    };

    const extsList = Object.keys(mapaCatalogo.porExtension).join(',');
    const usersList = Object.keys(mapaCatalogo.porUsuario).map((u) => u.toUpperCase()).join(',');

    // 2. Consultas optimizadas para alta velocidad (<400ms)
    const pbxOffsets = [0, 1000]; // 2,000 llamadas PBX recientes
    const celOffsets = [0, 1000]; // 2,000 llamadas Celular recientes
    const waOffsets = [0];        // 1,000 llamadas WhatsApp recientes

    const [
      leadsRaw,
      ncRaw,
      pbxPages,
      celPages,
      teamsRaw,
      waRaw,
      prospektiaRes,
    ] = await Promise.all([
      fetchSupabaseTablePaginado('leads', 'fecha_agendada.desc.nullslast,created_at.desc', 1000),
      fetchSupabaseTablePaginado('leads_no_calificados', 'created_at.desc.nullslast', 1000),
      Promise.all(
        pbxOffsets.map((offset) =>
          fetchSupabaseTable(
            `llamadas_pbx?or=(extension.in.(${extsList}),nombre.in.(${usersList}))&select=id,uniqueid,nombre,extension,destino,duracion_segundos,estado,fecha_hora,audio_url,grabacion_url&order=fecha_hora.desc.nullslast&offset=${offset}&limit=1000`
          )
        )
      ).then((pages) => pages.flat()),
      Promise.all(
        celOffsets.map((offset) =>
          fetchSupabaseTable(
            `llamadas_celular?select=id,fecha,hora,destino,duracion,tipo,linea,usuario&order=fecha.desc.nullslast,hora.desc.nullslast&offset=${offset}&limit=1000`
          )
        )
      ).then((pages) => pages.flat()),
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
    ]);

    // 3. Fusionar leads de Supabase con la API de Prospektia en vivo
    // Garantiza que ningún lead calificado quede fuera y conserve su fecha/hora de reunión
    const mapaLeads = new Map<string, any>();
    
    // Primero agregar los de Supabase
    leadsRaw.forEach((l: any) => {
      const cod = String(l.codigo_prospecto || l.id || '').trim();
      if (cod) mapaLeads.set(cod, { ...l });
    });

    // Luego complementar o enriquecer con los de Prospektia API
    const leadsProspektiaApi = prospektiaRes?.leads || [];
    const leadsParaUpsertSupabase: any[] = [];

    leadsProspektiaApi.forEach((pl: any) => {
      const cod = String(pl.codigo_prospecto || pl.id || '').trim();
      if (!cod) return;

      const existente = mapaLeads.get(cod);
      const fAg = pl.fecha_agendada ? String(pl.fecha_agendada).trim() : null;
      const hAg = pl.hora_agendada ? String(pl.hora_agendada).trim() : null;

      if (!existente) {
        // Lead nuevo en Prospektia que no estaba en Supabase
        const nuevo = {
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
        };
        mapaLeads.set(cod, nuevo);
        leadsParaUpsertSupabase.push(nuevo);
      } else {
        // Si en Supabase no tenía fecha_agendada pero en Prospektia sí tiene, actualizar
        let huboCambio = false;
        if (fAg && (!existente.fecha_agendada || existente.fecha_agendada === 'null')) {
          existente.fecha_agendada = fAg;
          huboCambio = true;
        }
        if (hAg && (!existente.hora_agendada || existente.hora_agendada === 'null')) {
          existente.hora_agendada = hAg;
          huboCambio = true;
        }
        if (pl.nombre_prospecto && !existente.nombre_prospecto) {
          existente.nombre_prospecto = pl.nombre_prospecto;
          huboCambio = true;
        }
        if (huboCambio) {
          leadsParaUpsertSupabase.push(existente);
        }
      }
    });

    // Si detectamos leads nuevos o con fechas faltantes, sincronizarlos silenciosamente a Supabase
    if (leadsParaUpsertSupabase.length > 0) {
      (async () => {
        try {
          await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads`, {
            method: 'POST',
            headers: {
              ...supabaseHeaders,
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify(leadsParaUpsertSupabase),
          });
        } catch (_) {}
      })();
    }

    const leads = Array.from(mapaLeads.values());
    const leadsNoCalificados = ncRaw;
    const llamadasPbx = pbxPages.filter((p: any) => perteneceACatalogo(p.extension) || perteneceACatalogo(p.nombre));
    const llamadasCelular = celPages.filter((c: any) => perteneceACatalogo(c.usuario) || perteneceACatalogo(c.linea));
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
      p.asesor_nombre = resolverAsesorBackend(p.nombre || p.extension, resolverAsesorBackend(p.extension, p.nombre || (p.extension ? `Ext. ${p.extension}` : 'Línea PBX')));
      p.pais = p.pais || detectarPais(p.destino, 'SV');
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
// 5. PROXY PARA TRIGGER DE EDGE FUNCTION
// ==========================================
app.post('/api/sync/trigger-edge-function', async (req, res) => {
  try {
    const { pbx_desde, pbx_hasta, pbx_pais } = req.body;
    const functionUrl = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/sincronizar-datos`;

    const bodyPayload: any = {
      pbx_desde: pbx_desde || '2026-09-01',
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
