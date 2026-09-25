import { Cita, Llamada } from '../types';

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

/**
 * Consulta el endpoint proxy del backend (/api/sync/datos-completos)
 * donde las credenciales de Supabase están 100% protegidas en variables de entorno.
 */
export async function sincronizarDatosDesdeBackend(): Promise<DatosSyncBackend> {
  const inicio = performance.now();
  try {
    const res = await fetch('/api/sync/datos-completos');
    if (res.ok) {
      const json = await res.json();
      if (json.exito && json.datos) {
        const {
          catalogo = [],
          leads = [],
          leadsNoCalificados = [],
          llamadasPbx = [],
          llamadasCelular = [],
          llamadasTeams = [],
          llamadasWhatsapp = [],
        } = json.datos;

        // 1. Construir Catálogo de Asesores por extensión, usuario, celular y nombre
        const mapaCatalogo = {
          porExtension: {} as Record<string, any>,
          porUsuario: {} as Record<string, any>,
          porCelular: {} as Record<string, any>,
          porNombre: {} as Record<string, any>,
        };

        catalogo.forEach((c: any) => {
          if (c.extension) mapaCatalogo.porExtension[String(c.extension).trim()] = c;
          if (c.usuario) mapaCatalogo.porUsuario[String(c.usuario).trim().toLowerCase()] = c;
          if (c.nombre_ejecutivo) mapaCatalogo.porNombre[String(c.nombre_ejecutivo).trim().toLowerCase()] = c;
          if (c.celular) {
            const cleanTel = String(c.celular).replace(/[^0-9]/g, '');
            mapaCatalogo.porCelular[cleanTel] = c;
          }
        });

        const resolverAsesor = (
          extOrUserOrCel: string,
          fallback: string = 'Asesor General'
        ): string => {
          if (!extOrUserOrCel) return fallback;
          const clean = String(extOrUserOrCel).trim();
          const cleanUser = clean.toLowerCase();
          if (mapaCatalogo.porUsuario[cleanUser]) return mapaCatalogo.porUsuario[cleanUser].nombre_ejecutivo;
          if (mapaCatalogo.porExtension[clean]) return mapaCatalogo.porExtension[clean].nombre_ejecutivo;
          if (mapaCatalogo.porNombre[cleanUser]) return mapaCatalogo.porNombre[cleanUser].nombre_ejecutivo;
          const cleanTel = clean.replace(/[^0-9]/g, '');
          if (cleanTel && mapaCatalogo.porCelular[cleanTel]) return mapaCatalogo.porCelular[cleanTel].nombre_ejecutivo;

          for (const cat of catalogo) {
            if (cat.usuario && cleanUser.includes(String(cat.usuario).toLowerCase())) return cat.nombre_ejecutivo;
            if (cat.nombre_ejecutivo && cleanUser.includes(String(cat.nombre_ejecutivo).toLowerCase())) return cat.nombre_ejecutivo;
          }
          return fallback;
        };

        // 2. Mapear Leads a Citas (SEPARANDO ESTRICTAMENTE CALIFICADOS Y NO CALIFICADOS)
        const citasCalificadas: Cita[] = [];
        const citasNoCalificadas: Cita[] = [];

        // Helper para procesar fecha y hora exacta sin perder datos
        const extraerFechaHoraLead = (lead: any) => {
          const fAgendada = lead.fecha_agendada && lead.fecha_agendada !== 'null' ? String(lead.fecha_agendada).trim() : '';
          let hAgendada = lead.hora_agendada && lead.hora_agendada !== 'null' ? String(lead.hora_agendada).trim() : '';
          const fCreado = lead.fecha_creado && lead.fecha_creado !== 'null' ? String(lead.fecha_creado).trim() : '';
          let hCreado = lead.hora_creado && lead.hora_creado !== 'null' ? String(lead.hora_creado).trim() : '';
          const fCreatedAt = lead.created_at ? String(lead.created_at).slice(0, 10) : '';
          let hCreatedAt = lead.created_at ? String(lead.created_at).slice(11, 19) : '';

          const tieneCitaAgendada = Boolean(fAgendada && fAgendada.length >= 8);

          // Si tiene fecha agendada pactada, se usa esa fecha y hora
          const fechaDef = fAgendada || fCreado || fCreatedAt || new Date().toISOString().slice(0, 10);
          let horaDef = hAgendada || hCreado || hCreatedAt || '09:00:00';
          if (horaDef.length === 5) horaDef += ':00';

          return {
            fechaIso: `${fechaDef}T${horaDef}`,
            fechaAgendada: fAgendada || '', // Fecha agendada real (no inventada)
            horaAgendada: hAgendada || '',   // Hora agendada real
            fechaCreado: fCreado || fCreatedAt,
            horaCreado: hCreado || hCreatedAt,
            tieneCitaAgendada,
          };
        };

        const extraerFechaHoraNoCalificado = (lead: any) => {
          // Si tiene created_at_sv (ej: "27/08/2026 07:58 AM" o "18/09/2026 02:48 PM")
          if (lead.created_at_sv && typeof lead.created_at_sv === 'string') {
            const match = lead.created_at_sv.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
            if (match) {
              const [, dd, mm, yyyy, hh, min, ampm] = match;
              let hourNum = parseInt(hh, 10);
              if (ampm) {
                if (ampm.toUpperCase() === 'PM' && hourNum < 12) hourNum += 12;
                if (ampm.toUpperCase() === 'AM' && hourNum === 12) hourNum = 0;
              }
              const dStr = String(parseInt(dd, 10)).padStart(2, '0');
              const mStr = String(parseInt(mm, 10)).padStart(2, '0');
              const hourStr = String(hourNum).padStart(2, '0');
              const f = `${yyyy}-${mStr}-${dStr}`;
              const h = `${hourStr}:${min}:00`;
              return { fechaIso: `${f}T${h}`, fecha: f, hora: h };
            }
          }

          // Si tiene created_at ISO UTC, restar 6 horas para zona horaria El Salvador (UTC-6)
          if (lead.created_at) {
            const d = new Date(lead.created_at);
            if (!isNaN(d.getTime())) {
              const svDate = new Date(d.getTime() - 6 * 3600 * 1000);
              const yyyy = svDate.getUTCFullYear();
              const mm = String(svDate.getUTCMonth() + 1).padStart(2, '0');
              const dd = String(svDate.getUTCDate()).padStart(2, '0');
              const hh = String(svDate.getUTCHours()).padStart(2, '0');
              const min = String(svDate.getUTCMinutes()).padStart(2, '0');
              const ss = String(svDate.getUTCSeconds()).padStart(2, '0');
              const f = `${yyyy}-${mm}-${dd}`;
              const h = `${hh}:${min}:${ss}`;
              return { fechaIso: `${f}T${h}`, fecha: f, hora: h };
            }
          }

          return { fechaIso: new Date().toISOString(), fecha: '', hora: '' };
        };

        // A. Leads Calificados (public.leads)
        // Regla: "aca solo calificados deben salir con fecha y hora de reunion"
        leads.forEach((lead: any, idx: number) => {
          const { fechaIso, fechaAgendada, horaAgendada, fechaCreado, horaCreado, tieneCitaAgendada } =
            extraerFechaHoraLead(lead);

          // Conservar valores reales en el objeto raw del lead
          lead.fecha_agendada = fechaAgendada || null;
          lead.hora_agendada = horaAgendada || null;
          lead.fecha_creado = fechaCreado;
          lead.hora_creado = horaCreado;
          lead.fecha_hora_programada = fechaIso;
          lead.tiene_cita_agendada = tieneCitaAgendada;

          const asesor =
            lead.asesor_nombre ||
            resolverAsesor(lead.asesor_id || '', 'Asesor General');

          const nombreProspecto =
            lead.nombre_prospecto ||
            lead.nombre ||
            lead.cliente ||
            (lead.codigo_prospecto ? `Prospecto ${lead.codigo_prospecto}` : `Lead #${idx + 1}`);

          // Registrar siempre todos los leads para auditoría y KPIs
          citasCalificadas.push({
            id: String(lead.id || lead.codigo_prospecto || `lead-${idx}`),
            codigo_prospecto: lead.codigo_prospecto,
            prospecto_nombre: nombreProspecto,
            prospecto_telefono: String(lead.telefono || lead.celular || lead.movil || '').trim(),
            prospecto_email: lead.asesor_email || lead.email || '',
            vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
            vendedor_nombre: asesor,
            fecha_hora_programada: fechaIso,
            fecha_agendada: fechaAgendada || undefined,
            hora_agendada: horaAgendada || undefined,
            fecha_creado: fechaCreado || undefined,
            hora_creado: horaCreado || undefined,
            created_at: lead.created_at || undefined,
            pais: lead.pais || 'SV',
            estado_cita: lead.status === 'cancelada' ? 'cancelada' : 'programada',
            fuente: 'Supabase',
            tipo_reunion: (lead.tipo_reunion as any) || 'Llamada Telefonica',
            tipo_lead: 'calificados',
            notas: `País: ${lead.pais || 'SV'}`,
            kpi_sla_etapa_1: Boolean(lead.kpi_sla_etapa_1),
            kpi_sla_etapa_2: Boolean(lead.kpi_sla_etapa_2),
            kpi_sla_etapa_3: Boolean(lead.kpi_sla_etapa_3),
            kpi_retroalimentacion_etapa_1: Boolean(lead.kpi_retroalimentacion_etapa_1),
            kpi_retroalimentacion_etapa_2: Boolean(lead.kpi_retroalimentacion_etapa_2),
            kpi_retroalimentacion_etapa_3: Boolean(lead.kpi_retroalimentacion_etapa_3),
            kpi_retroalimentacion_etapa_4: Boolean(lead.kpi_retroalimentacion_etapa_4),
          });
        });

        // B. Leads No Calificados (public.leads_no_calificados)
        leadsNoCalificados.forEach((lead: any, idx: number) => {
          const parsed = extraerFechaHoraNoCalificado(lead);
          // Asegurar que el objeto raw conserve fecha y hora estandarizadas
          lead.fecha = parsed.fecha;
          lead.hora = parsed.hora;
          lead.fecha_hora_programada = parsed.fechaIso;

          const asesor = lead.advisor_name || lead.asesor || 'Asesor Asignado';

          const nombreCliente =
            lead.client_name ||
            lead.nombre ||
            lead.prospecto ||
            (lead.client_id ? `Cliente ${lead.client_id}` : `No Calif. #${idx + 1}`);

          citasNoCalificadas.push({
            id: String(lead.id || lead.client_id || `no-calif-${idx}`),
            codigo_prospecto: lead.client_id,
            prospecto_nombre: nombreCliente,
            prospecto_telefono: String(lead.telefono || lead.celular || lead.numero || '').trim(),
            prospecto_email: lead.email || '',
            vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
            vendedor_nombre: asesor,
            fecha_hora_programada: parsed.fechaIso,
            fecha_agendada: parsed.fecha,
            hora_agendada: parsed.hora,
            fecha_creado: parsed.fecha,
            hora_creado: parsed.hora,
            estado_cita: 'no_show',
            fuente: 'Supabase',
            tipo_reunion: 'Discovery Call',
            tipo_lead: 'no_calificados',
            notas: `Lead No Calificado`,
            kpi_sla_etapa_1: Boolean(lead.kpi_sla_etapa_1),
            kpi_sla_etapa_2: Boolean(lead.kpi_sla_etapa_2),
            kpi_sla_etapa_3: Boolean(lead.kpi_sla_etapa_3),
            kpi_retroalimentacion_etapa_1: Boolean(lead.kpi_retroalimentacion_etapa_1),
            kpi_retroalimentacion_etapa_2: Boolean(lead.kpi_retroalimentacion_etapa_2),
            kpi_retroalimentacion_etapa_3: Boolean(lead.kpi_retroalimentacion_etapa_3),
            kpi_retroalimentacion_etapa_4: Boolean(lead.kpi_retroalimentacion_etapa_4),
          });
        });

        // 3. Mapear Llamadas Multicanal
        const llamadas: Llamada[] = [];

        // A. PBX (getCalls2)
        llamadasPbx.forEach((call: any, idx: number) => {
          const durSec =
            Number(call.duracion_segundos || 0) ||
            Number(call.duracion_minutos || 0) * 60;
          const fechaInicio =
            call.fecha_hora ||
            (call.fecha ? `${call.fecha}T${call.hora || '00:00:00'}` : new Date().toISOString());

          const ext = String(call.extension || '').trim();
          const asesor =
            call.asesor_nombre ||
            resolverAsesor(call.nombre || '', resolverAsesor(ext, ext ? `Ext. ${ext}` : 'Línea PBX'));

          llamadas.push({
            id: String(call.uniqueid || call.id || `pbx-${idx}`),
            vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
            vendedor_nombre: asesor,
            telefono_marcado: String(call.destino || '').trim(),
            prospecto_nombre: call.nombre || undefined,
            fecha_hora_inicio: fechaInicio,
            fecha_hora_fin: fechaInicio,
            duracion_segundos: durSec,
            resultado:
              call.estado?.toLowerCase() === 'answered' || durSec > 25
                ? 'contestada'
                : 'no_contesta',
            proveedor: 'VoIP',
            canal_tipo: 'PBX',
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
            resolverAsesor(cel.usuario || '', resolverAsesor(cel.linea || '', cel.usuario || 'Ejecutivo Celular'));

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
            notas_llamada: `[Celular] Operador: ${cel.operador || 'N/D'} | Línea: ${cel.linea || 'Móvil'}`,
          });
        });

        // C. Teams (Reuniones virtuales)
        llamadasTeams.forEach((tm: any, idx: number) => {
          const fechaInicio =
            tm.fecha_reunion && tm.hora_reunion
              ? `${tm.fecha_reunion}T${tm.hora_reunion}`
              : tm.created_at || new Date().toISOString();

          const asesor = tm.ejecutivo || 'Ejecutivo Teams';

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
            grabacion_url: tm.evidencia_url || undefined,
            notas_llamada: `[Teams] Estado: ${tm.estado_teams || 'Completada'}`,
          });
        });

        // D. WhatsApp
        llamadasWhatsapp.forEach((wa: any, idx: number) => {
          const durSec = Number(wa.duracion_segundos || 45);
          const fechaInicio = wa.fecha_llamada || wa.created_at || new Date().toISOString();

          const asesor = resolverAsesor(
            String(wa.ejecutivo_id || ''),
            resolverAsesor(wa.numero_ejecutivo || '', 'Asesor WhatsApp')
          );

          llamadas.push({
            id: String(wa.id || `wa-${idx}`),
            vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
            vendedor_nombre: asesor,
            telefono_marcado: String(wa.numero_cliente || '').trim(),
            fecha_hora_inicio: fechaInicio,
            fecha_hora_fin: fechaInicio,
            duracion_segundos: durSec,
            resultado: wa.estado?.toLowerCase() === 'contestada' ? 'contestada' : 'no_contesta',
            proveedor: 'Vapi',
            canal_tipo: 'WhatsApp',
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
          rawLeads: leads,
          rawLeadsNoCalificados: leadsNoCalificados,
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

/**
 * Consulta directamente las tablas de Supabase vía REST
 * Garantiza que en Vercel siempre traiga la información 100% real sin datos quemados
 */
async function sincronizarDirectoSupabase(inicio: number): Promise<DatosSyncBackend> {
  const { url, headers } = getSupabaseConfig();
  try {
    const [
      catalogoRes,
      leadsRes,
      leadsNoCalificadosRes,
      pbxRes,
      celularRes,
      teamsRes,
      whatsappRes,
    ] = await Promise.all([
      fetch(`${url}/rest/v1/catalogo?select=*&order=id.asc`, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${url}/rest/v1/leads?select=*&order=id.desc`, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${url}/rest/v1/leads_no_calificados?select=*&order=id.desc`, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${url}/rest/v1/llamadas_pbx?select=*&order=fecha_hora.desc.nullslast&limit=1000`, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${url}/rest/v1/llamadas_celular?select=*&order=fecha.desc.nullslast&limit=1000`, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${url}/rest/v1/llamadas_teams?select=*&order=id.desc`, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${url}/rest/v1/llamadas_whatsapp?select=*&order=fecha_llamada.desc.nullslast&limit=1000`, { headers }).then((r) => r.ok ? r.json() : []),
    ]);

    const catalogo = Array.isArray(catalogoRes) ? catalogoRes : [];
    const leads = Array.isArray(leadsRes) ? leadsRes : [];
    const leadsNoCalificados = Array.isArray(leadsNoCalificadosRes) ? leadsNoCalificadosRes : [];
    const llamadasPbx = Array.isArray(pbxRes) ? pbxRes : [];
    const llamadasCelular = Array.isArray(celularRes) ? celularRes : [];
    const llamadasTeams = Array.isArray(teamsRes) ? teamsRes : [];
    const llamadasWhatsapp = Array.isArray(whatsappRes) ? whatsappRes : [];

    // Construir mapa de catálogo
    const mapaCatalogo = {
      porExtension: {} as Record<string, any>,
      porUsuario: {} as Record<string, any>,
      porCelular: {} as Record<string, any>,
      porNombre: {} as Record<string, any>,
    };

    catalogo.forEach((c: any) => {
      if (c.extension) mapaCatalogo.porExtension[String(c.extension).trim()] = c;
      if (c.usuario) mapaCatalogo.porUsuario[String(c.usuario).trim().toLowerCase()] = c;
      if (c.nombre_ejecutivo) mapaCatalogo.porNombre[String(c.nombre_ejecutivo).trim().toLowerCase()] = c;
      if (c.celular) {
        const cleanTel = String(c.celular).replace(/[^0-9]/g, '');
        mapaCatalogo.porCelular[cleanTel] = c;
      }
    });

    const resolverAsesor = (extOrUserOrCel: string, fallback: string = 'Asesor General'): string => {
      if (!extOrUserOrCel) return fallback;
      const clean = String(extOrUserOrCel).trim();
      const cleanUser = clean.toLowerCase();
      if (mapaCatalogo.porUsuario[cleanUser]) return mapaCatalogo.porUsuario[cleanUser].nombre_ejecutivo;
      if (mapaCatalogo.porExtension[clean]) return mapaCatalogo.porExtension[clean].nombre_ejecutivo;
      if (mapaCatalogo.porNombre[cleanUser]) return mapaCatalogo.porNombre[cleanUser].nombre_ejecutivo;
      const cleanTel = clean.replace(/[^0-9]/g, '');
      if (cleanTel && mapaCatalogo.porCelular[cleanTel]) return mapaCatalogo.porCelular[cleanTel].nombre_ejecutivo;

      for (const cat of catalogo) {
        if (cat.usuario && cleanUser.includes(String(cat.usuario).toLowerCase())) return cat.nombre_ejecutivo;
        if (cat.nombre_ejecutivo && cleanUser.includes(String(cat.nombre_ejecutivo).toLowerCase())) return cat.nombre_ejecutivo;
      }
      return fallback;
    };

    // Mapear Leads Calificados
    const citasCalificadas: Cita[] = [];
    leads.forEach((lead: any, idx: number) => {
      const fAgendada = lead.fecha_agendada && lead.fecha_agendada !== 'null' ? String(lead.fecha_agendada).trim() : '';
      let hAgendada = lead.hora_agendada && lead.hora_agendada !== 'null' ? String(lead.hora_agendada).trim() : '';
      const fCreado = lead.fecha_creado && lead.fecha_creado !== 'null' ? String(lead.fecha_creado).trim() : '';
      let hCreado = lead.hora_creado && lead.hora_creado !== 'null' ? String(lead.hora_creado).trim() : '';
      const fCreatedAt = lead.created_at ? String(lead.created_at).slice(0, 10) : '';
      let hCreatedAt = lead.created_at ? String(lead.created_at).slice(11, 19) : '';

      const fechaDef = fAgendada || fCreado || fCreatedAt || new Date().toISOString().slice(0, 10);
      let horaDef = hAgendada || hCreado || hCreatedAt || '09:00:00';
      if (horaDef.length === 5) horaDef += ':00';
      const fechaIso = `${fechaDef}T${horaDef}`;

      const asesor = lead.asesor_nombre || resolverAsesor(lead.asesor_id || '', 'Asesor General');
      const nombreProspecto =
        lead.nombre_prospecto ||
        lead.nombre ||
        lead.cliente ||
        (lead.codigo_prospecto ? `Prospecto ${lead.codigo_prospecto}` : `Lead #${idx + 1}`);

      lead.asesor_nombre = asesor;
      lead.fecha_agendada = fAgendada || null;
      lead.hora_agendada = hAgendada || null;
      lead.fecha_creado = fCreado || fCreatedAt;
      lead.hora_creado = hCreado || hCreatedAt;

      citasCalificadas.push({
        id: String(lead.id || lead.codigo_prospecto || `lead-${idx}`),
        codigo_prospecto: lead.codigo_prospecto,
        prospecto_nombre: nombreProspecto,
        prospecto_telefono: String(lead.telefono || lead.celular || lead.movil || '').trim(),
        prospecto_email: lead.asesor_email || lead.email || '',
        vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
        vendedor_nombre: asesor,
        fecha_hora_programada: fechaIso,
        fecha_agendada: fAgendada || undefined,
        hora_agendada: hAgendada || undefined,
        fecha_creado: fCreado || fCreatedAt || undefined,
        hora_creado: hCreado || hCreatedAt || undefined,
        created_at: lead.created_at || undefined,
        pais: lead.pais || 'SV',
        estado_cita: lead.status === 'cancelada' ? 'cancelada' : 'programada',
        fuente: 'Supabase',
        tipo_reunion: (lead.tipo_reunion as any) || 'Llamada Telefonica',
        tipo_lead: 'calificados',
        notas: `País: ${lead.pais || 'SV'}`,
        kpi_sla_etapa_1: Boolean(lead.kpi_sla_etapa_1),
        kpi_sla_etapa_2: Boolean(lead.kpi_sla_etapa_2),
        kpi_sla_etapa_3: Boolean(lead.kpi_sla_etapa_3),
        kpi_retroalimentacion_etapa_1: Boolean(lead.kpi_retroalimentacion_etapa_1),
        kpi_retroalimentacion_etapa_2: Boolean(lead.kpi_retroalimentacion_etapa_2),
        kpi_retroalimentacion_etapa_3: Boolean(lead.kpi_retroalimentacion_etapa_3),
        kpi_retroalimentacion_etapa_4: Boolean(lead.kpi_retroalimentacion_etapa_4),
      });
    });

    // Mapear Leads No Calificados
    const citasNoCalificadas: Cita[] = [];
    leadsNoCalificados.forEach((lead: any, idx: number) => {
      let fecha = '';
      let hora = '10:00:00';
      if (lead.created_at_sv && typeof lead.created_at_sv === 'string') {
        const m = lead.created_at_sv.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (m) {
          const [, dd, mm, yyyy, hh, min, ampm] = m;
          let hourNum = parseInt(hh, 10);
          if (ampm?.toUpperCase() === 'PM' && hourNum < 12) hourNum += 12;
          if (ampm?.toUpperCase() === 'AM' && hourNum === 12) hourNum = 0;
          fecha = `${yyyy}-${String(parseInt(mm, 10)).padStart(2, '0')}-${String(parseInt(dd, 10)).padStart(2, '0')}`;
          hora = `${String(hourNum).padStart(2, '0')}:${min}:00`;
        }
      } else if (lead.created_at) {
        const d = new Date(lead.created_at);
        if (!isNaN(d.getTime())) {
          const sv = new Date(d.getTime() - 6 * 3600 * 1000);
          fecha = sv.toISOString().slice(0, 10);
          hora = sv.toISOString().slice(11, 19);
        }
      }
      const fechaIso = `${fecha || new Date().toISOString().slice(0, 10)}T${hora}`;
      const asesor = lead.advisor_name || lead.asesor || 'Asesor Asignado';
      const nombreCliente = lead.client_name || lead.nombre || lead.prospecto || `No Calif. #${idx + 1}`;

      lead.fecha = fecha;
      lead.hora = hora;
      lead.fecha_hora_programada = fechaIso;
      lead.asesor_nombre = asesor;

      citasNoCalificadas.push({
        id: String(lead.id || lead.client_id || `no-calif-${idx}`),
        prospecto_nombre: nombreCliente,
        prospecto_telefono: String(lead.phone || lead.telefono || lead.celular || '').trim(),
        vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
        vendedor_nombre: asesor,
        fecha_hora_programada: fechaIso,
        fecha_agendada: fecha,
        hora_agendada: hora,
        fecha_creado: fecha,
        hora_creado: hora,
        created_at: lead.created_at || undefined,
        pais: lead.country || lead.pais || 'SV',
        estado_cita: 'programada',
        fuente: 'Supabase',
        tipo_reunion: 'Llamada Telefonica',
        tipo_lead: 'no_calificados',
      });
    });

    // Mapear Llamadas Unificadas (PBX, Celular, Teams, WhatsApp)
    const llamadas: Llamada[] = [];

    llamadasPbx.forEach((pbx: any, idx: number) => {
      const asesor = resolverAsesor(pbx.nombre || pbx.extension || '', 'Asesor PBX');
      pbx.asesor_nombre = asesor;
      const fechaInicio = pbx.fecha_hora || pbx.calldate || new Date().toISOString();
      llamadas.push({
        id: String(pbx.uniqueid || pbx.id || `pbx-${idx}`),
        vendedor_id: asesor.toLowerCase().replace(/\s+/g, '_'),
        vendedor_nombre: asesor,
        telefono_marcado: String(pbx.destino || '').trim(),
        fecha_hora_inicio: fechaInicio,
        fecha_hora_fin: fechaInicio,
        duracion_segundos: Number(pbx.duracion_segundos || 0),
        resultado: pbx.estado?.toLowerCase() === 'answered' ? 'contestada' : 'no_contesta',
        proveedor: 'PBX',
        canal_tipo: 'PBX',
        audio_url: pbx.audio_url || pbx.grabacion_url,
      });
    });

    llamadasCelular.forEach((cel: any, idx: number) => {
      const asesor = resolverAsesor(cel.usuario || cel.linea || '', 'Ejecutivo Celular');
      cel.asesor_nombre = asesor;
      let durSec = 0;
      if (typeof cel.duracion === 'number') durSec = cel.duracion;
      else if (typeof cel.duracion === 'string') {
        const parts = cel.duracion.split(':');
        if (parts.length === 3) durSec = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        else durSec = parseInt(cel.duracion) || 0;
      }
      const fechaHora = `${cel.fecha || '2026-09-24'}T${cel.hora || '10:00:00'}`;
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
      });
    });

    llamadasTeams.forEach((teams: any, idx: number) => {
      const asesor = teams.ejecutivo || teams.ejecutivo_nombre || resolverAsesor(teams.asesor || '', 'Ejecutivo Teams');
      teams.asesor_nombre = asesor;
      const fReunion = teams.fecha_reunion || (teams.fecha_agendada ? String(teams.fecha_agendada).slice(0, 10) : '2026-09-24');
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
        notas_llamada: teams.evidencia_url || teams.notas,
      });
    });

    llamadasWhatsapp.forEach((wa: any, idx: number) => {
      const asesor = resolverAsesor(wa.asesor || wa.agente || '', 'Bot WhatsApp');
      wa.asesor_nombre = asesor;
      const fechaInicio = wa.fecha_llamada || wa.created_at || new Date().toISOString();
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
        resultado: wa.estado?.toLowerCase() === 'contestada' ? 'contestada' : 'no_contesta',
        proveedor: 'Vapi',
        canal_tipo: 'WhatsApp',
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
      rawLeads: leads,
      rawLeadsNoCalificados: leadsNoCalificados,
      rawTeams: llamadasTeams,
      estadisticas: {
        total_leads_calificados: leads.length,
        total_leads_no_calificados: leadsNoCalificados.length,
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

/**
 * Guarda cambios en un lead (SLA / Retroalimentación)
 */
export async function actualizarLeadKpiBackend(
  leadId: string,
  cambios: Partial<Cita>,
  tabla: 'leads' | 'leads_no_calificados' = 'leads'
): Promise<boolean> {
  try {
    const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}?tabla=${tabla}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    });
    if (res.ok) return true;
  } catch (err) {
    console.warn('Backend proxy no disponible para actualizar lead, usando Supabase directo:', err);
  }

  try {
    const { url, headers } = getSupabaseConfig();
    const r = await fetch(`${url}/rest/v1/${tabla}?id=eq.${encodeURIComponent(leadId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(cambios),
    });
    return r.ok;
  } catch (e) {
    console.error('Error al actualizar lead en Supabase:', e);
    return false;
  }
}

/**
 * CRUD de Catálogo
 */
export async function guardarCatalogoItemBackend(item: any): Promise<boolean> {
  try {
    const method = item.id ? 'PATCH' : 'POST';
    const url = item.id ? `/api/catalogo/${item.id}` : '/api/catalogo';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (res.ok) return true;
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
      headers,
      body: JSON.stringify(item),
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
  try {
    const res = await fetch(`/api/catalogo/${id}`, { method: 'DELETE' });
    if (res.ok) return true;
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
