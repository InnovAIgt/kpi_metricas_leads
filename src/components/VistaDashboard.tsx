import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Download,
  Globe2,
  Headphones,
  MessageSquare,
  Phone,
  PhoneCall,
  RefreshCw,
  Shield,
  Smartphone,
  Target,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Video,
  XCircle,
} from 'lucide-react';
import {
  Cita,
  CruceAuditoria,
  Llamada,
  ModoLeads,
  ParametrosAuditoria,
  VistaApp,
} from '../types';
import { PARAMETROS_DEFAULT } from '../data/mockData';
import { DateRangeFilter } from './DateRangeFilter';
import {
  formatLocalDate,
  getMesActualInfo,
  getRangoDefaultLeads,
} from '../utils/dateHelpers';
import {
  calcularMetricasPorVendedor,
  calcularResumenKPIs,
} from '../utils/matchingEngine';
import {
  exportarLibroExcel,
  formatearSubtituloExportacion,
} from '../utils/excelExport';
import {
  DashboardGraficas,
  DatoMensualDashboard,
} from './DashboardGraficas';

interface VistaDashboardProps {
  crucesTodos: CruceAuditoria[];
  citasActivas: Cita[];
  llamadas: Llamada[];
  catalogo: any[];
  parametros?: ParametrosAuditoria;
  modoLeads: ModoLeads;
  onNavegar: (vista: VistaApp) => void;
  onVerTranscripcion?: (llamada: any) => void;
  onSincronizar?: () => void;
  sincronizando?: boolean;
}

const ETIQUETA_ESTADO: Record<string, string> = {
  A_TIEMPO: 'A Tiempo',
  TARDE_LEVE: 'Tarde Leve',
  TARDE_GRAVE: 'Retraso Grave',
  LLAMO_OTRO_DIA: 'Llamó Otro Día',
  NO_LLAMO: 'No Llamó',
  PENDIENTE: 'Pendiente / Próxima',
  LLAMADA_CORTA: 'Llamada Corta / Buzón',
  ADELANTADA: 'Adelantada (>15m)',
  SIN_CITA: 'Sin Cita Previa',
};

