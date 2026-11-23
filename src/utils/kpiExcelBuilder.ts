import { CruceAuditoria, EstadoCumplimiento, ParametrosAuditoria } from '../types';
import { PARAMETROS_DEFAULT } from '../data/mockData';
import { ExcelSheetConfig, formatearSubtituloExportacion } from './excelExport';
import { normalizarTipoReunion } from './leadValidation';
import { clasificarHorarioIngreso, obtenerTimestampCreacionLead } from './matchingEngine';

export type ColorSemaforo =
  | 'VERDE'
  | 'AMARILLO'
  | 'ROJO'
  | 'NO_LLAMO'
  | 'OTRO_DIA'
  | 'ADELANTADA'
  | 'PENDIENTE';

export function formatearPaisAlcance(paisFiltro?: string): string {
  const p = String(paisFiltro || 'TODOS').toUpperCase().trim();
  if (p === 'SV') return 'SV';
  if (p === 'GT') return 'GT';
  return 'SV y GT';
}

export function formatearAlcanceLeads(esNoCalificado: boolean, paisFiltro?: string): string {
  const modo = esNoCalificado ? 'No Calificados' : 'Calificados';
  return `${modo} de ${formatearPaisAlcance(paisFiltro)}`;
}

export function obtenerCanalLlamadaLabel(c: CruceAuditoria): string {
  if (c.canal_utilizado) return c.canal_utilizado;
  const prov = String(c.llamada?.proveedor || '').toLowerCase();
  if (prov.includes('pbx')) return 'PBX';
  if (prov.includes('cel')) return 'Celular';
  if (prov.includes('whats')) return 'WhatsApp';
  if (prov.includes('teams')) return 'Teams';
  if (c.llamada?.proveedor) return String(c.llamada.proveedor);
  return c.fecha_llamada ? 'Llamada' : 'Sin llamada';
}

export function clasificarSemaforoCruce(estado: EstadoCumplimiento): {
  color: ColorSemaforo;
  etiquetaSemaforo: string;
  tipificacion: string;
} {
  switch (estado) {
    case 'A_TIEMPO':
      return {
        color: 'VERDE',
        etiquetaSemaforo: '🟢 VERDE · A Tiempo',
        tipificacion: 'A Tiempo',
      };
    case 'TARDE_LEVE':
      return {
        color: 'AMARILLO',
        etiquetaSemaforo: '🟡 AMARILLO · Tarde Leve',
        tipificacion: 'Tarde Leve',
      };
    case 'LLAMADA_CORTA':
      return {
        color: 'AMARILLO',
        etiquetaSemaforo: '🟡 AMARILLO · Corta / Buzón',
        tipificacion: 'Tarde Leve (Corta / Buzón)',
      };
    case 'TARDE_GRAVE':
      return {
        color: 'ROJO',
        etiquetaSemaforo: '🔴 ROJO · Tarde Grave',
        tipificacion: 'Tarde Grave',
      };
    case 'NO_LLAMO':
      return {
        color: 'NO_LLAMO',
        etiquetaSemaforo: '⚫ NO LLAMÓ',
        tipificacion: 'No Llamó',
      };
    case 'ADELANTADA':
      return {
        color: 'ADELANTADA',
        etiquetaSemaforo: '🟦 ADELANTADA',
        tipificacion: 'Adelantada',
      };
    case 'LLAMO_OTRO_DIA':
      return {
        color: 'OTRO_DIA',
        etiquetaSemaforo: '🔵 OTRO DÍA',
        tipificacion: 'Llamó Otro Día',
      };
    case 'PENDIENTE':
    default:
      return {
        color: 'PENDIENTE',
        etiquetaSemaforo: '⚪ PENDIENTE',
        tipificacion: 'Pendiente / Próxima',
      };
  }
}

export function etiquetaSemaforoCruce(estado: EstadoCumplimiento): {
  color: ColorSemaforo;
  etiquetaSemaforo: string;
  tipificacion: string;
} {
  return clasificarSemaforoCruce(estado);
}

interface ResumenEjecutivoFila {
  semaforo: string;
  vendedor: string;
  pais: string;
  total: number;
  enSemaforo: number;
  aTiempo: number;
  tardeLeve: number;
  tardeGrave: number;
  adelantada: number;
  otroDia: number;
  noLlamo: number;
  pendientes: number;
  canales: string;
  pctCumplimiento: number;
  desfasePromedio: number;
}

