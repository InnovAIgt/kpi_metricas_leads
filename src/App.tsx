/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Cita,
  Llamada,
  ParametrosAuditoria,
  VistaApp,
  ModoLeads,
} from './types';
import { PARAMETROS_DEFAULT } from './data/mockData';
import {
  ejecutarCruceAuditoria,
  calcularResumenKPIs,
  calcularMetricasPorVendedor,
} from './utils/matchingEngine';
import {
  esDelMesActual,
  formatLocalDate,
  getMesActualInfo,
  getRangoDefaultLeads,
} from './utils/dateHelpers';
import { esLeadCalificadoValido } from './utils/leadValidation';
import {
  sincronizarDatosDesdeBackend,
  actualizarLeadKpiBackend,
  guardarCatalogoItemBackend,
  eliminarCatalogoItemBackend,
  guardarReunionTeamsBackend,
  guardarLlamadaManualBackend,
  triggerEdgeFunction,
} from './services/apiService';
import { exportarLibroExcel, formatearSubtituloExportacion } from './utils/excelExport';
import { Sidebar } from './components/Sidebar';
import { VistaDashboard } from './components/VistaDashboard';
import { VistaCriterios } from './components/VistaCriterios';
import { VistaKpiCumplimiento } from './components/VistaKpiCumplimiento';
import { VistaKpiSla } from './components/VistaKpiSla';
import { VistaKpiRetroalimentacion } from './components/VistaKpiRetroalimentacion';
import { VistaTablaRegistros } from './components/VistaTablaRegistros';
import { VistaCatalogoCrud } from './components/VistaCatalogoCrud';
import { DateRangeFilter } from './components/DateRangeFilter';
import { MetricsOverview } from './components/MetricsOverview';
import { VendorScorecard } from './components/VendorScorecard';
import { LoginScreen } from './components/LoginScreen';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { ReproductorAudioFlotante } from './components/ReproductorAudioFlotante';
import { ModalTranscripcionLlamada } from './components/ModalTranscripcionLlamada';
import {
  CheckCircle2,
  AlertCircle,
  Info,
  ExternalLink,
  Phone,
  Video,
  Building2,
  Headphones,
  Download,
} from 'lucide-react';