function extraerFechaStr(cruce: CruceAuditoria): string {
  const raw =
    cruce.fecha_cita ||
    cruce.cita?.fecha_agendada ||
    cruce.cita?.fecha_hora_programada ||
    cruce.cita?.fecha_creado ||
    cruce.cita?.created_at ||
    '';
  const match = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function extraerFechaCitaStr(cita: Cita): string {
  const raw =
    cita.fecha_agendada ||
    cita.fecha_hora_programada ||
    cita.fecha_creado ||
    cita.created_at ||
    '';
  const match = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export const VistaDashboard: React.FC<VistaDashboardProps> = ({
  crucesTodos,
  citasActivas,
  llamadas,
  catalogo,
  parametros = PARAMETROS_DEFAULT,
  modoLeads,
  onNavegar,
  onVerTranscripcion,
  onSincronizar,
  sincronizando = false,
}) => {
  const esCalificado = modoLeads === 'calificados';
  const mesInfo = useMemo(() => getMesActualInfo(), []);

  const [fechaInicio, setFechaInicio] = useState<string>(
    () => getRangoDefaultLeads().inicio
  );
  const [fechaFin, setFechaFin] = useState<string>(
    () => getRangoDefaultLeads().fin
  );
  const [paisFiltro, setPaisFiltro] = useState<'TODOS' | 'SV' | 'GT'>('TODOS');
  const [exportando, setExportando] = useState(false);

  const tolAntes = parametros.tolerancia_anticipacion_minutos ?? 15;
  const tolDespues = parametros.tolerancia_retraso_a_tiempo_minutos ?? 15;
  const umbralGrave = parametros.umbral_retraso_grave_minutos ?? 30;

  // Filtrado por rango de fechas y país
  const crucesFiltrados = useMemo(() => {
    return crucesTodos.filter((c) => {
      if (paisFiltro !== 'TODOS') {
        const pais = (c.pais || c.cita?.pais || 'SV').toUpperCase();
        if (pais !== paisFiltro) return false;
      }
      if (fechaInicio || fechaFin) {
        const f = extraerFechaStr(c);
        if (!f) return false;
        if (fechaInicio && f < fechaInicio) return false;
        if (fechaFin && f > fechaFin) return false;
      }
      return true;
    });
  }, [crucesTodos, fechaInicio, fechaFin, paisFiltro]);

  const citasFiltradas = useMemo(() => {
    return citasActivas.filter((c) => {
      if (paisFiltro !== 'TODOS') {
        const pais = (c.pais || 'SV').toUpperCase();
        if (pais !== paisFiltro) return false;
      }
      if (fechaInicio || fechaFin) {
        const f = extraerFechaCitaStr(c);
        if (!f) return false;
        if (fechaInicio && f < fechaInicio) return false;
        if (fechaFin && f > fechaFin) return false;
      }
      return true;
    });
  }, [citasActivas, fechaInicio, fechaFin, paisFiltro]);

  const llamadasEnPeriodo = useMemo(() => {
    return llamadas.filter((ll) => {
      if (fechaInicio || fechaFin) {
        const match = String(ll.fecha_hora_inicio || '').match(
          /^(\d{4}-\d{2}-\d{2})/
        );
        const f = match ? match[1] : '';
        if (!f) return false;
        if (fechaInicio && f < fechaInicio) return false;
        if (fechaFin && f > fechaFin) return false;
      }
      return true;
    });
  }, [llamadas, fechaInicio, fechaFin]);

  const resumenKPIs = useMemo(
    () => calcularResumenKPIs(crucesFiltrados),
    [crucesFiltrados]
  );

  const rankingVendedores = useMemo(
    () => calcularMetricasPorVendedor(crucesFiltrados),
    [crucesFiltrados]
  );

  // Conteo por estado de cumplimiento
  const conteosEstado = useMemo(() => {
    const mapa = {
      A_TIEMPO: 0,
      TARDE_LEVE: 0,
      TARDE_GRAVE: 0,
      LLAMO_OTRO_DIA: 0,
      NO_LLAMO: 0,
      PENDIENTE: 0,
      LLAMADA_CORTA: 0,
      ADELANTADA: 0,
    };
    crucesFiltrados.forEach((c) => {
      if (c.estado_cumplimiento in mapa) {
        mapa[c.estado_cumplimiento as keyof typeof mapa]++;
      }
    });
    return mapa;
  }, [crucesFiltrados]);

  const totalAuditables = useMemo(() => {
    return Math.max(0, crucesFiltrados.length - conteosEstado.PENDIENTE);
  }, [crucesFiltrados.length, conteosEstado.PENDIENTE]);

  const brechasTotales =
    conteosEstado.NO_LLAMO +
    conteosEstado.TARDE_GRAVE +
    conteosEstado.LLAMO_OTRO_DIA;

  // Distribución por País (SV vs GT)
  const splitPais = useMemo(() => {
    let svTotal = 0;
    let svOk = 0;
    let svPend = 0;
    let gtTotal = 0;
    let gtOk = 0;
    let gtPend = 0;

    crucesFiltrados.forEach((c) => {
      const p = (c.pais || c.cita?.pais || 'SV').toUpperCase();
      if (p === 'GT') {
        gtTotal++;
        if (c.estado_cumplimiento === 'A_TIEMPO') gtOk++;
        if (c.estado_cumplimiento === 'PENDIENTE') gtPend++;
      } else {
        svTotal++;
        if (c.estado_cumplimiento === 'A_TIEMPO') svOk++;
        if (c.estado_cumplimiento === 'PENDIENTE') svPend++;
      }
    });

    const svAudit = Math.max(0, svTotal - svPend);
    const gtAudit = Math.max(0, gtTotal - gtPend);
    return {
      sv: {
        total: svTotal,
        ok: svOk,
        pct: svAudit > 0 ? Math.round((svOk / svAudit) * 100) : 0,
      },
      gt: {
        total: gtTotal,
        ok: gtOk,
        pct: gtAudit > 0 ? Math.round((gtOk / gtAudit) * 100) : 0,
      },
    };
  }, [crucesFiltrados]);

  // Actividad multicanal en el período
  const canalesPeriodo = useMemo(() => {
    const counts = { PBX: 0, Celular: 0, WhatsApp: 0, Teams: 0 };
    llamadasEnPeriodo.forEach((ll) => {
      const ch = ll.canal_tipo || ll.proveedor;
      if (ch === 'PBX') counts.PBX++;
      else if (ch === 'Celular') counts.Celular++;
      else if (ch === 'WhatsApp') counts.WhatsApp++;
      else if (ch === 'Teams') counts.Teams++;
    });
    return counts;
  }, [llamadasEnPeriodo]);

  // Analítica de SLA + Retroalimentación (para ambos modos) + Tipo de Reunión
  const analiticaEtapas = useMemo(() => {
    const n = citasFiltradas.length;
    const sla1 = citasFiltradas.filter((c) => c.kpi_sla_etapa_1).length;
    const sla2 = citasFiltradas.filter((c) => c.kpi_sla_etapa_2).length;
    const sla3 = citasFiltradas.filter((c) => c.kpi_sla_etapa_3).length;
    const ret1 = citasFiltradas.filter((c) => c.kpi_retroalimentacion_etapa_1).length;
    const ret2 = citasFiltradas.filter((c) => c.kpi_retroalimentacion_etapa_2).length;
    const ret3 = citasFiltradas.filter((c) => c.kpi_retroalimentacion_etapa_3).length;
    const ret4 = citasFiltradas.filter((c) => c.kpi_retroalimentacion_etapa_4).length;

    let telefonica = 0;
    let teams = 0;
    let presencial = 0;
    citasFiltradas.forEach((c) => {
      const t = String(c.tipo_reunion || '').toLowerCase();
      if (t.includes('teams') || t.includes('virtual')) teams++;
      else if (t.includes('presencial')) presencial++;
      else telefonica++;
    });

    const pct = (val: number) => (n > 0 ? Math.round((val / n) * 100) : 0);

    return {
      total: n,
      sla: [
        { label: 'SLA Etapa 1', done: sla1, pct: pct(sla1) },
        { label: 'SLA Etapa 2', done: sla2, pct: pct(sla2) },
        { label: 'SLA Etapa 3', done: sla3, pct: pct(sla3) },
      ],
      retro: [
        { label: 'Retro Etapa 1', done: ret1, pct: pct(ret1) },
        { label: 'Retro Etapa 2', done: ret2, pct: pct(ret2) },
        { label: 'Retro Etapa 3', done: ret3, pct: pct(ret3) },
        { label: 'Retro Etapa 4', done: ret4, pct: pct(ret4) },
      ],
      tiposReunion: { telefonica, teams, presencial },
    };
  }, [citasFiltradas]);

  // Analítica específica de No Calificados: Speed-to-Lead buckets
  const bucketsNoCalificados = useMemo(() => {
    let hasta15 = 0;
    let entre16y60 = 0;
    let mas60 = 0;
    let otroDia = 0;
    let sinLlamada = 0;

    crucesFiltrados.forEach((c) => {
      if (c.estado_cumplimiento === 'NO_LLAMO') {
        sinLlamada++;
      } else if (c.estado_cumplimiento === 'LLAMO_OTRO_DIA') {
        otroDia++;
      } else if (typeof c.desfase_minutos === 'number') {
        const abs = Math.abs(c.desfase_minutos);
        if (abs <= 15 || c.estado_cumplimiento === 'A_TIEMPO') {
          hasta15++;
        } else if (abs <= 60) {
          entre16y60++;
        } else {
          mas60++;
        }
      } else {
        sinLlamada++;
      }
    });

    const total = Math.max(1, crucesFiltrados.length);
    return [
      {
        label: 'Respuesta Inmediata (≤ 15 min / En Meta)',
        count: hasta15,
        pct: Math.round((hasta15 / total) * 100),
        color: 'bg-emerald-500',
        textColor: 'text-emerald-700 dark:text-emerald-400',
      },
      {
        label: 'Seguimiento Rápido (16 – 60 min)',
        count: entre16y60,
        pct: Math.round((entre16y60 / total) * 100),
        color: 'bg-cyan-500',
        textColor: 'text-cyan-700 dark:text-cyan-400',
      },
      {
        label: 'Respuesta Tardía (> 60 min)',
        count: mas60,
        pct: Math.round((mas60 / total) * 100),
        color: 'bg-amber-500',
        textColor: 'text-amber-700 dark:text-amber-400',
      },
      {
        label: 'Contactado Otro Día / Fuera Horario',
        count: otroDia,
        pct: Math.round((otroDia / total) * 100),
        color: 'bg-indigo-500',
        textColor: 'text-indigo-700 dark:text-indigo-400',
      },
      {
        label: 'Sin Llamada Registrada',
        count: sinLlamada,
        pct: Math.round((sinLlamada / total) * 100),
        color: 'bg-rose-500',
        textColor: 'text-rose-700 dark:text-rose-400',
      },
    ];
  }, [crucesFiltrados]);

  // Comparativa Mensual histórica (Mes actual vs meses anteriores, independiente del filtro de fechas actual)
  const comparativaMensual: DatoMensualDashboard[] = useMemo(() => {
    const MESES_CORTOS = [
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
    ];
    const MESES_LARGOS = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    const mesActualKey = `${mesInfo.anio}-${String(mesInfo.mes).padStart(2, '0')}`;
    const mapa = new Map<string, DatoMensualDashboard>();

    crucesTodos.forEach((c) => {
      if (paisFiltro !== 'TODOS') {
        const p = (c.pais || c.cita?.pais || 'SV').toUpperCase();
        if (p !== paisFiltro) return;
      }
      const f = extraerFechaStr(c);
      if (!f || f.length < 7) return;
      const mesKey = f.slice(0, 7);
      const [anioStr, mesStr] = mesKey.split('-');
      const anioNum = parseInt(anioStr, 10);
      const mesNum = parseInt(mesStr, 10);
      if (!anioNum || !mesNum || mesNum < 1 || mesNum > 12) return;

      if (!mapa.has(mesKey)) {
        mapa.set(mesKey, {
          mesKey,
          labelCorto: `${MESES_CORTOS[mesNum - 1]} ${String(anioNum).slice(-2)}`,
          labelLargo: `${MESES_LARGOS[mesNum - 1]} ${anioNum}`,
          esMesActual: mesKey === mesActualKey,
          total: 0,
          auditables: 0,
          aTiempo: 0,
          tarde: 0,
          noLlamo: 0,
          pendientes: 0,
          pctCumplimiento: 0,
        });
      }

      const item = mapa.get(mesKey)!;
      item.total++;
      if (c.estado_cumplimiento === 'PENDIENTE') {
        item.pendientes++;
      } else {
        item.auditables++;
      }

      if (
        c.estado_cumplimiento === 'A_TIEMPO' ||
        c.estado_cumplimiento === 'ADELANTADA'
      ) {
        item.aTiempo++;
      } else if (
        c.estado_cumplimiento === 'TARDE_LEVE' ||
        c.estado_cumplimiento === 'TARDE_GRAVE' ||
        c.estado_cumplimiento === 'LLAMO_OTRO_DIA'
      ) {
        item.tarde++;
      } else if (c.estado_cumplimiento === 'NO_LLAMO') {
        item.noLlamo++;
      }
    });

    const lista = Array.from(mapa.values())
      .map((item) => ({
        ...item,
        pctCumplimiento:
          item.auditables > 0
            ? Math.round((item.aTiempo / item.auditables) * 100)
            : item.total > 0
            ? 100
            : 0,
      }))
      .sort((a, b) => a.mesKey.localeCompare(b.mesKey));

    return lista.slice(-6);
  }, [crucesTodos, paisFiltro, mesInfo]);

  // Alertas prioritarias (últimas brechas más relevantes)
  const alertasPrioritarias = useMemo(() => {
    const prioridad: Record<string, number> = {
      NO_LLAMO: 1,
      TARDE_GRAVE: 2,
      LLAMO_OTRO_DIA: 3,
      LLAMADA_CORTA: 4,
      TARDE_LEVE: 5,
    };
    return crucesFiltrados
      .filter((c) => c.estado_cumplimiento in prioridad)
      .sort((a, b) => {
        const pa = prioridad[a.estado_cumplimiento] || 9;
        const pb = prioridad[b.estado_cumplimiento] || 9;
        if (pa !== pb) return pa - pb;
        return (extraerFechaStr(b) || '').localeCompare(extraerFechaStr(a) || '');
      })
      .slice(0, 8);
  }, [crucesFiltrados]);

  const handleExportarDashboard = async () => {
    setExportando(true);
    try {
      const modoLabel = esCalificado ? 'Leads Calificados' : 'Leads No Calificados';
      const subtitulo = formatearSubtituloExportacion({
        fechaInicio,
        fechaFin,
        totalFilas: crucesFiltrados.length,
        modo: `${modoLabel}${paisFiltro !== 'TODOS' ? ` · País: ${paisFiltro}` : ''}`,
      });

      const filasResumen = [
        { indicador: 'Modo de Auditoría', valor: modoLabel, detalle: `Tolerancia -${tolAntes} / +${tolDespues} min` },
        { indicador: 'Período Analizado', valor: `${fechaInicio || 'Inicio'} al ${fechaFin || 'Hoy'}`, detalle: paisFiltro === 'TODOS' ? 'SV + GT' : paisFiltro },
        { indicador: 'Total Leads en Período', valor: crucesFiltrados.length, detalle: `${totalAuditables} auditables · ${conteosEstado.PENDIENTE} pendientes` },
        { indicador: 'Cumplimiento A Tiempo', valor: `${resumenKPIs.tasa_cumplimiento_general}%`, detalle: `${resumenKPIs.citas_llamadas_a_tiempo} leads en verde` },
        { indicador: 'Tarde Leve / Adelantada', valor: conteosEstado.TARDE_LEVE + conteosEstado.ADELANTADA, detalle: `${conteosEstado.TARDE_LEVE} tarde leve · ${conteosEstado.ADELANTADA} adelantada` },
        { indicador: 'Retraso Grave / Otro Día', valor: conteosEstado.TARDE_GRAVE + conteosEstado.LLAMO_OTRO_DIA, detalle: `>${umbralGrave}m: ${conteosEstado.TARDE_GRAVE} · Otro día: ${conteosEstado.LLAMO_OTRO_DIA}` },
        { indicador: 'No Llamó (Sin Gestión)', valor: conteosEstado.NO_LLAMO, detalle: 'Requiere seguimiento inmediato' },
        { indicador: 'Desfase / Respuesta Promedio', valor: `${resumenKPIs.promedio_tiempo_respuesta_minutos} min`, detalle: 'Entre hora objetivo y llamada' },
        { indicador: 'Asesores Activos en Catálogo', valor: catalogo.length, detalle: `${rankingVendedores.length} con actividad en período` },
        { indicador: 'Llamadas en Período (PBX / Cel / WA / Teams)', valor: llamadasEnPeriodo.length, detalle: `PBX: ${canalesPeriodo.PBX} · Cel: ${canalesPeriodo.Celular} · WA: ${canalesPeriodo.WhatsApp} · Teams: ${canalesPeriodo.Teams}` },
        ...analiticaEtapas.sla.map((s) => ({
          indicador: `KPI 2 · ${s.label}`,
          valor: `${s.pct}%`,
          detalle: `${s.done} de ${analiticaEtapas.total} leads con Sí`,
        })),
        ...analiticaEtapas.retro.map((r) => ({
          indicador: `KPI 3 · ${r.label}`,
          valor: `${r.pct}%`,
          detalle: `${r.done} de ${analiticaEtapas.total} leads con Sí`,
        })),
      ];

      await exportarLibroExcel(
        `Dashboard_${esCalificado ? 'Calificados' : 'NoCalificados'}_${fechaInicio || 'inicio'}_${fechaFin || formatLocalDate()}`,
        [
          {
            name: 'Resumen Ejecutivo',
            title: `Dashboard Ejecutivo — ${modoLabel}`,
            subtitle: subtitulo,
            accentHex: esCalificado ? 'E11D48' : '0891B2',
            columns: [
              { header: 'Indicador Clave', key: 'indicador', width: 38 },
              { header: 'Valor', key: 'valor', width: 22, align: 'center' },
              { header: 'Detalle', key: 'detalle', width: 42 },
            ],
            rows: filasResumen,
          },
          {
            name: 'Ranking Asesores',
            title: `Ranking por Asesor — ${modoLabel}`,
            subtitle: subtitulo,
            accentHex: 'D97706',
            columns: [
              { header: 'Asesor / Ejecutivo', key: 'vendedor_nombre', width: 28 },
              { header: 'Total Leads', key: 'total_citas', align: 'right' },
              { header: 'A Tiempo', key: 'citas_a_tiempo', align: 'right' },
              { header: 'Tarde Leve', key: 'citas_tarde_leve', align: 'right' },
              { header: 'Retraso Grave', key: 'citas_tarde_grave', align: 'right' },
              { header: 'No Llamó', key: 'citas_no_llamo', align: 'right' },
              { header: '% Cumplimiento', key: 'tasa_cumplimiento_pct', value: (r) => r.tasa_cumplimiento_pct / 100, numFmt: '0%', align: 'right' },
              { header: 'Desfase Prom. (min)', key: 'promedio_desfase_minutos', align: 'right' },
              { header: 'Score', key: 'score_rendimiento', semantic: 'status', align: 'center' },
            ],
            rows: rankingVendedores,
          },
          {
            name: 'Comparativa Mensual',
            title: `Comparativa Mensual — ${modoLabel}`,
            subtitle: `Histórico mensual (${paisFiltro === 'TODOS' ? 'SV + GT' : paisFiltro})`,
            accentHex: '059669',
            columns: [
              { header: 'Mes', key: 'labelLargo', width: 22 },
              { header: 'Total Leads', key: 'total', align: 'right' },
              { header: 'Auditables', key: 'auditables', align: 'right' },
              { header: 'A Tiempo', key: 'aTiempo', align: 'right' },
              { header: 'Con Retraso / Otro Día', key: 'tarde', align: 'right' },
              { header: 'No Llamó', key: 'noLlamo', align: 'right' },
              { header: '% Cumplimiento', key: 'pctCumplimiento', value: (r) => r.pctCumplimiento / 100, numFmt: '0%', align: 'right' },
            ],
            rows: comparativaMensual,
          },
          {
            name: 'Detalle Leads Período',
            title: `Detalle de Auditoría — ${modoLabel}`,
            subtitle: subtitulo,
            accentHex: '1E293B',
            columns: [
              { header: 'Código', key: 'codigo', value: (r) => r.cita?.codigo_prospecto || r.id, width: 16 },
              { header: 'País', key: 'pais', value: (r) => r.pais || r.cita?.pais || 'SV', width: 10, align: 'center' },
              { header: 'Prospecto', key: 'prospecto_nombre', width: 26 },
              { header: 'Teléfono', key: 'telefono', width: 16 },
              { header: 'Asesor Asignado', key: 'vendedor_nombre', width: 26 },
              { header: esCalificado ? 'Fecha/Hora Cita' : 'Fecha/Hora Ingreso', key: 'fecha_cita', value: (r) => r.fecha_cita || r.cita?.fecha_hora_programada || '-', width: 20 },
              { header: 'Fecha/Hora Llamada', key: 'fecha_llamada', value: (r) => r.fecha_llamada || '-', width: 20 },
              { header: 'Canal', key: 'canal_utilizado', value: (r) => r.canal_utilizado || 'Sin llamada', width: 14 },
              { header: 'Desfase (min)', key: 'desfase_minutos', value: (r) => r.desfase_minutos ?? '', align: 'right' },
              { header: 'Duración (s)', key: 'duracion_llamada_segundos', value: (r) => r.duracion_llamada_segundos ?? 0, align: 'right' },
              { header: 'Estado Cumplimiento', key: 'estado_label', value: (r) => ETIQUETA_ESTADO[r.estado_cumplimiento] || r.estado_cumplimiento, semantic: 'status', align: 'center' },
              { header: 'Explicación', key: 'explicacion', width: 44 },
            ],
            rows: crucesFiltrados,
          },
        ]
      );
    } finally {
      setExportando(false);
    }
  };

  // Segmentos de barra apilada
  const segmentosBarra = [
    { key: 'A_TIEMPO', label: 'A Tiempo', count: conteosEstado.A_TIEMPO, bar: 'bg-emerald-500', pill: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50' },
    { key: 'TARDE_LEVE', label: 'Tarde Leve', count: conteosEstado.TARDE_LEVE, bar: 'bg-amber-400', pill: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/50' },
    { key: 'ADELANTADA', label: 'Adelantada', count: conteosEstado.ADELANTADA, bar: 'bg-sky-500', pill: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/50' },
    { key: 'TARDE_GRAVE', label: 'Retraso Grave', count: conteosEstado.TARDE_GRAVE, bar: 'bg-orange-500', pill: 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/50' },
    { key: 'LLAMO_OTRO_DIA', label: 'Otro Día', count: conteosEstado.LLAMO_OTRO_DIA, bar: 'bg-indigo-500', pill: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/50' },
    { key: 'NO_LLAMO', label: 'No Llamó', count: conteosEstado.NO_LLAMO, bar: 'bg-rose-500', pill: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/50' },
    { key: 'PENDIENTE', label: 'Pendiente', count: conteosEstado.PENDIENTE, bar: 'bg-slate-400 dark:bg-slate-600', pill: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
  ];

  const totalBarra = Math.max(1, crucesFiltrados.length);

  return (
    <div className="space-y-6 tabular-nums">
      {/* Encabezado Ejecutivo */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${
                esCalificado
                  ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-500/40'
                  : 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/80 dark:text-cyan-300 dark:border-cyan-500/40'
              }`}
            >
              {esCalificado ? 'Leads Calificados (Citas)' : 'Leads No Calificados (Directos)'}
            </span>
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {mesInfo.nombreMes} {mesInfo.anio} · Al {mesInfo.hoy}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {esCalificado
              ? 'Dashboard Ejecutivo · Citas Agendadas'
              : 'Dashboard Ejecutivo · Speed-to-Lead'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {esCalificado
              ? `Visión consolidada en vivo de cumplimiento (-${tolAntes} / +${tolDespues} min), SLA y retroalimentación de etapas.`
              : 'Visión consolidada en vivo de respuesta rápida (meta 1 hora hábil o 9:00 a.m.), SLA y retroalimentación de etapas.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Selector rápido de País */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
            {(['TODOS', 'SV', 'GT'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPaisFiltro(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  paisFiltro === p
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p === 'TODOS' ? 'Todos Países' : p === 'SV' ? '🇸🇻 SV' : '🇬🇹 GT'}
              </button>
            ))}
          </div>

          {onSincronizar && (
            <button
              type="button"
              onClick={onSincronizar}
              disabled={sincronizando}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${sincronizando ? 'animate-spin text-indigo-500' : ''}`}
              />
              <span>{sincronizando ? 'Actualizando...' : 'Actualizar'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportarDashboard}
            disabled={exportando}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{exportando ? 'Generando...' : 'Descargar Excel'}</span>
          </button>
        </div>
      </div>

      {/* Filtro de Fechas (por defecto del 1 del mes actual a hoy) */}
      <DateRangeFilter
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
        onChangeInicio={setFechaInicio}
        onChangeFin={setFechaFin}
        onLimpiar={() => {
          const def = getRangoDefaultLeads();
          setFechaInicio(def.inicio);
          setFechaFin(def.fin);
        }}
        label={`Filtrar Período (${crucesFiltrados.length} de ${crucesTodos.length} registros)`}
      />

      {/* 4 Tarjetas KPI Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {esCalificado ? 'Citas del Período' : 'Leads Ingresados'}
            </span>
            <div
              className={`p-2 rounded-xl ${
                esCalificado
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  : 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400'
              }`}
            >
              {esCalificado ? (
                <CalendarCheck className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {crucesFiltrados.length}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {totalAuditables} auditables · {conteosEstado.PENDIENTE} próximas/pendientes
            </p>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Cumplimiento a Tiempo
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {resumenKPIs.tasa_cumplimiento_general}%
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                ({resumenKPIs.citas_llamadas_a_tiempo}/{totalAuditables})
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {esCalificado
                ? `Criterio verde: -${tolAntes} / +${tolDespues} min`
                : 'Meta verde: ≤1h hábil o 9:00 a.m.'}
            </p>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {esCalificado ? 'Desfase Promedio' : 'Respuesta Promedio'}
            </span>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {resumenKPIs.promedio_tiempo_respuesta_minutos}{' '}
              <span className="text-base font-semibold text-slate-400">min</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {llamadasEnPeriodo.length} llamadas registradas ·{' '}
              {resumenKPIs.duracion_total_llamadas_horas}h totales
            </p>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              Brechas / Sin Llamada
            </span>
            <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-rose-600 dark:text-rose-400">
              {brechasTotales}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {conteosEstado.NO_LLAMO} sin llamada · {conteosEstado.TARDE_GRAVE} retraso grave · {conteosEstado.LLAMO_OTRO_DIA} otro día
            </p>
          </div>
        </div>
      </div>

      {/* Distribución de Cumplimiento + País + Canales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Barra Apilada de Estados */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="h-4 w-4 text-rose-500" />
                Distribución de Auditoría en el Período
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Proporción exacta sobre los {crucesFiltrados.length} leads filtrados
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavegar('kpi_cumplimiento')}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              Ver Auditoría Completa <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Stacked bar */}
          <div className="h-4 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex">
            {segmentosBarra.map((seg) => {
              if (seg.count === 0) return null;
              const widthPct = (seg.count / totalBarra) * 100;
              return (
                <div
                  key={seg.key}
                  style={{ width: `${widthPct}%` }}
                  className={`${seg.bar} h-full transition-all`}
                  title={`${seg.label}: ${seg.count} (${Math.round(widthPct)}%)`}
                />
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            {segmentosBarra.map((seg) => (
              <div
                key={seg.key}
                className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between ${seg.pill}`}
              >
                <span className="font-semibold truncate pr-2">{seg.label}</span>
                <span className="font-extrabold">{seg.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Split País & Actividad por Canal */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-indigo-500" />
            Desempeño por País y Canal
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/40">
              <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                🇸🇻 El Salvador
              </div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                {splitPais.sv.pct}%
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {splitPais.sv.ok} OK de {splitPais.sv.total} leads
              </div>
            </div>

            <div className="p-3 rounded-xl bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200/80 dark:border-cyan-800/40">
              <div className="text-xs font-bold text-cyan-700 dark:text-cyan-300">
                🇬🇹 Guatemala
              </div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                {splitPais.gt.pct}%
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {splitPais.gt.ok} OK de {splitPais.gt.total} leads
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Llamadas Detectadas en el Período
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => onNavegar('reg_pbx')}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <PhoneCall className="h-3.5 w-3.5 text-rose-500" /> PBX
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {canalesPeriodo.PBX}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNavegar('reg_celular')}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <Smartphone className="h-3.5 w-3.5 text-blue-500" /> Celular
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {canalesPeriodo.Celular}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNavegar('reg_whatsapp')}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-500" /> WhatsApp
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {canalesPeriodo.WhatsApp}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNavegar('reg_teams')}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <Video className="h-3.5 w-3.5 text-purple-500" /> Teams
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {canalesPeriodo.Teams}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Gráficas Interactivas: Pastel, Comparativa Ejecutivos y Comparativa Mensual */}
      <DashboardGraficas
        rankingVendedores={rankingVendedores}
        conteosEstado={conteosEstado}
        canalesPeriodo={canalesPeriodo}
        comparativaMensual={comparativaMensual}
        esCalificado={esCalificado}
        onIrAKpi1={() => onNavegar('kpi_cumplimiento')}
      />

      {/* Analítica Específica del Modo (Calificados vs No Calificados) */}
      {esCalificado ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* KPI 2: SLA de Etapas */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-500" />
                KPI 2: SLA de Etapas
              </h3>
              <button
                type="button"
                onClick={() => onNavegar('kpi_sla')}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
              >
                Abrir KPI 2
              </button>
            </div>
            <div className="space-y-2.5">
              {analiticaEtapas.sla.map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {item.label}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {item.done}/{analiticaEtapas.total} ({item.pct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* KPI 3: Retroalimentación */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                KPI 3: Retroalimentación
              </h3>
              <button
                type="button"
                onClick={() => onNavegar('kpi_retroalimentacion')}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Abrir KPI 3
              </button>
            </div>
            <div className="space-y-2">
              {analiticaEtapas.retro.map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {item.label}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {item.done}/{analiticaEtapas.total} ({item.pct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Modalidad de Reuniones */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              Modalidad de Reuniones Agendadas
            </h3>
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/40">
                <div className="flex items-center gap-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <Phone className="h-4 w-4" /> Llamada Telefónica
                </div>
                <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {analiticaEtapas.tiposReunion.telefonica}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/40">
                <div className="flex items-center gap-2.5 text-xs font-semibold text-blue-800 dark:text-blue-300">
                  <Video className="h-4 w-4" /> Teams / Virtual
                </div>
                <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {analiticaEtapas.tiposReunion.teams}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/70 dark:border-purple-800/40">
                <div className="flex items-center gap-2.5 text-xs font-semibold text-purple-800 dark:text-purple-300">
                  <Building2 className="h-4 w-4" /> Presencial
                </div>
                <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {analiticaEtapas.tiposReunion.presencial}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Speed-to-Lead Buckets + KPI 2 SLA + KPI 3 Retroalimentación para No Calificados */
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-cyan-500" />
                  Velocidad de Primer Contacto (Speed-to-Lead)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tiempo transcurrido desde el ingreso del lead directo hasta la primera llamada efectiva
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {bucketsNoCalificados.map((b) => (
                <div
                  key={b.label}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-snug min-h-[2rem]">
                    {b.label}
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className={`text-2xl font-extrabold ${b.textColor}`}>
                      {b.count}
                    </span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {b.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${b.color}`}
                      style={{ width: `${b.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* KPI 2: SLA de Etapas (No Calificados) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-500" />
                  KPI 2: SLA de Etapas (No Calificados)
                </h3>
                <button
                  type="button"
                  onClick={() => onNavegar('kpi_sla')}
                  className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  Abrir KPI 2
                </button>
              </div>
              <div className="space-y-2.5">
                {analiticaEtapas.sla.map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {item.label}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {item.done}/{analiticaEtapas.total} ({item.pct}%)
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* KPI 3: Retroalimentación (No Calificados) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  KPI 3: Retroalimentación (No Calificados)
                </h3>
                <button
                  type="button"
                  onClick={() => onNavegar('kpi_retroalimentacion')}
                  className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Abrir KPI 3
                </button>
              </div>
              <div className="space-y-2">
                {analiticaEtapas.retro.map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {item.label}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {item.done}/{analiticaEtapas.total} ({item.pct}%)
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ranking por Asesor + Alertas Prioritarias */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Ranking */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-500" />
                Ranking en Vivo por Asesor
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {rankingVendedores.length} ejecutivos con registros en el período seleccionado
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavegar('catalogo_crud')}
              className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
            >
              Catálogo ({catalogo.length}) →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/70 text-[11px] uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-bold">Asesor</th>
                  <th className="py-3 px-3 font-bold text-right">Leads</th>
                  <th className="py-3 px-3 font-bold text-right">A Tiempo</th>
                  <th className="py-3 px-3 font-bold text-right">Tarde</th>
                  <th className="py-3 px-3 font-bold text-right">No Llamó</th>
                  <th className="py-3 px-4 font-bold text-right">% Meta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {rankingVendedores.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      No hay registros de asesores para el rango de fechas seleccionado.
                    </td>
                  </tr>
                ) : (
                  rankingVendedores.map((v) => (
                    <tr
                      key={v.vendedor_id}
                      onClick={() => onNavegar('kpi_cumplimiento')}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[180px]">
                            {v.vendedor_nombre}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                        {v.total_citas}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {v.citas_a_tiempo}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-amber-600 dark:text-amber-400">
                        {v.citas_tarde_leve + v.citas_tarde_grave}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-rose-600 dark:text-rose-400">
                        {v.citas_no_llamo}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            v.tasa_cumplimiento_pct >= 80
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                              : v.tasa_cumplimiento_pct >= 50
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                          }`}
                        >
                          {v.tasa_cumplimiento_pct}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alertas Prioritarias */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <XCircle className="h-4 w-4 text-rose-500" />
                Alertas Prioritarias ({alertasPrioritarias.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Leads sin llamada o fuera de tolerancia en el período
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavegar('kpi_cumplimiento')}
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              Auditar →
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70 flex-1 overflow-y-auto max-h-[380px]">
            {alertasPrioritarias.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                Sin alertas críticas en este rango de fechas.
              </div>
            ) : (
              alertasPrioritarias.map((a) => (
                <div
                  key={a.id}
                  className="px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          a.estado_cumplimiento === 'NO_LLAMO'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                        }`}
                      >
                        {ETIQUETA_ESTADO[a.estado_cumplimiento] || a.estado_cumplimiento}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {a.pais || a.cita?.pais || 'SV'}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate mt-1">
                      {a.prospecto_nombre}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {a.vendedor_nombre} · {a.telefono || 'Sin tel'} · {extraerFechaStr(a)}
                    </div>
                  </div>
                  {a.llamada && onVerTranscripcion ? (
                    <button
                      type="button"
                      onClick={() => onVerTranscripcion(a)}
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer"
                    >
                      <Headphones className="h-3 w-3" /> Consultar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavegar('kpi_cumplimiento')}
                      className="shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-semibold cursor-pointer"
                    >
                      Detalle
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Accesos Rápidos del Modo */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Accesos Directos ({esCalificado ? 'Calificados' : 'No Calificados'}):
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onNavegar(esCalificado ? 'reg_leads' : 'reg_leads_no_calificados')
            }
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            {esCalificado ? 'Tabla Leads Calificados' : 'Tabla Leads No Calificados'}
          </button>
          <button
            type="button"
            onClick={() => onNavegar('kpi_cumplimiento')}
            className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-semibold text-rose-700 dark:text-rose-300 cursor-pointer"
          >
            KPI 1: Cumplimiento
          </button>
          <button
            type="button"
            onClick={() => onNavegar('kpi_sla')}
            className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-xs font-semibold text-amber-700 dark:text-amber-300 cursor-pointer"
          >
            KPI 2: SLA de Etapas
          </button>
          <button
            type="button"
            onClick={() => onNavegar('kpi_retroalimentacion')}
            className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-xs font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer"
          >
            KPI 3: Retroalimentación
          </button>
          <button
            type="button"
            onClick={() => onNavegar('resumen_kpis')}
            className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-xs font-semibold text-indigo-700 dark:text-indigo-300 cursor-pointer"
          >
            Resumen KPIs
          </button>
          <button
            type="button"
            onClick={() => onNavegar('catalogo_crud')}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            Gestionar Ejecutivos
          </button>
        </div>
      </div>
    </div>
  );
};
