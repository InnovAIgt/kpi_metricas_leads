export interface Cita {
  id: string;
  prospecto_nombre: string;
  prospecto_telefono: string;
  prospecto_email: string;
  vendedor_id: string;
  vendedor_nombre: string;
  fecha_hora_programada: string; // ISO string
  estado_cita: 'programada' | 'asistio' | 'no_show' | 'reprogramada' | 'cancelada';
  fuente: 'Calendly' | 'HubSpot' | 'Cal.com' | 'Google Calendar' | 'Supabase' | 'Manual';
  tipo_reunion:
    | 'Demostración'
    | 'Discovery Call'
    | 'Cierre'
    | 'Seguimiento'
    | 'Onboarding'
    | 'Llamada Telefonica'
    | 'Llamada Virtual Teams'
    | 'Presencial'
    | string;
  notas?: string;
  valor_estimado?: number;

  // Campos reales de public.leads / public.leads_no_calificados para KPIs SLA y Retroalimentación
  codigo_prospecto?: string;
  fecha_agendada?: string;
  hora_agendada?: string;
  fecha_creado?: string;
  hora_creado?: string;
  pais?: string;
  tipo_lead?: 'calificados' | 'no_calificados';
  kpi_sla_etapa_1?: boolean;
  kpi_sla_etapa_2?: boolean;
  kpi_sla_etapa_3?: boolean;
  kpi_retroalimentacion_etapa_1?: boolean;
  kpi_retroalimentacion_etapa_2?: boolean;
  kpi_retroalimentacion_etapa_3?: boolean;
  kpi_retroalimentacion_etapa_4?: boolean;
}

export interface Llamada {
  id: string;
  vendedor_id: string;
  vendedor_nombre: string;
  telefono_marcado: string;
  prospecto_nombre?: string;
  fecha_hora_inicio: string; // ISO string
  fecha_hora_fin: string; // ISO string
  duracion_segundos: number;
  resultado: 'contestada' | 'buzon' | 'no_contesta' | 'ocupado' | 'fallida';
  proveedor: 'Twilio' | 'CloudTalk' | 'RingCentral' | 'Aircall' | 'Vapi' | 'Zadarma' | 'VoIP';
  grabacion_url?: string;
  notas_llamada?: string;
  canal_tipo?: 'PBX' | 'Celular' | 'WhatsApp' | 'Teams';
}

export type EstadoCumplimiento =
  | 'A_TIEMPO'        // Llamó dentro del margen permitido (+/- 5 min o 1h/9am)
  | 'TARDE_LEVE'      // Llamó con retraso leve (ej: 6 a 15 min)
  | 'TARDE_GRAVE'     // Retraso severo (> 15 min)
  | 'LLAMO_OTRO_DIA'  // Se llamó pero en una fecha/día diferente a la programada
  | 'NO_LLAMO'        // La cita ya pasó o fue hoy en el pasado y no hay registro de llamada
  | 'PENDIENTE'       // Cita próxima / agendada a futuro (no hoy o en el pasado)
  | 'LLAMADA_CORTA'   // Llamó pero duró menos del umbral (<45s) o fue buzón
  | 'ADELANTADA'      // Llamó con más de 5 min de anticipación
  | 'SIN_CITA';       // Llamada realizada sin cita previa

export interface CruceAuditoria {
  id: string;
  cita?: Cita;
  llamada?: Llamada;
  vendedor_id: string;
  vendedor_nombre: string;
  prospecto_nombre: string;
  telefono: string;
  pais?: string;
  fecha_cita?: string;
  fecha_llamada?: string;
  desfase_minutos?: number; // Diferencia en minutos (positivo = tarde, negativo = antes)
  duracion_llamada_segundos?: number;
  estado_cumplimiento: EstadoCumplimiento;
  explicacion: string;
  canal_utilizado?: string;
  fuera_de_horario?: boolean;
  auditado_por_supervisor?: boolean;
  notas_auditoria?: string;
}

export interface ParametrosAuditoria {
  tolerancia_anticipacion_minutos: number; // 5 min antes
  tolerancia_retraso_a_tiempo_minutos: number; // 5 min tarde
  umbral_retraso_grave_minutos: number; // > 15 min
  duracion_minima_efectiva_segundos: number; // 45 seg
  considerar_buzon_como_fallido: boolean;
  horario_laboral_inicio: string; // "08:00"
  horario_laboral_fin: string; // "18:00"
}

export interface VendedorMetricas {
  vendedor_id: string;
  vendedor_nombre: string;
  avatar_url?: string;
  rol: 'Closer' | 'Setter' | 'Account Executive' | 'BDR';
  total_citas: number;
  total_llamadas: number;
  citas_a_tiempo: number;
  citas_tarde_leve: number;
  citas_tarde_grave: number;
  citas_no_llamo: number;
  citas_pendientes?: number;
  citas_llamada_corta: number;
  tasa_cumplimiento_pct: number; // % a tiempo
  promedio_desfase_minutos: number;
  duracion_promedio_minutos: number;
  tasa_asistencia_pct: number;
  score_rendimiento: 'Excelente' | 'Bueno' | 'Aceptable' | 'En Riesgo' | 'Crítico';
}

export interface ResumenKPIs {
  total_citas: number;
  total_llamadas: number;
  citas_llamadas_a_tiempo: number;
  tasa_cumplimiento_general: number; // %
  citas_no_atendidas: number;
  citas_pendientes?: number;
  citas_con_retraso: number;
  citas_llamada_insuficiente: number;
  duracion_total_llamadas_horas: number;
  promedio_tiempo_respuesta_minutos: number;
  tasa_shows_efectivos: number;
}

export interface SupabaseConfig {
  supabase_url: string;
  supabase_anon_key: string;
  edge_function_name: string;
  almacenar_en_bd: boolean;
  frecuencia_sync_minutos: number;
  ultima_sincronizacion?: string;
  conectado: boolean;
}

export type FiltroFecha = 'hoy' | 'ayer' | 'ultimos_7_dias' | 'este_mes' | 'todos';

export type ModoLeads = 'calificados' | 'no_calificados';

// Vistas del nuevo menú lateral
export type VistaApp =
  | 'criterios'
  | 'reg_pbx'
  | 'reg_celular'
  | 'reg_whatsapp'
  | 'reg_leads'
  | 'reg_leads_no_calificados'
  | 'reg_teams'
  | 'catalogo_crud'
  | 'resumen_kpis'
  | 'kpi_cumplimiento'
  | 'kpi_sla'
  | 'kpi_retroalimentacion';
