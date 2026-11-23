import { CruceAuditoria, EstadoCumplimiento, ParametrosAuditoria } from '../types';
import { PARAMETROS_DEFAULT } from '../data/mockData';
import { ExcelSheetConfig, formatearSubtituloExportacion } from './excelExport';
import { normalizarTipoReunion } from './leadValidation';

export type ColorSemaforo = 'VERDE' | 'AMARILLO' | 'ROJO' | 'OTRO_DIA' | 'PENDIENTE';

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
    case 'ADELANTADA':
      return {
        color: 'VERDE',
        etiquetaSemaforo: '🟢 VERDE · Adelantada',
        tipificacion: 'Adelantada',
      };
    case 'TARDE_LEVE':
    case 'TARDE_GRAVE':
      return {
        color: 'AMARILLO',
        etiquetaSemaforo: '🟡 AMARILLO · Tarde',
        tipificacion: 'Tarde',
      };
    case 'LLAMADA_CORTA':
      return {
        color: 'AMARILLO',
        etiquetaSemaforo: '🟡 AMARILLO · Corta / Buzón',
        tipificacion: 'Tarde (Corta / Buzón)',
      };
    case 'NO_LLAMO':
      return {
        color: 'ROJO',
        etiquetaSemaforo: '🔴 ROJO · No Llamó',
        tipificacion: 'No Llamó',
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
  auditables: number;
  aTiempo: number;
  tarde: number;
  noLlamo: number;
  otroDia: number;
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
  const tolDespues = parametros.tolerancia_retraso_a_tiempo_minutos ?? 15;
  const durMin = parametros.duracion_minima_efectiva_segundos ?? 45;
  const hIni = parametros.horario_laboral_inicio || '08:00';
  const hFin = parametros.horario_laboral_fin || '18:00';

  const alcanceLabel = formatearAlcanceLeads(esNoCalificado, paisFiltro);
  const subtitulo = formatearSubtituloExportacion({
    fechaInicio,
    fechaFin,
    totalFilas: cruces.length,
    modo: `${alcanceLabel}${asesorFiltro ? ` · Ejecutivo: ${asesorFiltro}` : ''}`,
    extra: extraInfo,
  });

  // 1. Resumen por Ejecutivo (con Canales de Llamada y Semáforo único sin duplicar nivel)
  const mapaEjecutivos = new Map<
    string,
    {
      vendedor: string;
      paises: Set<string>;
      total: number;
      aTiempo: number;
      tarde: number;
      noLlamo: number;
      otroDia: number;
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
        tarde: 0,
        noLlamo: 0,
        otroDia: 0,
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
    else if (sem.color === 'AMARILLO') item.tarde++;
    else if (sem.color === 'ROJO') item.noLlamo++;
    else if (sem.color === 'OTRO_DIA') item.otroDia++;
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
        auditables,
        aTiempo: e.aTiempo,
        tarde: e.tarde,
        noLlamo: e.noLlamo,
        otroDia: e.otroDia,
        pendientes: e.pendientes,
        canales: formatearResumenCanales(e.canales),
        pctCumplimiento: pctNum / 100,
        desfasePromedio: e.contDesfase > 0 ? Number((e.sumaDesfase / e.contDesfase).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  const sumTotal = filasEjecutivos.reduce((acc, r) => acc + r.total, 0);
  const sumAudit = filasEjecutivos.reduce((acc, r) => acc + r.auditables, 0);
  const sumVerde = filasEjecutivos.reduce((acc, r) => acc + r.aTiempo, 0);
  const sumAmarillo = filasEjecutivos.reduce((acc, r) => acc + r.tarde, 0);
  const sumRojo = filasEjecutivos.reduce((acc, r) => acc + r.noLlamo, 0);
  const sumOtroDia = filasEjecutivos.reduce((acc, r) => acc + r.otroDia, 0);
  const sumPend = filasEjecutivos.reduce((acc, r) => acc + r.pendientes, 0);
  const pctGlobal = sumAudit > 0 ? sumVerde / sumAudit : sumTotal > 0 ? 1 : 0;

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
      { header: 'Auditables', key: 'auditables', width: 12, align: 'right' },
      { header: 'A Tiempo (Verde)', key: 'aTiempo', width: 17, align: 'right', columnTint: 'verde' },
      { header: 'Tarde (Amarillo)', key: 'tarde', width: 17, align: 'right', columnTint: 'amarillo' },
      { header: 'No Llamó (Rojo)', key: 'noLlamo', width: 16, align: 'right', columnTint: 'rojo' },
      { header: 'Otro Día', key: 'otroDia', width: 11, align: 'right' },
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
      auditables: sumAudit,
      aTiempo: sumVerde,
      tarde: sumAmarillo,
      noLlamo: sumRojo,
      otroDia: sumOtroDia,
      pendientes: sumPend,
      canales: formatearResumenCanales(canalesGlobal),
      pctCumplimiento: pctGlobal,
      desfasePromedio: '-',
    },
  };

  // 2. Detalle de Leads (una sola columna de Semáforo sin repetir Tipificación, con Canal de Llamada)
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

  // 3. Criterios y Tipificaciones (sin repetir etiqueta de color dos veces)
  const filasCriterios = [
    {
      semaforo: '🟢 VERDE · A Tiempo',
      grupo: 'Meta Cumplida',
      calificados: `Llamada realizada entre ${tolAntes} min antes y ${tolDespues} min después de la hora agendada (mismo día).`,
      nocalificados: `Llamada dentro de 1 hora desde el ingreso (horario ${hIni}-${hFin} L-V) o hasta las 9:00 AM del siguiente día hábil si entró fuera de horario/fin de semana.`,
      interpretacion: 'Cumplimiento óptimo de puntualidad. Cuenta positivo en el % Meta.',
    },
    {
      semaforo: '🟢 VERDE · Adelantada',
      grupo: 'Meta Cumplida (Proactiva)',
      calificados: `Llamada realizada el mismo día de la cita más de ${tolAntes} min antes de la hora pactada.`,
      nocalificados: 'Contacto inmediato antes del plazo límite.',
      interpretacion: 'Gestión proactiva antes de la hora programada; se agrupa en Verde en el semáforo.',
    },
    {
      semaforo: '🟡 AMARILLO · Tarde',
      grupo: 'Fuera de Tolerancia',
      calificados: `Llamada realizada el mismo día después de +${tolDespues} min respecto a la hora agendada (fuera de tolerancia).`,
      nocalificados: 'Llamada efectuada el mismo día después de vencido el plazo límite (1h hábil o 9:00 AM).',
      interpretacion: 'Clasificación unificada en Amarillo (Tarde) dentro del semáforo de seguimiento.',
    },
    {
      semaforo: '🟡 AMARILLO · Corta / Buzón',
      grupo: 'Seguimiento / Reintento',
      calificados: `Llamada detectada pero con duración menor a ${durMin} segundos o caída en buzón.`,
      nocalificados: `Contacto inferior a ${durMin} segundos efectivos.`,
      interpretacion: 'Requiere reintento para asegurar conversación efectiva.',
    },
    {
      semaforo: '🔴 ROJO · No Llamó',
      grupo: 'Sin Gestión (Crítico)',
      calificados: 'Cita vencida sin ningún registro de llamada en PBX, Celular, WhatsApp o reunión en Teams.',
      nocalificados: 'Plazo límite (1h o 9:00 AM) vencido sin llamada posterior al ingreso del lead.',
      interpretacion: 'Incumplimiento crítico en Rojo; requiere gestión inmediata.',
    },
    {
      semaforo: '🔵 OTRO DÍA',
      grupo: 'Fuera de Fecha Pactada',
      calificados: 'Existe llamada registrada al prospecto pero en una fecha distinta al día agendado de la cita.',
      nocalificados: 'Contacto realizado en un día posterior al límite asignado.',
      interpretacion: 'No coincide con el día de la cita agendada.',
    },
    {
      semaforo: '⚪ PENDIENTE',
      grupo: 'No Auditable Aún',
      calificados: 'Cita programada para una fecha futura (aún no vence el horario de llamada).',
      nocalificados: 'Lead con fecha futura programada.',
      interpretacion: 'No penaliza el % de cumplimiento hasta que venza su fecha/hora.',
    },
    {
      semaforo: '🟢 / 🟡 / 🔴 · Escala Ejecutivo',
      grupo: 'Desempeño Mensual',
      calificados: 'Verde: ≥ 70% A Tiempo  |  Amarillo: 40% - 69%  |  Rojo: < 40%.',
      nocalificados: 'Misma escala sobre leads auditables (Total - Pendientes).',
      interpretacion: 'Mide consistencia global de cada asesor en el período.',
    },
    {
      semaforo: '📋 REGLA · Canales y Teams',
      grupo: 'ProspektIA y Multicanal',
      calificados: `Si ProspektIA envía tipo de llamada null/vacío se asigna "Llamada Telefonica". Si es "Virtual" o "Teams" se aparta automáticamente en Reuniones Teams. Canales: PBX, Celular, WhatsApp y Teams (horario ${hIni}-${hFin} L-V).`,
      nocalificados: 'Cruza contra PBX (SV/GT), Celular, WhatsApp y Teams filtrados por el Catálogo oficial.',
      interpretacion: 'Garantiza cobertura multicanal sin perder reuniones virtuales ni registros sin tipo.',
    },
  ];

  const hojaCriterios: ExcelSheetConfig<any> = {
    name: 'Criterios y Tipificaciones',
    title: `Catálogo de Semáforo y Criterios de Auditoría — ${alcanceLabel}`,
    subtitle: `Parámetros activos: Anticipación -${tolAntes}m | Tolerancia +${tolDespues}m | Duración mín. ${durMin}s | Jornada ${hIni}-${hFin} L-V`,
    accentHex: '334155',
    columns: [
      { header: 'Semáforo / Regla', key: 'semaforo', width: 26, semantic: 'semaforo', align: 'center' },
      { header: 'Clasificación', key: 'grupo', width: 26 },
      { header: 'Criterio — Leads Calificados (Citas)', key: 'calificados', width: 48, wrapText: true },
      { header: 'Criterio — Leads No Calificados', key: 'nocalificados', width: 48, wrapText: true },
      { header: 'Acción / Interpretación', key: 'interpretacion', width: 42, wrapText: true },
    ],
    rows: filasCriterios,
  };

  return [hojaResumenEjecutivo, hojaDetalle, hojaCriterios, ...hojasExtra];
}