function formatearResumenCanales(canales: {
  pbx: number;
  celular: number;
  whatsapp: number;
  teams: number;
  otro: number;
}): string {
  const partes: string[] = [];
  if (canales.pbx > 0) partes.push(`PBX: ${canales.pbx}`);
  if (canales.celular > 0) partes.push(`Cel: ${canales.celular}`);
  if (canales.whatsapp > 0) partes.push(`WA: ${canales.whatsapp}`);
  if (canales.teams > 0) partes.push(`Teams: ${canales.teams}`);
  if (canales.otro > 0) partes.push(`Otro: ${canales.otro}`);
  return partes.length > 0 ? partes.join(' · ') : 'Sin llamadas';
}

export function construirHojasKpiExcel(params: {
  cruces: CruceAuditoria[];
  parametros?: ParametrosAuditoria;
  esNoCalificado: boolean;
  fechaInicio?: string;
  fechaFin?: string;
  paisFiltro?: string;
  asesorFiltro?: string | null;
  extraInfo?: string;
  hojasExtra?: ExcelSheetConfig<any>[];
}): ExcelSheetConfig<any>[] {
  const {
    cruces,
    parametros = PARAMETROS_DEFAULT,
    esNoCalificado,
    fechaInicio,
    fechaFin,
    paisFiltro = 'TODOS',
    asesorFiltro,
    extraInfo,
    hojasExtra = [],
  } = params;

  const tolAntes = parametros.tolerancia_anticipacion_minutos ?? 15;
  const tolDespues = parametros.tolerancia_retraso_a_tiempo_minutos ?? 20;
  const umbralGrave = parametros.umbral_retraso_grave_minutos ?? 120;
  const durMin = parametros.duracion_minima_efectiva_segundos ?? 45;
  const hIni = parametros.horario_laboral_inicio || '08:00';
  const hFin = parametros.horario_laboral_fin || '18:00';

  const alcanceLabel = formatearAlcanceLeads(esNoCalificado, paisFiltro);
  const subtitulo = formatearSubtituloExportacion({
    fechaInicio,
    fechaFin,
    totalFilas: cruces.length,
    modo: `${alcanceLabel}${asesorFiltro && asesorFiltro !== 'TODOS' ? ` · Ejecutivo: ${asesorFiltro}` : ''}`,
    extra: extraInfo,
  });

  // 1. Resumen por Ejecutivo (Semáforo Verde/Amarillo/Rojo + categorías fuera del semáforo)
  const mapaEjecutivos = new Map<
    string,
    {
      vendedor: string;
      paises: Set<string>;
      total: number;
      aTiempo: number;
      tardeLeve: number;
      tardeGrave: number;
      adelantada: number;
      otroDia: number;
      noLlamo: number;
      pendientes: number;
      sumaDesfase: number;
      contDesfase: number;
      canales: { pbx: number; celular: number; whatsapp: number; teams: number; otro: number };
    }
  >();

  const canalesGlobal = { pbx: 0, celular: 0, whatsapp: 0, teams: 0, otro: 0 };

  cruces.forEach((c) => {
    const v = c.vendedor_nombre || 'Sin Asignar';
    if (!mapaEjecutivos.has(v)) {
      mapaEjecutivos.set(v, {
        vendedor: v,
        paises: new Set<string>(),
        total: 0,
        aTiempo: 0,
        tardeLeve: 0,
        tardeGrave: 0,
        adelantada: 0,
        otroDia: 0,
        noLlamo: 0,
        pendientes: 0,
        sumaDesfase: 0,
        contDesfase: 0,
        canales: { pbx: 0, celular: 0, whatsapp: 0, teams: 0, otro: 0 },
      });
    }
    const item = mapaEjecutivos.get(v)!;
    const p = String(c.pais || c.cita?.pais || 'SV').toUpperCase();
    item.paises.add(p);
    item.total++;

    const sem = etiquetaSemaforoCruce(c.estado_cumplimiento);
    if (sem.color === 'VERDE') item.aTiempo++;
    else if (sem.color === 'AMARILLO') item.tardeLeve++;
    else if (sem.color === 'ROJO') item.tardeGrave++;
    else if (sem.color === 'ADELANTADA') item.adelantada++;
    else if (sem.color === 'OTRO_DIA') item.otroDia++;
    else if (sem.color === 'NO_LLAMO') item.noLlamo++;
    else item.pendientes++;

    if (c.fecha_llamada || c.canal_utilizado || c.llamada) {
      const canal = obtenerCanalLlamadaLabel(c).toLowerCase();
      if (canal.includes('pbx')) {
        item.canales.pbx++;
        canalesGlobal.pbx++;
      } else if (canal.includes('cel')) {
        item.canales.celular++;
        canalesGlobal.celular++;
      } else if (canal.includes('whats')) {
        item.canales.whatsapp++;
        canalesGlobal.whatsapp++;
      } else if (canal.includes('teams')) {
        item.canales.teams++;
        canalesGlobal.teams++;
      } else if (canal !== 'sin llamada') {
        item.canales.otro++;
        canalesGlobal.otro++;
      }
    }

    if (typeof c.desfase_minutos === 'number' && !Number.isNaN(c.desfase_minutos)) {
      item.sumaDesfase += c.desfase_minutos;
      item.contDesfase++;
    }
  });

  const filasEjecutivos: ResumenEjecutivoFila[] = Array.from(mapaEjecutivos.values())
    .map((e) => {
      const enSemaforo = e.aTiempo + e.tardeLeve + e.tardeGrave;
      const auditables = Math.max(0, e.total - e.pendientes);
      const pctNum =
        auditables > 0 ? Math.round((e.aTiempo / auditables) * 100) : e.total > 0 ? 100 : 0;

      let semaforo = '🟢 VERDE · Excelente';
      if (pctNum >= 85) {
        semaforo = '🟢 VERDE · Excelente';
      } else if (pctNum >= 70) {
        semaforo = '🟢 VERDE · Bueno';
      } else if (pctNum >= 40) {
        semaforo = '🟡 AMARILLO · Aceptable';
      } else {
        semaforo = '🔴 ROJO · En Riesgo';
      }

      return {
        semaforo,
        vendedor: e.vendedor,
        pais: Array.from(e.paises).sort().join(' / ') || 'SV',
        total: e.total,
        enSemaforo,
        aTiempo: e.aTiempo,
        tardeLeve: e.tardeLeve,
        tardeGrave: e.tardeGrave,
        adelantada: e.adelantada,
        otroDia: e.otroDia,
        noLlamo: e.noLlamo,
        pendientes: e.pendientes,
        canales: formatearResumenCanales(e.canales),
        pctCumplimiento: pctNum / 100,
        desfasePromedio: e.contDesfase > 0 ? Number((e.sumaDesfase / e.contDesfase).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  const sumTotal = filasEjecutivos.reduce((acc, r) => acc + r.total, 0);
  const sumEnSemaforo = filasEjecutivos.reduce((acc, r) => acc + r.enSemaforo, 0);
  const sumVerde = filasEjecutivos.reduce((acc, r) => acc + r.aTiempo, 0);
  const sumAmarillo = filasEjecutivos.reduce((acc, r) => acc + r.tardeLeve, 0);
  const sumRojo = filasEjecutivos.reduce((acc, r) => acc + r.tardeGrave, 0);
  const sumAdelantada = filasEjecutivos.reduce((acc, r) => acc + r.adelantada, 0);
  const sumOtroDia = filasEjecutivos.reduce((acc, r) => acc + r.otroDia, 0);
  const sumNoLlamo = filasEjecutivos.reduce((acc, r) => acc + r.noLlamo, 0);
  const sumPend = filasEjecutivos.reduce((acc, r) => acc + r.pendientes, 0);
  const sumAuditables = Math.max(0, sumTotal - sumPend);
  const pctGlobal = sumAuditables > 0 ? sumVerde / sumAuditables : sumTotal > 0 ? 1 : 0;

  const hojaResumenEjecutivo: ExcelSheetConfig<ResumenEjecutivoFila> = {
    name: 'Resumen por Ejecutivo',
    title: `Resumen KPI por Ejecutivo — ${alcanceLabel}`,
    subtitle: subtitulo,
    accentHex: '0F172A',
    columns: [
      { header: 'Semáforo', key: 'semaforo', width: 22, semantic: 'semaforo', align: 'center' },
      { header: 'Ejecutivo / Asesor', key: 'vendedor', width: 28 },
      { header: 'País', key: 'pais', width: 10, align: 'center' },
      { header: 'Total Leads', key: 'total', width: 12, align: 'right' },
      { header: 'En Semáforo', key: 'enSemaforo', width: 13, align: 'right' },
      { header: 'A Tiempo (Verde)', key: 'aTiempo', width: 17, align: 'right', columnTint: 'verde' },
      { header: 'Tarde Leve (Amarillo)', key: 'tardeLeve', width: 20, align: 'right', columnTint: 'amarillo' },
      { header: 'Tarde Grave (Rojo)', key: 'tardeGrave', width: 19, align: 'right', columnTint: 'rojo' },
      { header: 'Adelantadas', key: 'adelantada', width: 13, align: 'right' },
      { header: 'Otro Día', key: 'otroDia', width: 11, align: 'right' },
      { header: 'No Llamó', key: 'noLlamo', width: 12, align: 'right' },
      { header: 'Pendientes', key: 'pendientes', width: 12, align: 'right' },
      { header: 'Canales (PBX / Cel / WA / Teams)', key: 'canales', width: 30, wrapText: true },
      { header: '% Cumplimiento', key: 'pctCumplimiento', width: 16, numFmt: '0%', align: 'right' },
      { header: 'Desfase Prom. (min)', key: 'desfasePromedio', width: 18, align: 'right' },
    ],
    rows: filasEjecutivos,
    totalsRow: {
      semaforo:
        pctGlobal >= 0.7
          ? `🟢 VERDE · ${Math.round(pctGlobal * 100)}% Meta`
          : pctGlobal >= 0.4
          ? `🟡 AMARILLO · ${Math.round(pctGlobal * 100)}% Meta`
          : `🔴 ROJO · ${Math.round(pctGlobal * 100)}% Meta`,
      vendedor: 'TOTAL GENERAL',
      pais: formatearPaisAlcance(paisFiltro),
      total: sumTotal,
      enSemaforo: sumEnSemaforo,
      aTiempo: sumVerde,
      tardeLeve: sumAmarillo,
      tardeGrave: sumRojo,
      adelantada: sumAdelantada,
      otroDia: sumOtroDia,
      noLlamo: sumNoLlamo,
      pendientes: sumPend,
      canales: formatearResumenCanales(canalesGlobal),
      pctCumplimiento: pctGlobal,
      desfasePromedio: '-',
    },
  };

  // 2. Detalle de Leads (con Semáforo único, Horario de Ingreso y Canal de Llamada)
  const crucesOrdenados = [...cruces].sort((a, b) => {
    const fA = a.cita?.fecha_agendada || a.fecha_cita || a.cita?.created_at || '';
    const fB = b.cita?.fecha_agendada || b.fecha_cita || b.cita?.created_at || '';
    return String(fB).localeCompare(String(fA));
  });

  const hojaDetalle: ExcelSheetConfig<CruceAuditoria> = {
    name: 'Detalle de Leads',
    title: `Detalle Completo de Auditoría KPI — ${alcanceLabel}`,
    subtitle: subtitulo,
    accentHex: '1E293B',
    columns: [
      {
        header: 'Semáforo',
        key: 'semaforo',
        width: 24,
        value: (c) => etiquetaSemaforoCruce(c.estado_cumplimiento).etiquetaSemaforo,
        semantic: 'semaforo',
        align: 'center',
      },
      {
        header: 'Código',
        key: 'codigo',
        width: 15,
        value: (c) => c.cita?.codigo_prospecto || c.cita?.id || c.id,
      },
      { header: 'Prospecto / Cliente', key: 'prospecto_nombre', width: 28 },
      { header: 'Teléfono', key: 'telefono', width: 16 },
      {
        header: 'País',
        key: 'pais',
        width: 9,
        value: (c) => String(c.pais || c.cita?.pais || 'SV').toUpperCase(),
        align: 'center',
      },
      { header: 'Ejecutivo Asignado', key: 'vendedor_nombre', width: 25 },
      {
        header: 'Horario Ingreso',
        key: 'horario_ingreso_tipo',
        width: 23,
        value: (c) =>
          c.horario_ingreso_tipo ||
          clasificarHorarioIngreso(obtenerTimestampCreacionLead(c.cita), hIni, hFin),
        semantic: 'status',
        align: 'center',
      },
      {
        header: 'Tipo de Reunión',
        key: 'tipo_reunion',
        width: 20,
        value: (c) => normalizarTipoReunion(c.cita?.tipo_reunion),
      },
      {
        header: esNoCalificado ? 'Fecha Ingreso' : 'Fecha Cita',
        key: 'fecha_cita_col',
        width: 14,
        value: (c) =>
          c.cita?.fecha_agendada ||
          (c.fecha_cita ? c.fecha_cita.slice(0, 10) : '-'),
        align: 'center',
      },
      {
        header: esNoCalificado ? 'Hora Ingreso' : 'Hora Cita',
        key: 'hora_cita_col',
        width: 12,
        value: (c) =>
          c.cita?.hora_agendada
            ? c.cita.hora_agendada.slice(0, 8)
            : c.fecha_cita && c.fecha_cita.length >= 16
            ? c.fecha_cita.slice(11, 19)
            : '-',
        align: 'center',
      },
      {
        header: 'Fecha y Hora Llamada',
        key: 'fecha_llamada',
        width: 20,
        value: (c) =>
          c.fecha_llamada ? c.fecha_llamada.replace('T', ' ').slice(0, 19) : 'Sin llamada',
        align: 'center',
      },
      {
        header: 'Canal de Llamada',
        key: 'canal_utilizado',
        width: 16,
        value: (c) => obtenerCanalLlamadaLabel(c),
        align: 'center',
      },
      {
        header: 'Duración (seg)',
        key: 'duracion_llamada_segundos',
        width: 14,
        value: (c) => c.duracion_llamada_segundos ?? 0,
        align: 'right',
      },
      {
        header: 'Desfase (min)',
        key: 'desfase_minutos',
        width: 14,
        value: (c) => (c.desfase_minutos !== undefined ? c.desfase_minutos : '-'),
        align: 'right',
      },
      {
        header: 'Diagnóstico / Observación',
        key: 'explicacion',
        width: 48,
        wrapText: true,
      },
    ],
    rows: crucesOrdenados,
  };

  // 3. Criterios y Tipificaciones (alineado con reglas del Validador 20m / 120m / Fin de Semana / Viernes >= 16:30)
  const filasCriterios = [
    {
      semaforo: '🟢 VERDE · A Tiempo',
      grupo: 'Semáforo · Meta Cumplida',
      calificados: `Llamada realizada entre -${tolAntes} min antes y hasta +${tolDespues} min después de la hora agendada (incluye minuto ${tolDespues}).`,
      nocalificados: `Hasta ${tolDespues} minutos hábiles de retraso desde el ingreso del lead (incluye el minuto ${tolDespues}).`,
      interpretacion: 'Cumplimiento óptimo (Verde en el semáforo). Cuenta positivo en el % Meta.',
    },
    {
      semaforo: '🟡 AMARILLO · Tarde Leve',
      grupo: 'Semáforo · Retraso Leve',
      calificados: `Llamada el mismo día desde el minuto +${tolDespues + 1} hasta antes de cumplir ${umbralGrave} minutos (${tolDespues + 1}–${umbralGrave - 1} min) o llamada corta < ${durMin}s.`,
      nocalificados: `Respuesta hábil desde el minuto ${tolDespues + 1} hasta antes de cumplir ${umbralGrave} minutos (${tolDespues + 1}–${umbralGrave - 1} min).`,
      interpretacion: 'Alerta amarilla en el semáforo por demora moderada antes de las 2 horas.',
    },
    {
      semaforo: '🔴 ROJO · Tarde Grave',
      grupo: 'Semáforo · Retraso Grave',
      calificados: `A partir de ${umbralGrave} minutos de retraso el mismo día (2 horas exactas incluidas: ≥ ${umbralGrave} min).`,
      nocalificados: `A partir de ${umbralGrave} minutos hábiles de retraso respecto al ingreso o inicio de jornada (≥ ${umbralGrave} min).`,
      interpretacion: 'Infracción grave (Rojo en el semáforo). Requiere revisión inmediata.',
    },
    {
      semaforo: '🔵 FIN DE SEMANA',
      grupo: 'Regla Horario Ingreso',
      calificados: 'No se validan gestiones ni corren tiempos hábiles sábado ni domingo.',
      nocalificados: `Leads ingresados sábado o domingo inician su conteo el lunes a las ${hIni} AM.`,
      interpretacion: 'Se identifica en tabla con la etiqueta "Fin de Semana".',
    },
    {
      semaforo: '🟡 VIERNES TARDE (≥16:30)',
      grupo: 'Regla Horario Ingreso',
      calificados: 'Asignaciones del viernes desde las 16:30 se consideran fuera de cierre semanal.',
      nocalificados: `Leads asignados el viernes desde las 16:30 en adelante pasan al lunes ${hIni} AM para el conteo de ${tolDespues} min.`,
      interpretacion: 'Se identifica con la etiqueta "Viernes Tarde (≥16:30)".',
    },
    {
      semaforo: '🌙 FUERA DE HORARIO (NOCHE)',
      grupo: 'Regla Horario Ingreso',
      calificados: `Jornada laboral de ${hIni} a ${hFin}, lunes a viernes.`,
      nocalificados: `Leads ingresados L-V antes de las ${hIni} o después de las ${hFin} inician conteo a las ${hIni} AM del día hábil correspondiente.`,
      interpretacion: 'Evita penalizaciones nocturnas en Speed-to-Lead.',
    },
    {
      semaforo: '🟦 ADELANTADA',
      grupo: 'Fuera del Semáforo',
      calificados: `Llamada realizada el mismo día más de ${tolAntes} min antes de la hora agendada.`,
      nocalificados: 'Contacto anticipado antes de la ventana límite.',
      interpretacion: 'Se contabiliza en los 4 indicadores bajo Leads/Citas del Período.',
    },
    {
      semaforo: '🔵 OTRO DÍA',
      grupo: 'Fuera del Semáforo',
      calificados: 'Llamada registrada en una fecha distinta al día agendado de la cita.',
      nocalificados: 'Contacto efectuado en un día distinto al de asignación/ventana.',
      interpretacion: 'Se contabiliza en "Otro Día" fuera del semáforo.',
    },
    {
      semaforo: '⚫ NO LLAMÓ',
      grupo: 'Fuera del Semáforo',
      calificados: 'Cita vencida sin llamada en PBX, Celular, WhatsApp ni reunión Teams.',
      nocalificados: `Lead vencido más allá de ${tolDespues} min hábiles sin registro de llamada.`,
      interpretacion: 'Se contabiliza en el indicador "No Llamó" fuera del semáforo.',
    },
    {
      semaforo: '⚪ PENDIENTE',
      grupo: 'Fuera del Semáforo',
      calificados: 'Cita programada para una fecha futura (aún no vence).',
      nocalificados: 'Lead reciente cuyo límite hábil aún no ha vencido.',
      interpretacion: 'No penaliza el % de cumplimiento hasta vencer su ventana.',
    },
    {
      semaforo: '📋 REGLA · Canales y Teams',
      grupo: 'ProspektIA y Multicanal',
      calificados: `Si ProspektIA envía tipo de llamada null/vacío se asigna "Llamada Telefonica". Si es "Virtual" o "Teams" se aparta automáticamente en Reuniones Teams.`,
      nocalificados: 'Cruza contra PBX (SV/GT), Celular, WhatsApp y Teams filtrados por el Catálogo oficial.',
      interpretacion: 'Cobertura multicanal completa y clasificación por horario laboral.',
    },
  ];

  const hojaCriterios: ExcelSheetConfig<any> = {
    name: 'Criterios y Tipificaciones',
    title: `Catálogo de Semáforo y Criterios del Validador — ${alcanceLabel}`,
    subtitle: `Parámetros activos: Anticipación -${tolAntes}m | A Tiempo ≤${tolDespues}m | Tarde Leve ${tolDespues + 1}-${umbralGrave - 1}m | Tarde Grave ≥${umbralGrave}m | Jornada ${hIni}-${hFin} L-V (Vie ≥16:30 → Lun ${hIni})`,
    accentHex: '334155',
    columns: [
      { header: 'Semáforo / Regla', key: 'semaforo', width: 28, semantic: 'semaforo', align: 'center' },
      { header: 'Clasificación', key: 'grupo', width: 26 },
      { header: 'Criterio — Leads Calificados (Citas)', key: 'calificados', width: 48, wrapText: true },
      { header: 'Criterio — Leads No Calificados', key: 'nocalificados', width: 48, wrapText: true },
      { header: 'Acción / Interpretación', key: 'interpretacion', width: 42, wrapText: true },
    ],
    rows: filasCriterios,
  };

  return [hojaResumenEjecutivo, hojaDetalle, hojaCriterios, ...hojasExtra];
}