export default function App() {
  // Autenticación de usuario (por defecto activo para mostrar los datos de inmediato)
  const [usuarioAutenticado, setUsuarioAutenticado] = useState<{
    nombre: string;
    rol: string;
  } | null>(() => {
    const saved = localStorage.getItem('kpi_auth_user');
    return saved ? JSON.parse(saved) : { nombre: 'Gabi', rol: 'Super Administrador / Auditor' };
  });

  // Modo de leads: 'calificados' (public.leads) o 'no_calificados' (public.leads_no_calificados)
  const [modoLeads, setModoLeads] = useState<ModoLeads>(() => {
    const saved = localStorage.getItem('kpi_modo_leads') as ModoLeads;
    return saved === 'no_calificados' ? 'no_calificados' : 'calificados';
  });

  // Vista activa del menú (arranca en el Dashboard ejecutivo del modo actual)
  const [vistaActiva, setVistaActiva] = useState<VistaApp>('dashboard');

  // Datos separados por categoría
  const [citasCalificadas, setCitasCalificadas] = useState<Cita[]>(() => {
    const saved = localStorage.getItem('kpi_citas_calificadas');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter((c) => esLeadCalificadoValido(c));
      } catch (_) {}
    }
    return [];
  });

  const [citasNoCalificadas, setCitasNoCalificadas] = useState<Cita[]>(() => {
    const saved = localStorage.getItem('kpi_citas_no_calificadas');
    return saved ? JSON.parse(saved) : [];
  });

  const [llamadas, setLlamadas] = useState<Llamada[]>(() => {
    const saved = localStorage.getItem('kpi_llamadas_data');
    return saved ? JSON.parse(saved) : [];
  });

  // Tablas crudas de Supabase con persistencia local
  const [catalogo, setCatalogo] = useState<any[]>(() => {
    const saved = localStorage.getItem('kpi_catalogo_cache');
    return saved ? JSON.parse(saved) : [];
  });
  const [rawPbx, setRawPbx] = useState<any[]>(() => {
    const saved = localStorage.getItem('kpi_raw_pbx_cache');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const maxFecha = parsed[0]?.fecha_hora || parsed[0]?.fecha || '';
          // Si el cache local está atascado en el 22 de octubre o antes, ignorarlo para no mostrar datos obsoletos
          if (maxFecha && maxFecha <= '2026-10-23') {
            return [];
          }
          return parsed;
        }
      } catch (_) {}
    }
    return [];
  });
  const [rawCelular, setRawCelular] = useState<any[]>(() => {
    const saved = localStorage.getItem('kpi_raw_cel_cache');
    return saved ? JSON.parse(saved) : [];
  });
  const [rawWhatsapp, setRawWhatsapp] = useState<any[]>(() => {
    const saved = localStorage.getItem('kpi_raw_wa_cache');
    return saved ? JSON.parse(saved) : [];
  });
  const [rawLeads, setRawLeads] = useState<any[]>(() => {
    const saved = localStorage.getItem('kpi_raw_leads_cache');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((l) => esLeadCalificadoValido(l));
        }
      } catch (_) {}
    }
    return [];
  });
  const [rawLeadsNoCalificados, setRawLeadsNoCalificados] = useState<any[]>(() => {
    const saved = localStorage.getItem('kpi_raw_nc_cache');
    return saved ? JSON.parse(saved) : [];
  });
  const [rawTeams, setRawTeams] = useState<any[]>(() => {
    const saved = localStorage.getItem('kpi_raw_teams_cache');
    return saved ? JSON.parse(saved) : [];
  });

  // Parámetros de auditoría (±15 min antes/después, >30 min retraso grave, 8am-6pm lun-vie)
  const [parametros, setParametros] = useState<ParametrosAuditoria>(() => {
    const savedV2 = localStorage.getItem('kpi_parametros_auditoria_v2');
    if (savedV2) {
      try {
        return { ...PARAMETROS_DEFAULT, ...JSON.parse(savedV2) };
      } catch (_) {}
    }
    const savedLegacy = localStorage.getItem('kpi_parametros_auditoria');
    if (savedLegacy) {
      try {
        const legacy = JSON.parse(savedLegacy);
        // Migrar automáticamente el antiguo preset 5/5/15 al nuevo estándar 15/15/30
        if (
          legacy.tolerancia_anticipacion_minutos === 5 &&
          legacy.tolerancia_retraso_a_tiempo_minutos === 5 &&
          legacy.umbral_retraso_grave_minutos === 15
        ) {
          return PARAMETROS_DEFAULT;
        }
        return { ...PARAMETROS_DEFAULT, ...legacy };
      } catch (_) {}
    }
    return PARAMETROS_DEFAULT;
  });

  // Rango dinámico para Resumen KPIs (del 1 del mes actual a hoy)
  const [fechaInicioResumen, setFechaInicioResumen] = useState<string>(
    () => getRangoDefaultLeads().inicio
  );
  const [fechaFinResumen, setFechaFinResumen] = useState<string>(
    () => getRangoDefaultLeads().fin
  );
  const [exportandoResumen, setExportandoResumen] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [modalSupabaseAbierto, setModalSupabaseAbierto] = useState(false);
  const [llamadaReproduciendo, setLlamadaReproduciendo] = useState<any | null>(null);
  const [llamadaParaTranscripcion, setLlamadaParaTranscripcion] = useState<any | null>(null);
  const [toast, setToast] = useState<{
    tipo: 'exito' | 'error' | 'info';
    mensaje: string;
  } | null>(null);

  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'exito') => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 4500);
  };

  // Alternar entre Leads Calificados y No Calificados al hacer clic en el logo
  const handleAlternarModoLeads = () => {
    const nuevoModo: ModoLeads = modoLeads === 'calificados' ? 'no_calificados' : 'calificados';
    setModoLeads(nuevoModo);
    localStorage.setItem('kpi_modo_leads', nuevoModo);
    if (vistaActiva === 'reg_leads' && nuevoModo === 'no_calificados') {
      setVistaActiva('reg_leads_no_calificados');
    } else if (vistaActiva === 'reg_leads_no_calificados' && nuevoModo === 'calificados') {
      setVistaActiva('reg_leads');
    }
    mostrarToast(
      nuevoModo === 'calificados'
        ? 'Mostrando Leads Calificados (public.leads)'
        : 'Mostrando Leads No Calificados (public.leads_no_calificados)',
      'info'
    );
  };

  // Helper para almacenamiento seguro en localStorage (no bloquea si supera 5MB de cuota del navegador)
  const safeSetLocalStorage = (key: string, value: any) => {
    try {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (_) {
      // Si la cuota de 5MB del navegador se supera, continuar sin interrumpir React
    }
  };

  // Carga automática inicial de datos reales desde el backend
  useEffect(() => {
    cargarDatosDesdeBackend();
  }, []);

  const cargarDatosDesdeBackend = async (forzar = false) => {
    setSincronizando(true);
    try {
      const data = await sincronizarDatosDesdeBackend(forzar);

      // 1. ACTUALIZAR DE INMEDIATO EL ESTADO EN MEMORIA DE REACT (PRIORITARIO)
      if (Array.isArray(data.catalogo)) setCatalogo(data.catalogo);
      if (Array.isArray(data.rawPbx) && data.rawPbx.length > 0) setRawPbx(data.rawPbx);
      if (Array.isArray(data.rawCelular) && data.rawCelular.length > 0) setRawCelular(data.rawCelular);
      if (Array.isArray(data.rawWhatsapp) && data.rawWhatsapp.length > 0) setRawWhatsapp(data.rawWhatsapp);
      if (Array.isArray(data.rawLeads) && data.rawLeads.length > 0) setRawLeads(data.rawLeads);
      if (Array.isArray(data.rawLeadsNoCalificados) && data.rawLeadsNoCalificados.length > 0) {
        setRawLeadsNoCalificados(data.rawLeadsNoCalificados);
      }
      if (Array.isArray(data.rawTeams)) setRawTeams(data.rawTeams);
      if (Array.isArray(data.citasCalificadas) && data.citasCalificadas.length > 0) {
        setCitasCalificadas(data.citasCalificadas);
      }
      if (Array.isArray(data.citasNoCalificadas)) setCitasNoCalificadas(data.citasNoCalificadas);
      if (Array.isArray(data.llamadas) && data.llamadas.length > 0) setLlamadas(data.llamadas);

      // 2. Persistir en localStorage de forma segura sin romper la app
      safeSetLocalStorage('kpi_catalogo_cache', data.catalogo || []);
      safeSetLocalStorage('kpi_citas_calificadas', data.citasCalificadas || []);
      safeSetLocalStorage('kpi_citas_no_calificadas', data.citasNoCalificadas || []);
      safeSetLocalStorage('kpi_raw_leads_cache', data.rawLeads || []);
      safeSetLocalStorage('kpi_raw_nc_cache', data.rawLeadsNoCalificados || []);
      safeSetLocalStorage('kpi_raw_teams_cache', data.rawTeams || []);
      if (data.rawPbx && data.rawPbx.length > 0) {
        safeSetLocalStorage('kpi_raw_pbx_cache', data.rawPbx.slice(0, 1000));
      }
      if (data.rawCelular && data.rawCelular.length > 0) {
        safeSetLocalStorage('kpi_raw_cel_cache', data.rawCelular.slice(0, 1000));
      }
      if (data.rawWhatsapp && data.rawWhatsapp.length > 0) {
        safeSetLocalStorage('kpi_raw_wa_cache', data.rawWhatsapp.slice(0, 1000));
      }
    } catch (err: any) {
      console.warn('Error al sincronizar datos:', err);
    } finally {
      setSincronizando(false);
    }
  };

  const handleSincronizarManual = async () => {
    mostrarToast('Sincronizando con PBX en vivo y Supabase...', 'info');
    const mesActual = getMesActualInfo();
    try {
      await triggerEdgeFunction({
        pbx_desde: mesActual.inicioMes,
        pbx_hasta: mesActual.hoy,
        pbx_pais: 'AMBOS',
      });
    } catch (_) {}
    await cargarDatosDesdeBackend(true);
    mostrarToast('Datos sincronizados en vivo correctamente.', 'exito');
  };

  // Citas activas según el modo seleccionado (¡NO SE MEZCLAN!)
  const citasActivas = useMemo(() => {
    return modoLeads === 'calificados'
      ? citasCalificadas.filter((c) => esLeadCalificadoValido(c))
      : citasNoCalificadas;
  }, [modoLeads, citasCalificadas, citasNoCalificadas]);

  // Guardar cambios de KPIs en lead (SLA / Retroalimentación) para Calificados y No Calificados
  const handleActualizarLeadKpi = async (
    leadId: string,
    cambios: Partial<Cita>,
    codigoAlt?: string
  ): Promise<boolean> => {
    const tabla = modoLeads === 'calificados' ? 'leads' : 'leads_no_calificados';
    const coincideLead = (item: any) =>
      String(item?.id || '') === leadId ||
      String(item?.codigo_prospecto || '') === leadId ||
      String(item?.client_id || '') === leadId ||
      (Boolean(codigoAlt) &&
        (String(item?.codigo_prospecto || '') === codigoAlt ||
          String(item?.client_id || '') === codigoAlt));

    if (modoLeads === 'calificados') {
      setCitasCalificadas((prev) => {
        const next = prev.map((c) => (coincideLead(c) ? { ...c, ...cambios } : c));
        safeSetLocalStorage('kpi_citas_calificadas', next);
        return next;
      });
      setRawLeads((prev) => {
        const next = prev.map((r) => (coincideLead(r) ? { ...r, ...cambios } : r));
        safeSetLocalStorage('kpi_raw_leads_cache', next);
        return next;
      });
    } else {
      setCitasNoCalificadas((prev) => {
        const next = prev.map((c) => (coincideLead(c) ? { ...c, ...cambios } : c));
        safeSetLocalStorage('kpi_citas_no_calificadas', next);
        return next;
      });
      setRawLeadsNoCalificados((prev) => {
        const next = prev.map((r) => (coincideLead(r) ? { ...r, ...cambios } : r));
        safeSetLocalStorage('kpi_raw_nc_cache', next);
        return next;
      });
    }

    const ok = await actualizarLeadKpiBackend(leadId, cambios, tabla, codigoAlt);
    if (ok) {
      mostrarToast(`Registro actualizado en ${tabla} exitosamente`, 'exito');
      return true;
    } else {
      mostrarToast('Error al persistir cambios', 'error');
      return false;
    }
  };

  // Catálogo CRUD handlers
  const handleGuardarCatalogo = async (item: any) => {
    const ok = await guardarCatalogoItemBackend(item);
    if (ok) {
      mostrarToast('Catálogo actualizado en Supabase', 'exito');
      await cargarDatosDesdeBackend(true);
      return true;
    }
    mostrarToast('Error al guardar en catálogo', 'error');
    return false;
  };

  const handleEliminarCatalogo = async (id: string) => {
    const ok = await eliminarCatalogoItemBackend(id);
    if (ok) {
      mostrarToast('Asesor eliminado del catálogo', 'exito');
      await cargarDatosDesdeBackend(true);
      return true;
    }
    mostrarToast('Error al eliminar asesor', 'error');
    return false;
  };

  // Handler para registrar y actualizar llamadas virtuales de Teams
  const handleGuardarTeams = async (reunion: any) => {
    const ok = await guardarReunionTeamsBackend(reunion);
    if (ok) {
      mostrarToast('Reunión Teams guardada exitosamente en Supabase', 'exito');
      setRawTeams((prev) => {
        const existeIdx = prev.findIndex(
          (t) =>
            (t.id && reunion.id && String(t.id) === String(reunion.id)) ||
            (t.codigo_prospecto &&
              reunion.codigo_prospecto &&
              String(t.codigo_prospecto).trim().toLowerCase() === String(reunion.codigo_prospecto).trim().toLowerCase())
        );
        if (existeIdx >= 0) {
          const copia = [...prev];
          copia[existeIdx] = { ...copia[existeIdx], ...reunion };
          localStorage.setItem('kpi_raw_teams_cache', JSON.stringify(copia));
          return copia;
        } else {
          const nuevaLista = [reunion, ...prev];
          localStorage.setItem('kpi_raw_teams_cache', JSON.stringify(nuevaLista));
          return nuevaLista;
        }
      });
      // Sincronizar en segundo plano para refrescar auditoría y cruces
      cargarDatosDesdeBackend(true);
      return true;
    }
    mostrarToast('Error al guardar datos de la reunión Teams', 'error');
    return false;
  };

  // Handler para registrar llamadas manuales (PBX y Celular)
  const handleGuardarLlamadaManual = async (
    tipo: 'pbx' | 'celular',
    datos: any
  ): Promise<boolean> => {
    try {
      const res = await guardarLlamadaManualBackend(tipo, datos);
      if (res.exito) {
        mostrarToast(
          `Llamada ${tipo.toUpperCase()} guardada con éxito en Supabase`,
          'exito'
        );
        // Actualizar listas locales inmediatamente
        if (tipo === 'pbx') {
          const itemPbx = {
            id: res.data?.id || `pbx_${Date.now()}`,
            uniqueid: res.data?.uniqueid || `manual_pbx_${Date.now()}`,
            fecha_hora: `${datos.fecha}T${datos.hora}`,
            nombre: datos.ejecutivo,
            extension: datos.extension,
            destino: datos.telefono_destino,
            duracion_segundos: Number(datos.duracion_segundos || 180),
            estado: datos.estado || 'CONTESTADA',
            asesor_nombre: datos.ejecutivo,
          };
          setRawPbx((prev) => [itemPbx, ...prev]);
        } else {
          const itemCel = {
            id: res.data?.id || Date.now(),
            fecha: datos.fecha,
            hora: datos.hora,
            usuario: datos.ejecutivo,
            linea: 'Manual',
            destino: datos.telefono_destino,
            duracion: Number(datos.duracion_segundos || 180),
            tipo: 'Saliente',
            asesor_nombre: datos.ejecutivo,
          };
          setRawCelular((prev) => [itemCel, ...prev]);
        }

        // Crear llamada normalizada e integrarla a llamadas para auditoría inmediata
        const nuevaLlamada: Llamada = {
          id:
            tipo === 'pbx'
              ? res.data?.uniqueid || `manual-pbx-${Date.now()}`
              : String(res.data?.id || Date.now()),
          proveedor: tipo === 'pbx' ? 'PBX' : 'Celular',
          canal_tipo: tipo === 'pbx' ? 'PBX' : 'Celular',
          vendedor_id: datos.ejecutivo
            ? datos.ejecutivo.toLowerCase().replace(/\s+/g, '_')
            : 'asesor_general',
          vendedor_nombre: datos.ejecutivo || 'Asesor General',
          telefono_marcado: String(datos.telefono_destino || '').trim(),
          prospecto_telefono: String(datos.telefono_destino || '').trim(),
          fecha_hora_inicio: `${datos.fecha}T${datos.hora}`,
          fecha_hora_fin: `${datos.fecha}T${datos.hora}`,
          duracion_segundos: Number(datos.duracion_segundos || 180),
          estado_llamada: datos.estado === 'CONTESTADA' ? 'contestada' : 'no_contestada',
          resultado: datos.estado || 'CONTESTADA',
          fuente: 'Manual',
        };
        setLlamadas((prev) => [nuevaLlamada, ...prev]);
        cargarDatosDesdeBackend(true);

        return true;
      } else {
        mostrarToast(res.error || 'Error al guardar la llamada en Supabase', 'error');
        return false;
      }
    } catch (e: any) {
      mostrarToast(`Error al guardar: ${e?.message || 'Error desconocido'}`, 'error');
      return false;
    }
  };

  // Motor de Cruce Inteligente completo (cada vista aplica su DateRangeFilter sin recortar históricos)
  const crucesAuditoriaTodos = useMemo(() => {
    return ejecutarCruceAuditoria(citasActivas, llamadas, parametros);
  }, [citasActivas, llamadas, parametros]);

  // Cruces filtrados específicamente para la vista "Resumen KPIs"
  const crucesResumenFiltrados = useMemo(() => {
    if (!fechaInicioResumen && !fechaFinResumen) return crucesAuditoriaTodos;
    return crucesAuditoriaTodos.filter((c) => {
      const raw =
        c.fecha_cita ||
        c.cita?.fecha_agendada ||
        c.cita?.fecha_hora_programada ||
        c.cita?.fecha_creado ||
        c.cita?.created_at ||
        '';
      const match = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
      const f = match ? match[1] : '';
      if (!f) return false;
      if (fechaInicioResumen && f < fechaInicioResumen) return false;
      if (fechaFinResumen && f > fechaFinResumen) return false;
      return true;
    });
  }, [crucesAuditoriaTodos, fechaInicioResumen, fechaFinResumen]);

  const resumenKPIs = useMemo(() => {
    return calcularResumenKPIs(crucesResumenFiltrados);
  }, [crucesResumenFiltrados]);

  const metricasVendedores = useMemo(() => {
    return calcularMetricasPorVendedor(crucesResumenFiltrados);
  }, [crucesResumenFiltrados]);

  const handleExportarResumenExcel = async () => {
    setExportandoResumen(true);
    try {
      const modoLabel =
        modoLeads === 'calificados' ? 'Leads Calificados' : 'Leads No Calificados';
      const subtitulo = formatearSubtituloExportacion({
        fechaInicio: fechaInicioResumen,
        fechaFin: fechaFinResumen,
        totalFilas: crucesResumenFiltrados.length,
        modo: `Resumen KPIs (${modoLabel})`,
      });
      await exportarLibroExcel(
        `Resumen_KPIs_${modoLeads}_${fechaInicioResumen || 'inicio'}_${fechaFinResumen || formatLocalDate()}`,
        [
          {
            name: 'Resumen KPIs',
            title: `Resumen Ejecutivo de KPIs — ${modoLabel}`,
            subtitle: subtitulo,
            accentHex: 'E11D48',
            columns: [
              { header: 'Métrica', key: 'metrica', width: 38 },
              { header: 'Resultado', key: 'resultado', width: 22, align: 'center' },
            ],
            rows: [
              { metrica: 'Total Citas / Leads Auditados', resultado: resumenKPIs.total_citas },
              { metrica: 'Llamadas a Tiempo (Verde)', resultado: resumenKPIs.citas_llamadas_a_tiempo },
              { metrica: 'Tasa de Cumplimiento General', resultado: `${resumenKPIs.tasa_cumplimiento_general}%` },
              { metrica: 'Citas No Atendidas (No Llamó)', resultado: resumenKPIs.citas_no_atendidas },
              { metrica: 'Citas Pendientes / Próximas', resultado: resumenKPIs.citas_pendientes || 0 },
              { metrica: 'Llamadas con Retraso / Otro Día', resultado: resumenKPIs.citas_con_retraso },
              { metrica: 'Llamadas Insuficientes / Cortas', resultado: resumenKPIs.citas_llamada_insuficiente },
              { metrica: 'Desfase / Respuesta Promedio', resultado: `${resumenKPIs.promedio_tiempo_respuesta_minutos} min` },
              { metrica: 'Horas Totales en Llamadas', resultado: `${resumenKPIs.duracion_total_llamadas_horas} hrs` },
            ],
          },
          {
            name: 'Ranking Asesores',
            title: `Scorecard por Asesor — ${modoLabel}`,
            subtitle: subtitulo,
            accentHex: 'D97706',
            columns: [
              { header: 'Asesor / Ejecutivo', key: 'vendedor_nombre', width: 28 },
              { header: 'Rol', key: 'rol', width: 18 },
              { header: 'Total Leads', key: 'total_citas', align: 'right' },
              { header: 'A Tiempo', key: 'citas_a_tiempo', align: 'right' },
              { header: 'Tarde Leve', key: 'citas_tarde_leve', align: 'right' },
              { header: 'Retraso Grave', key: 'citas_tarde_grave', align: 'right' },
              { header: 'No Llamó', key: 'citas_no_llamo', align: 'right' },
              { header: '% Cumplimiento', key: 'tasa_cumplimiento_pct', value: (r) => r.tasa_cumplimiento_pct / 100, numFmt: '0%', align: 'right' },
              { header: 'Desfase Medio (min)', key: 'promedio_desfase_minutos', align: 'right' },
              { header: 'Score', key: 'score_rendimiento', semantic: 'status', align: 'center' },
            ],
            rows: metricasVendedores,
          },
          {
            name: 'Detalle Cruces',
            title: `Detalle de Cruces — ${modoLabel}`,
            subtitle: subtitulo,
            accentHex: '1E293B',
            columns: [
              { header: 'País', key: 'pais', value: (r) => r.pais || r.cita?.pais || 'SV', width: 10, align: 'center' },
              { header: 'Prospecto', key: 'prospecto_nombre', width: 26 },
              { header: 'Teléfono', key: 'telefono', width: 16 },
              { header: 'Asesor', key: 'vendedor_nombre', width: 26 },
              { header: 'Fecha Objetivo', key: 'fecha_cita', value: (r) => r.fecha_cita || '-', width: 20 },
              { header: 'Fecha Llamada', key: 'fecha_llamada', value: (r) => r.fecha_llamada || '-', width: 20 },
              { header: 'Canal', key: 'canal_utilizado', value: (r) => r.canal_utilizado || 'Sin llamada', width: 14 },
              { header: 'Desfase (min)', key: 'desfase_minutos', value: (r) => r.desfase_minutos ?? '', align: 'right' },
              { header: 'Estado', key: 'estado_cumplimiento', semantic: 'status', align: 'center' },
              { header: 'Explicación', key: 'explicacion', width: 42 },
            ],
            rows: crucesResumenFiltrados,
          },
        ]
      );
    } finally {
      setExportandoResumen(false);
    }
  };

  // Conteos del mes actual para la barra lateral (muestra cantidad del mes o total disponible si no hay en el mes)
  const conteosMes = useMemo(() => {
    const pbxMes = rawPbx.filter((item) =>
      esDelMesActual(item, ['fecha_hora', 'fecha', 'calldate', 'created_at'])
    ).length;
    const celMes = rawCelular.filter((item) =>
      esDelMesActual(item, ['fecha', 'dia_consultado', 'created_at'])
    ).length;
    const waMes = rawWhatsapp.filter((item) =>
      esDelMesActual(item, ['fecha_llamada', 'created_at', 'fecha_hora'])
    ).length;
    const leadsMes = rawLeads.filter((item) =>
      esDelMesActual(item, ['fecha_agendada', 'fecha_creado', 'created_at'])
    ).length;
    const ncMes = rawLeadsNoCalificados.filter((item) =>
      esDelMesActual(item, ['created_at', 'created_at_sv', 'fecha'])
    ).length;
    const teamsMes = rawTeams.filter((item) =>
      esDelMesActual(item, ['fecha_hora_inicio', 'fecha_hora', 'created_at', 'fecha_reunion'])
    ).length;

    return {
      pbx: pbxMes > 0 ? pbxMes : rawPbx.length,
      celular: celMes > 0 ? celMes : rawCelular.length,
      whatsapp: waMes > 0 ? waMes : rawWhatsapp.length,
      leads: leadsMes > 0 ? leadsMes : rawLeads.length,
      leadsNoCalificados: ncMes > 0 ? ncMes : rawLeadsNoCalificados.length,
      teams: teamsMes > 0 ? teamsMes : rawTeams.length,
      catalogo: catalogo.length,
    };
  }, [rawPbx, rawCelular, rawWhatsapp, rawLeads, rawLeadsNoCalificados, rawTeams, catalogo]);

  // Pantalla de Login privada con dos entradas (Gabi / 1234)
  if (!usuarioAutenticado) {
    return (
      <LoginScreen
        onLoginSuccess={(usuario: { nombre: string; rol: string }, modoInicial: ModoLeads) => {
          setUsuarioAutenticado(usuario);
          setModoLeads(modoInicial);
          if (modoInicial === 'no_calificados' && vistaActiva === 'reg_leads') {
            setVistaActiva('reg_leads_no_calificados');
          } else if (modoInicial === 'calificados' && vistaActiva === 'reg_leads_no_calificados') {
            setVistaActiva('reg_leads');
          }
          mostrarToast(`Bienvenido ${usuario.nombre}. Modo: ${modoInicial === 'calificados' ? 'Leads Calificados' : 'Leads No Calificados'}`);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-[#070b14] text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-150">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl border transition-all ${
            toast.tipo === 'exito'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : toast.tipo === 'error'
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              : 'bg-indigo-950/90 border-indigo-500/50 text-indigo-200'
          }`}
        >
          {toast.tipo === 'exito' && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
          {toast.tipo === 'error' && <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />}
          {toast.tipo === 'info' && <Info className="h-4 w-4 text-indigo-400 shrink-0" />}
          <span className="text-xs font-medium">{toast.mensaje}</span>
        </div>
      )}

      {/* 1. SIDEBAR NAVEGACIÓN (CON TOGGLE AL CLIC EN LOGO, DOS ENTRADAS Y SALIR) */}
      <Sidebar
        vistaActiva={vistaActiva}
        onCambiarVista={(vista) => setVistaActiva(vista)}
        modoLeads={modoLeads}
        onAlternarModoLeads={handleAlternarModoLeads}
        conteos={conteosMes}
        onAbrirConfigSupabase={() => setModalSupabaseAbierto(true)}
        usuario={usuarioAutenticado}
        onLogout={() => {
          localStorage.removeItem('kpi_auth_user');
          setUsuarioAutenticado(null);
        }}
        onSincronizar={handleSincronizarManual}
        sincronizando={sincronizando}
      />

      {/* 2. ÁREA PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Contenido Dinámico */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* VISTA 0: DASHBOARD EJECUTIVO */}
          {vistaActiva === 'dashboard' && (
            <VistaDashboard
              crucesTodos={crucesAuditoriaTodos}
              citasActivas={citasActivas}
              llamadas={llamadas}
              catalogo={catalogo}
              parametros={parametros}
              modoLeads={modoLeads}
              onNavegar={(vista) => setVistaActiva(vista)}
              onVerTranscripcion={(cruce) => setLlamadaParaTranscripcion(cruce)}
              onSincronizar={handleSincronizarManual}
              sincronizando={sincronizando}
            />
          )}

          {/* VISTA 1: CRITERIOS */}
          {vistaActiva === 'criterios' && (
            <VistaCriterios
              parametros={parametros}
              onActualizarParametros={(nuevos) => {
                setParametros(nuevos);
                localStorage.setItem('kpi_parametros_auditoria_v2', JSON.stringify(nuevos));
                mostrarToast('Criterios de auditoría actualizados.', 'exito');
              }}
            />
          )}

          {/* VISTA 2: REGISTROS -> PBX */}
          {vistaActiva === 'reg_pbx' && (
            <VistaTablaRegistros
              titulo="Registros de Llamadas PBX"
              subtitulo="Llamadas en caliente consultadas directamente desde api.red.com.sv (PBX getCalls2)"
              icono="pbx"
              datos={rawPbx}
              catalogo={catalogo}
              leadsDisponibles={modoLeads === 'calificados' ? rawLeads : rawLeadsNoCalificados}
              onGuardarLlamadaManual={handleGuardarLlamadaManual}
              columnas={[
                { clave: 'uniqueid', etiqueta: 'Unique ID' },
                { clave: 'fecha_hora', etiqueta: 'Fecha y Hora', esFecha: true },
                {
                  clave: 'nombre',
                  etiqueta: 'Asesor / Nombre',
                  exportValue: (val, fila) =>
                    fila.asesor_nombre || val || (fila.extension ? `Ext. ${fila.extension}` : 'Línea PBX'),
                  render: (val, fila) => (
                    <span className="font-medium text-slate-900 dark:text-slate-200">
                      {fila.asesor_nombre || val || (fila.extension ? `Ext. ${fila.extension}` : 'Línea PBX')}
                    </span>
                  ),
                },
                { clave: 'extension', etiqueta: 'Ext.', render: (val) => val || '-' },
                { clave: 'destino', etiqueta: 'Tel. Destino', render: (val) => val || 'N/D' },
                {
                  clave: 'duracion_segundos',
                  etiqueta: 'Duración',
                  exportValue: (val) => `${val || 0}s (${Math.round((val || 0) / 60)}m)`,
                  render: (val) => `${val || 0}s (${Math.round((val || 0) / 60)}m)`,
                },
                {
                  clave: 'estado',
                  etiqueta: 'Estado',
                  exportValue: (val) => val || 'Sin contestar',
                  render: (val) => {
                    const st = String(val || '').toUpperCase();
                    const esOk =
                      (st.includes('CONTESTADA') && !st.includes('NO CONTESTADA')) ||
                      st === 'ANSWERED';
                    return (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          esOk
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800/50'
                            : 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800/50'
                        }`}
                      >
                        {val || 'Sin contestar'}
                      </span>
                    );
                  },
                },
                {
                  clave: 'consultar',
                  etiqueta: 'Audio & Transcripción',
                  render: (_val, fila) => {
                    const dur = Number(fila.duracion_segundos || fila.duracion || 0);
                    const estado = String(fila.estado || '').toUpperCase();
                    const noContestada =
                      estado.includes('NO CONTESTADA') ||
                      estado.includes('OCUPADA') ||
                      estado.includes('FALLIDA') ||
                      dur === 0;

                    if (noContestada) {
                      return (
                        <span
                          className="text-slate-400 dark:text-slate-500 text-[11px] italic"
                          title="Llamada no contestada o fallida (sin diálogo ni audio)"
                        >
                          Sin voz (0s)
                        </span>
                      );
                    }

                    return (
                      <button
                        type="button"
                        onClick={() => setLlamadaParaTranscripcion(fila)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:scale-[1.02] active:scale-[0.98]"
                        title="Escuchar audio y leer la transcripción en la misma ventana"
                      >
                        <Headphones className="h-3.5 w-3.5 shrink-0" />
                        <span>Consultar Llamada</span>
                      </button>
                    );
                  },
                },
              ]}
            />
          )}

          {/* VISTA 3: REGISTROS -> CELULAR */}
          {vistaActiva === 'reg_celular' && (
            <VistaTablaRegistros
              titulo="Historial de Llamadas de Celular"
              subtitulo="Llamadas en caliente consultadas directamente desde kpi.red.com.sv (Historial Ejecutivos)"
              icono="celular"
              datos={rawCelular}
              catalogo={catalogo}
              leadsDisponibles={modoLeads === 'calificados' ? rawLeads : rawLeadsNoCalificados}
              onGuardarLlamadaManual={handleGuardarLlamadaManual}
              columnas={[
                { clave: 'id', etiqueta: 'ID' },
                { clave: 'fecha', etiqueta: 'Fecha', esFecha: true },
                { clave: 'hora', etiqueta: 'Hora' },
                {
                  clave: 'usuario',
                  etiqueta: 'Usuario / Asesor',
                  exportValue: (val, fila) => fila.asesor_nombre || val || 'Ejecutivo Celular',
                  render: (val, fila) => (
                    <span className="font-medium text-slate-900 dark:text-slate-200">
                      {fila.asesor_nombre || val || 'Ejecutivo Celular'}
                    </span>
                  ),
                },
                { clave: 'linea', etiqueta: 'Línea Celular', render: (val) => val || 'Móvil Corporativo' },
                { clave: 'destino', etiqueta: 'Número Destino', render: (val) => val || 'N/D' },
                {
                  clave: 'duracion',
                  etiqueta: 'Duración',
                  exportValue: (val) => (!val || val === '0' || val === '0s' ? '0s' : typeof val === 'string' && val.includes(':') ? val : `${val}s`),
                  render: (val) => {
                    if (!val || val === '0' || val === '0s') {
                      return <span className="text-slate-400 dark:text-slate-500">0s (Sin respuesta)</span>;
                    }
                    return typeof val === 'string' && val.includes(':') ? val : `${val}s`;
                  },
                },
                { clave: 'operador', etiqueta: 'Operador', render: (val) => val || 'Claro' },
                {
                  clave: 'tipo',
                  etiqueta: 'Tipo',
                  exportValue: (val) => val || 'Saliente',
                  render: (val) => (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-medium">
                      {val || 'Saliente'}
                    </span>
                  ),
                },
              ]}
            />
          )}

          {/* VISTA 4: REGISTROS -> WHATSAPP */}
          {vistaActiva === 'reg_whatsapp' && (
            <VistaTablaRegistros
              titulo="Llamadas y Conversaciones WhatsApp"
              subtitulo="Registros en public.llamadas_whatsapp"
              icono="whatsapp"
              datos={rawWhatsapp}
              columnas={[
                { clave: 'id', etiqueta: 'ID' },
                { clave: 'fecha_llamada', etiqueta: 'Fecha / Hora', esFecha: true },
                {
                  clave: 'numero_ejecutivo',
                  etiqueta: 'Cel. Asesor',
                  exportValue: (val, fila) => fila.asesor_nombre || val || 'Asesor WhatsApp',
                  render: (val, fila) => fila.asesor_nombre || val || 'Asesor WhatsApp',
                },
                { clave: 'numero_cliente', etiqueta: 'Cel. Cliente', render: (val) => val || 'N/D' },
                {
                  clave: 'duracion_segundos',
                  etiqueta: 'Duración',
                  exportValue: (val) => `${val || 0}s`,
                  render: (val) => `${val || 0}s`,
                },
                {
                  clave: 'estado',
                  etiqueta: 'Estado',
                  render: (val) => val || 'Entregado',
                },
                { clave: 'direccion', etiqueta: 'Dirección', render: (val) => val || 'Saliente' },
                { clave: 'nota', etiqueta: 'Nota', render: (val) => val || '-' },
              ]}
            />
          )}

          {/* VISTA 5: REGISTROS -> LEADS CALIFICADOS (CITAS Y REUNIONES AGENDADAS) */}
          {vistaActiva === 'reg_leads' && (
            <VistaTablaRegistros
              titulo="Leads Calificados (Citas y Reuniones Agendadas)"
              subtitulo="Leads calificados en caliente desde prospektia.red.com.sv con fecha y hora de reunión pactada"
              icono="leads"
              datos={rawLeads.filter((l) => esLeadCalificadoValido(l))}
              columnas={[
                {
                  clave: 'codigo_prospecto',
                  etiqueta: 'Código',
                  render: (val) => (
                    <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                      {val || '-'}
                    </span>
                  ),
                },
                {
                  clave: 'nombre_prospecto',
                  etiqueta: 'Prospecto',
                  exportValue: (val, fila) =>
                    val || (fila.codigo_prospecto ? `Prospecto ${fila.codigo_prospecto}` : 'Prospecto Sin Nombre'),
                  render: (val, fila) => (
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {val || (fila.codigo_prospecto ? `Prospecto ${fila.codigo_prospecto}` : 'Prospecto Sin Nombre')}
                    </span>
                  ),
                },
                {
                  clave: 'telefono',
                  etiqueta: 'Teléfono',
                  exportValue: (val, fila) => val || fila.celular || fila.movil || 'Sin teléfono',
                  render: (val, fila) => (
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {val || fila.celular || fila.movil || 'Sin teléfono'}
                    </span>
                  ),
                },
                {
                  clave: 'tipo_reunion',
                  etiqueta: 'Tipo de Reunión',
                  exportValue: (val) => String(val || 'Llamada Telefonica').trim(),
                  render: (val) => {
                    const tipo = String(val || 'Llamada Telefonica').trim();
                    const tipoLower = tipo.toLowerCase();
                    if (tipoLower.includes('teams') || tipoLower.includes('virtual')) {
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-700/50 whitespace-nowrap">
                          <Video className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
                          <span>{tipo}</span>
                        </span>
                      );
                    }
                    if (tipoLower.includes('presencial')) {
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-700/50 whitespace-nowrap">
                          <Building2 className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400 shrink-0" />
                          <span>{tipo}</span>
                        </span>
                      );
                    }
                    return (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700/50 whitespace-nowrap">
                        <Phone className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                        <span>{tipo}</span>
                      </span>
                    );
                  },
                },
                {
                  clave: 'fecha_agendada',
                  etiqueta: 'Fecha Reunión (Agendada)',
                  esFecha: true,
                  exportValue: (val) => (val && val !== 'null' ? String(val).slice(0, 10) : ''),
                  render: (val) => {
                    const fecha = val && val !== 'null' ? String(val).slice(0, 10) : '';
                    return fecha ? (
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/60 px-2 py-0.5 rounded border dark:border-emerald-800/40">
                        {fecha}
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500 italic text-[11px]">
                        Sin reunión pactada
                      </span>
                    );
                  },
                },
                {
                  clave: 'hora_agendada',
                  etiqueta: 'Hora Reunión (Agendada)',
                  exportValue: (val) => (val && val !== 'null' ? String(val).slice(0, 8) : '-'),
                  render: (val) => {
                    const hora = val && val !== 'null' ? String(val).slice(0, 8) : '';
                    return hora ? (
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/50 px-2 py-0.5 rounded border dark:border-emerald-800/30">
                        {hora}
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500 text-[11px]">-</span>
                    );
                  },
                },
                {
                  clave: 'fecha_creado',
                  etiqueta: 'Fecha Creación',
                  esFecha: true,
                  exportValue: (val, fila) => val || (fila.created_at ? String(fila.created_at).slice(0, 10) : 'N/D'),
                  render: (val, fila) => (
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {val || (fila.created_at ? String(fila.created_at).slice(0, 10) : 'N/D')}
                    </span>
                  ),
                },
                {
                  clave: 'hora_creado',
                  etiqueta: 'Hora Creación',
                  exportValue: (val, fila) =>
                    val ? String(val).slice(0, 8) : fila.created_at ? String(fila.created_at).slice(11, 19) : 'N/D',
                  render: (val, fila) => (
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {val ? String(val).slice(0, 8) : (fila.created_at ? String(fila.created_at).slice(11, 19) : 'N/D')}
                    </span>
                  ),
                },
                {
                  clave: 'asesor_nombre',
                  etiqueta: 'Asesor Asignado',
                  exportValue: (val, fila) => val || fila.asesor_id || 'Asesor General',
                  render: (val, fila) => (
                    <span className="font-medium text-slate-900 dark:text-slate-200">
                      {val || fila.asesor_id || 'Asesor General'}
                    </span>
                  ),
                },
                {
                  clave: 'pais',
                  etiqueta: 'País',
                  exportValue: (val) => val || 'SV',
                  render: (val) => (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      val === 'GT'
                        ? 'bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800/40'
                        : 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800/40'
                    }`}>
                      {val || 'SV'}
                    </span>
                  ),
                },
                {
                  clave: 'status',
                  etiqueta: 'Status',
                  exportValue: (val) => val || 'Agendado',
                  render: (val) => (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 border dark:border-emerald-800/40">
                      {val || 'Agendado'}
                    </span>
                  ),
                },
                // KPI RETROALIMENTACION
                {
                  clave: 'kpi_retroalimentacion_etapa_1',
                  etiqueta: 'ETAPA 1',
                  grupo: 'KPI RETROALIMENTACION',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(String(fila.id), { kpi_retroalimentacion_etapa_1: nuevo });
                        setRawLeads((prev) =>
                          prev.map((item) =>
                            item.id === fila.id ? { ...item, kpi_retroalimentacion_etapa_1: nuevo } : item
                          )
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
                {
                  clave: 'kpi_retroalimentacion_etapa_2',
                  etiqueta: 'ETAPA 2',
                  grupo: 'KPI RETROALIMENTACION',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(String(fila.id), { kpi_retroalimentacion_etapa_2: nuevo });
                        setRawLeads((prev) =>
                          prev.map((item) =>
                            item.id === fila.id ? { ...item, kpi_retroalimentacion_etapa_2: nuevo } : item
                          )
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
                {
                  clave: 'kpi_retroalimentacion_etapa_3',
                  etiqueta: 'ETAPA 3',
                  grupo: 'KPI RETROALIMENTACION',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(String(fila.id), { kpi_retroalimentacion_etapa_3: nuevo });
                        setRawLeads((prev) =>
                          prev.map((item) =>
                            item.id === fila.id ? { ...item, kpi_retroalimentacion_etapa_3: nuevo } : item
                          )
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
                {
                  clave: 'kpi_retroalimentacion_etapa_4',
                  etiqueta: 'ETAPA 4',
                  grupo: 'KPI RETROALIMENTACION',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(String(fila.id), { kpi_retroalimentacion_etapa_4: nuevo });
                        setRawLeads((prev) =>
                          prev.map((item) =>
                            item.id === fila.id ? { ...item, kpi_retroalimentacion_etapa_4: nuevo } : item
                          )
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
                // KPI SLA
                {
                  clave: 'kpi_sla_etapa_1',
                  etiqueta: 'ETAPA 1',
                  grupo: 'KPI SLA',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(String(fila.id), { kpi_sla_etapa_1: nuevo });
                        setRawLeads((prev) =>
                          prev.map((item) =>
                            item.id === fila.id ? { ...item, kpi_sla_etapa_1: nuevo } : item
                          )
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
                {
                  clave: 'kpi_sla_etapa_2',
                  etiqueta: 'ETAPA 2',
                  grupo: 'KPI SLA',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(String(fila.id), { kpi_sla_etapa_2: nuevo });
                        setRawLeads((prev) =>
                          prev.map((item) =>
                            item.id === fila.id ? { ...item, kpi_sla_etapa_2: nuevo } : item
                          )
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
                {
                  clave: 'kpi_sla_etapa_3',
                  etiqueta: 'ETAPA 3',
                  grupo: 'KPI SLA',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(String(fila.id), { kpi_sla_etapa_3: nuevo });
                        setRawLeads((prev) =>
                          prev.map((item) =>
                            item.id === fila.id ? { ...item, kpi_sla_etapa_3: nuevo } : item
                          )
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
              ]}
            />
          )}

          {/* VISTA 5B: REGISTROS -> LEADS NO CALIFICADOS (PROSPECTOS DIRECTOS) */}
          {vistaActiva === 'reg_leads_no_calificados' && (
            <VistaTablaRegistros
              titulo="Leads No Calificados (Prospectos Directos)"
              subtitulo="Leads no calificados consultados en caliente desde prospektia.red.com.sv (Auditoría)"
              icono="leads"
              datos={rawLeadsNoCalificados}
              columnas={[
                {
                  clave: 'client_id',
                  etiqueta: 'Client ID',
                  render: (val) => (
                    <span className="font-mono font-bold text-cyan-700 dark:text-cyan-300">
                      {val || '-'}
                    </span>
                  ),
                },
                {
                  clave: 'client_name',
                  etiqueta: 'Cliente / Prospecto',
                  render: (val) => (
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {val || '-'}
                    </span>
                  ),
                },
                {
                  clave: 'telefono',
                  etiqueta: 'Teléfono',
                  render: (val) => (
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {val || 'Sin teléfono'}
                    </span>
                  ),
                },
                {
                  clave: 'created_at_sv',
                  etiqueta: 'Fecha/Hora Ingreso',
                  exportValue: (val, fila) =>
                    val || (fila.fecha && fila.hora ? `${fila.fecha} ${fila.hora}` : 'N/D'),
                  render: (val, fila) => (
                    <span className="font-mono text-emerald-700 dark:text-emerald-300 font-medium">
                      {val || (fila.fecha && fila.hora ? `${fila.fecha} ${fila.hora}` : 'N/D')}
                    </span>
                  ),
                },
                {
                  clave: 'fecha',
                  etiqueta: 'Fecha',
                  esFecha: true,
                  exportValue: (val, fila) => val || (fila.created_at ? String(fila.created_at).slice(0, 10) : 'N/D'),
                  render: (val, fila) => (
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {val || (fila.created_at ? String(fila.created_at).slice(0, 10) : 'N/D')}
                    </span>
                  ),
                },
                {
                  clave: 'hora',
                  etiqueta: 'Hora',
                  exportValue: (val, fila) => val || (fila.created_at ? String(fila.created_at).slice(11, 19) : 'N/D'),
                  render: (val, fila) => (
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {val || (fila.created_at ? String(fila.created_at).slice(11, 19) : 'N/D')}
                    </span>
                  ),
                },
                { clave: 'advisor_name', etiqueta: 'Asesor' },
                { clave: 'campaign_name', etiqueta: 'Campaña' },
                // KPI RETROALIMENTACION (ETAPAS 1-4)
                {
                  clave: 'kpi_retroalimentacion_etapa_1',
                  etiqueta: 'ETAPA 1',
                  grupo: 'KPI RETROALIMENTACION',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(
                          String(fila.id || fila.client_id || ''),
                          { kpi_retroalimentacion_etapa_1: nuevo },
                          fila.client_id
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
                {
                  clave: 'kpi_retroalimentacion_etapa_2',
                  etiqueta: 'ETAPA 2',
                  grupo: 'KPI RETROALIMENTACION',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(
                          String(fila.id || fila.client_id || ''),
                          { kpi_retroalimentacion_etapa_2: nuevo },
                          fila.client_id
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
                {
                  clave: 'kpi_retroalimentacion_etapa_3',
                  etiqueta: 'ETAPA 3',
                  grupo: 'KPI RETROALIMENTACION',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(
                          String(fila.id || fila.client_id || ''),
                          { kpi_retroalimentacion_etapa_3: nuevo },
                          fila.client_id
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
                {
                  clave: 'kpi_retroalimentacion_etapa_4',
                  etiqueta: 'ETAPA 4',
                  grupo: 'KPI RETROALIMENTACION',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(
                          String(fila.id || fila.client_id || ''),
                          { kpi_retroalimentacion_etapa_4: nuevo },
                          fila.client_id
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
                // KPI SLA (ETAPAS 1-3)
                {
                  clave: 'kpi_sla_etapa_1',
                  etiqueta: 'ETAPA 1',
                  grupo: 'KPI SLA',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(
                          String(fila.id || fila.client_id || ''),
                          { kpi_sla_etapa_1: nuevo },
                          fila.client_id
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
                {
                  clave: 'kpi_sla_etapa_2',
                  etiqueta: 'ETAPA 2',
                  grupo: 'KPI SLA',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(
                          String(fila.id || fila.client_id || ''),
                          { kpi_sla_etapa_2: nuevo },
                          fila.client_id
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
                {
                  clave: 'kpi_sla_etapa_3',
                  etiqueta: 'ETAPA 3',
                  grupo: 'KPI SLA',
                  exportValue: (val) => (val ? 'Sí' : 'No'),
                  render: (val, fila) => (
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevo = !val;
                        await handleActualizarLeadKpi(
                          String(fila.id || fila.client_id || ''),
                          { kpi_sla_etapa_3: nuevo },
                          fila.client_id
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                        val
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/50'
                          : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/50'
                      }`}
                    >
                      {val ? 'Sí' : 'No'}
                    </button>
                  ),
                },
              ]}
            />
          )}

          {/* VISTA 6: REGISTROS -> REUNIONES TEAMS */}
          {vistaActiva === 'reg_teams' && (
            <VistaTablaRegistros
              titulo="Reuniones Virtuales Teams"
              subtitulo="Reuniones agendadas en public.llamadas_teams y extraídas automáticamente de Leads Virtuales"
              icono="teams"
              datos={rawTeams}
              catalogo={catalogo}
              onGuardarTeams={handleGuardarTeams}
              columnas={[
                { clave: 'id', etiqueta: 'ID' },
                {
                  clave: 'pais',
                  etiqueta: 'País',
                  exportValue: (val, fila) => val || fila.pais || 'SV',
                  render: (val, fila) => {
                    const p = val || fila.pais || 'SV';
                    return (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${
                          p === 'GT'
                            ? 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800/60'
                            : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800/60'
                        }`}
                      >
                        {p === 'GT' ? '🇬🇹 GT' : '🇸🇻 SV'}
                      </span>
                    );
                  },
                },
                {
                  clave: 'codigo_prospecto',
                  etiqueta: 'Código Lead',
                  render: (val) => (
                    <span className="font-bold text-slate-900 dark:text-white">{val || '-'}</span>
                  ),
                },
                {
                  clave: 'cliente',
                  etiqueta: 'Cliente / Prospecto',
                  exportValue: (val, fila) =>
                    val || (fila.codigo_prospecto ? `Prospecto ${fila.codigo_prospecto}` : 'Cliente Virtual'),
                  render: (val, fila) =>
                    val || (fila.codigo_prospecto ? `Prospecto ${fila.codigo_prospecto}` : 'Cliente Virtual'),
                },
                {
                  clave: 'ejecutivo',
                  etiqueta: 'Ejecutivo Teams',
                  exportValue: (val, fila) => fila.ejecutivo_nombre || val || 'Ejecutivo Teams',
                  render: (val, fila) => (
                    <span className="font-medium text-purple-700 dark:text-purple-300">
                      {fila.ejecutivo_nombre || val || 'Ejecutivo Teams'}
                    </span>
                  ),
                },
                { clave: 'fecha_reunion', etiqueta: 'Fecha', esFecha: true },
                { clave: 'hora_reunion', etiqueta: 'Hora' },
                {
                  clave: 'estado_teams',
                  etiqueta: 'Estado de Reunión',
                  exportValue: (val) => val || 'Pendiente de realizar',
                  render: (val) => {
                    const st = val || 'Pendiente de realizar';
                    let estilo =
                      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
                    if (st.includes('evidencia') || (st.includes('hizo') && !st.includes('sin'))) {
                      estilo =
                        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800/60';
                    } else if (st.includes('sin evidencia')) {
                      estilo =
                        'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800/60';
                    } else if (st.includes('No') || st.includes('Cancel')) {
                      estilo =
                        'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800/60';
                    } else if (st.includes('Reprog')) {
                      estilo =
                        'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800/60';
                    }
                    return (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${estilo}`}>
                        {st}
                      </span>
                    );
                  },
                },
                {
                  clave: 'evidencia_url',
                  etiqueta: 'Evidencia Teams',
                  exportValue: (val) => val || 'Sin enlace',
                  render: (val) =>
                    val ? (
                      <a
                        href={val}
                        target="_blank"
                        rel="noreferrer"
                        className="text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 underline inline-flex items-center gap-1 font-sans"
                      >
                        <ExternalLink className="h-3 w-3" /> Ver Evidencia
                      </a>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-600 italic">Sin enlace</span>
                    ),
                },
              ]}
            />
          )}

          {/* VISTA 7: CATÁLOGO CRUD */}
          {vistaActiva === 'catalogo_crud' && (
            <VistaCatalogoCrud
              catalogo={catalogo}
              onGuardarItem={handleGuardarCatalogo}
              onEliminarItem={handleEliminarCatalogo}
            />
          )}

          {/* VISTA 8: RESUMEN KPIS */}
          {vistaActiva === 'resumen_kpis' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Resumen Global de KPIs y Desempeño
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Cruce consolidado de{' '}
                    {modoLeads === 'calificados' ? 'Leads Calificados' : 'Leads No Calificados'}{' '}
                    con rango por defecto del 1 del mes al día de hoy.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportarResumenExcel}
                  disabled={exportandoResumen}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{exportandoResumen ? 'Generando...' : 'Descargar Excel'}</span>
                </button>
              </div>

              <DateRangeFilter
                fechaInicio={fechaInicioResumen}
                fechaFin={fechaFinResumen}
                onChangeInicio={setFechaInicioResumen}
                onChangeFin={setFechaFinResumen}
                onLimpiar={() => {
                  const def = getRangoDefaultLeads();
                  setFechaInicioResumen(def.inicio);
                  setFechaFinResumen(def.fin);
                }}
                label={`Filtrar Período (${crucesResumenFiltrados.length} de ${crucesAuditoriaTodos.length} registros)`}
              />

              <MetricsOverview
                kpis={resumenKPIs}
                cruces={crucesResumenFiltrados}
                parametros={parametros}
                onVerDetalleCruce={() => setVistaActiva('kpi_cumplimiento')}
                onCambiarTab={() => {}}
              />
              <VendorScorecard
                vendedores={metricasVendedores}
                fechaInicio={fechaInicioResumen}
                fechaFin={fechaFinResumen}
              />
            </div>
          )}

          {/* VISTA 9: KPI 1 - CUMPLIMIENTO LEADS (+/- 15 MIN) CON LISTA DE VENDEDORES & DIAGNÓSTICO */}
          {vistaActiva === 'kpi_cumplimiento' && (
            <VistaKpiCumplimiento
              cruces={crucesAuditoriaTodos}
              tipoLeadActual={modoLeads}
              catalogo={catalogo}
              parametros={parametros}
              onVerTranscripcion={(cruce) => setLlamadaParaTranscripcion(cruce)}
              onEscucharAudio={(ll) => setLlamadaReproduciendo(ll)}
            />
          )}

          {/* VISTA 10: KPI 2 - SLA DE ETAPAS */}
          {vistaActiva === 'kpi_sla' && (
            <VistaKpiSla
              citas={citasActivas}
              onActualizarLeadKpi={(id, cambios) => {
                const match = citasActivas.find((c) => c.id === id);
                return handleActualizarLeadKpi(id, cambios, match?.codigo_prospecto);
              }}
              tipoLeadActual={modoLeads}
            />
          )}

          {/* VISTA 11: KPI 3 - RETROALIMENTACIÓN DE ETAPAS */}
          {vistaActiva === 'kpi_retroalimentacion' && (
            <VistaKpiRetroalimentacion
              citas={citasActivas}
              onActualizarLeadKpi={(id, cambios) => {
                const match = citasActivas.find((c) => c.id === id);
                return handleActualizarLeadKpi(id, cambios, match?.codigo_prospecto);
              }}
              tipoLeadActual={modoLeads}
            />
          )}
        </main>
      </div>

      {/* Modal de Configuración y Edge Function de Supabase */}
      <SupabaseConfigModal
        abierto={modalSupabaseAbierto}
        onCerrar={() => setModalSupabaseAbierto(false)}
        config={{
          supabase_url: 'https://sbopifiiyezmvsadwkpg.supabase.co',
          supabase_anon_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3BpZmlpeWV6bXZzYWR3a3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzM0OTYsImV4cCI6MjEwMDMwOTQ5Nn0.ZI5y8lroFF529Xr-Otm1fcq6H2lhbh9e3s-WU9O6I7A',
          edge_function_name: 'sincronizar-datos',
          almacenar_en_bd: true,
          frecuencia_sync_minutos: 60,
          conectado: true,
        }}
        onGuardar={() => {}}
        onDatosActualizados={() => {
          cargarDatosDesdeBackend(true);
          mostrarToast('Datos de Supabase actualizados tras sincronización', 'exito');
        }}
      />

      {/* Reproductor Flotante de Audio para Llamadas PBX */}
      <ReproductorAudioFlotante
        llamada={llamadaReproduciendo}
        onClose={() => setLlamadaReproduciendo(null)}
      />

      {/* Modal de Transcripción y Análisis QA de Llamada con IA */}
      {llamadaParaTranscripcion && (
        <ModalTranscripcionLlamada
          llamada={llamadaParaTranscripcion}
          onClose={() => setLlamadaParaTranscripcion(null)}
          onEscucharAudio={(ll) => setLlamadaReproduciendo(ll)}
        />
      )}
    </div>
  );
}
