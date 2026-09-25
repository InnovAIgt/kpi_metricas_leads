/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Cita,
  Llamada,
  ParametrosAuditoria,
  FiltroFecha,
  SupabaseConfig,
  VistaApp,
  ModoLeads,
} from './types';
import { PARAMETROS_DEFAULT } from './data/mockData';
import {
  ejecutarCruceAuditoria,
  calcularResumenKPIs,
  calcularMetricasPorVendedor,
} from './utils/matchingEngine';
import { esDelMesActual } from './utils/dateHelpers';
import {
  sincronizarDatosDesdeBackend,
  actualizarLeadKpiBackend,
  guardarCatalogoItemBackend,
  eliminarCatalogoItemBackend,
  guardarReunionTeamsBackend,
  guardarLlamadaManualBackend,
  triggerEdgeFunction,
} from './services/apiService';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { VistaCriterios } from './components/VistaCriterios';
import { VistaKpiCumplimiento } from './components/VistaKpiCumplimiento';
import { VistaKpiSla } from './components/VistaKpiSla';
import { VistaKpiRetroalimentacion } from './components/VistaKpiRetroalimentacion';
import { VistaTablaRegistros } from './components/VistaTablaRegistros';
import { VistaCatalogoCrud } from './components/VistaCatalogoCrud';
import { MetricsOverview } from './components/MetricsOverview';
import { VendorScorecard } from './components/VendorScorecard';
import { LoginScreen } from './components/LoginScreen';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { CheckCircle2, AlertCircle, Info, ExternalLink, Play, ArrowLeftRight } from 'lucide-react';

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

  // Vista activa del nuevo menú
  const [vistaActiva, setVistaActiva] = useState<VistaApp>('kpi_cumplimiento');

  // Datos separados por categoría
  const [citasCalificadas, setCitasCalificadas] = useState<Cita[]>(() => {
    const saved = localStorage.getItem('kpi_citas_calificadas');
    return saved ? JSON.parse(saved) : [];
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
    return saved ? JSON.parse(saved) : [];
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
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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

  // Parámetros de auditoría (5 min antes/después, 8am-6pm lun-vie)
  const [parametros, setParametros] = useState<ParametrosAuditoria>(() => {
    const saved = localStorage.getItem('kpi_parametros_auditoria');
    return saved ? JSON.parse(saved) : PARAMETROS_DEFAULT;
  });

  const [filtroFecha, setFiltroFecha] = useState<FiltroFecha>('este_mes');
  const [sincronizando, setSincronizando] = useState(false);
  const [modalSupabaseAbierto, setModalSupabaseAbierto] = useState(false);
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

  // Carga automática inicial de datos reales desde el backend
  useEffect(() => {
    cargarDatosDesdeBackend();
  }, []);

  useEffect(() => {
    if (usuarioAutenticado) {
      cargarDatosDesdeBackend();
    }
  }, [usuarioAutenticado]);

  const cargarDatosDesdeBackend = async () => {
    setSincronizando(true);
    try {
      const data = await sincronizarDatosDesdeBackend();
      if (data.citasCalificadas.length > 0) {
        setCitasCalificadas(data.citasCalificadas);
        localStorage.setItem('kpi_citas_calificadas', JSON.stringify(data.citasCalificadas));
      }
      if (data.citasNoCalificadas.length > 0) {
        setCitasNoCalificadas(data.citasNoCalificadas);
        localStorage.setItem('kpi_citas_no_calificadas', JSON.stringify(data.citasNoCalificadas));
      }
      if (data.llamadas.length > 0) {
        setLlamadas(data.llamadas);
        localStorage.setItem('kpi_llamadas_data', JSON.stringify(data.llamadas));
      }
      setCatalogo(data.catalogo || []);
      setRawPbx(data.rawPbx || []);
      setRawCelular(data.rawCelular || []);
      setRawWhatsapp(data.rawWhatsapp || []);
      setRawLeads(data.rawLeads || []);
      setRawLeadsNoCalificados(data.rawLeadsNoCalificados || []);
      setRawTeams(data.rawTeams || []);

      if (data.catalogo && data.catalogo.length > 0) localStorage.setItem('kpi_catalogo_cache', JSON.stringify(data.catalogo));
      if (data.rawPbx && data.rawPbx.length > 0) localStorage.setItem('kpi_raw_pbx_cache', JSON.stringify(data.rawPbx));
      if (data.rawCelular && data.rawCelular.length > 0) localStorage.setItem('kpi_raw_cel_cache', JSON.stringify(data.rawCelular));
      if (data.rawWhatsapp && data.rawWhatsapp.length > 0) localStorage.setItem('kpi_raw_wa_cache', JSON.stringify(data.rawWhatsapp));
      if (data.rawLeads && data.rawLeads.length > 0) localStorage.setItem('kpi_raw_leads_cache', JSON.stringify(data.rawLeads));
      if (data.rawLeadsNoCalificados && data.rawLeadsNoCalificados.length > 0) localStorage.setItem('kpi_raw_nc_cache', JSON.stringify(data.rawLeadsNoCalificados));
      if (data.rawTeams && data.rawTeams.length > 0) localStorage.setItem('kpi_raw_teams_cache', JSON.stringify(data.rawTeams));
    } catch (err: any) {
      console.warn('Error al sincronizar datos:', err);
    } finally {
      setSincronizando(false);
    }
  };

  const handleSincronizarManual = async () => {
    mostrarToast('Sincronizando con Supabase y PBX en vivo...', 'info');
    await cargarDatosDesdeBackend();
    mostrarToast('Datos sincronizados correctamente.', 'exito');
  };

  // Citas activas según el modo seleccionado (¡NO SE MEZCLAN!)
  const citasActivas = useMemo(() => {
    return modoLeads === 'calificados' ? citasCalificadas : citasNoCalificadas;
  }, [modoLeads, citasCalificadas, citasNoCalificadas]);

  // Guardar cambios de KPIs en lead (SLA / Retroalimentación)
  const handleActualizarLeadKpi = async (
    leadId: string,
    cambios: Partial<Cita>
  ): Promise<boolean> => {
    const tabla = modoLeads === 'calificados' ? 'leads' : 'leads_no_calificados';

    if (modoLeads === 'calificados') {
      setCitasCalificadas((prev) =>
        prev.map((c) => (c.id === leadId ? { ...c, ...cambios } : c))
      );
    } else {
      setCitasNoCalificadas((prev) =>
        prev.map((c) => (c.id === leadId ? { ...c, ...cambios } : c))
      );
    }

    const ok = await actualizarLeadKpiBackend(leadId, cambios, tabla);
    if (ok) {
      mostrarToast(`Registro actualizado en ${tabla} exitosamente`, 'exito');
      return true;
    } else {
      mostrarToast('Error al persistir cambios en Supabase', 'error');
      return false;
    }
  };

  // Catálogo CRUD handlers
  const handleGuardarCatalogo = async (item: any) => {
    const ok = await guardarCatalogoItemBackend(item);
    if (ok) {
      mostrarToast('Catálogo actualizado en Supabase', 'exito');
      await cargarDatosDesdeBackend();
      return true;
    }
    mostrarToast('Error al guardar en catálogo', 'error');
    return false;
  };

  const handleEliminarCatalogo = async (id: string) => {
    const ok = await eliminarCatalogoItemBackend(id);
    if (ok) {
      mostrarToast('Asesor eliminado del catálogo', 'exito');
      await cargarDatosDesdeBackend();
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
      cargarDatosDesdeBackend();
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
          prospecto_telefono: String(datos.telefono_destino || '').trim(),
          fecha_hora_inicio: `${datos.fecha}T${datos.hora}`,
          fecha_hora_fin: `${datos.fecha}T${datos.hora}`,
          duracion_segundos: Number(datos.duracion_segundos || 180),
          estado_llamada: datos.estado === 'CONTESTADA' ? 'contestada' : 'no_contestada',
          resultado: datos.estado || 'CONTESTADA',
          fuente: 'Manual',
        };
        setLlamadas((prev) => [nuevaLlamada, ...prev]);

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

  // Filtrado temporal global (por defecto: mes actual Septiembre 2026)
  const citasFiltradas = useMemo(() => {
    if (filtroFecha === 'todos') return citasActivas;
    const ahora = new Date();
    const hoyStr = ahora.toISOString().slice(0, 10);

    return citasActivas.filter((c) => {
      if (filtroFecha === 'hoy') {
        const f1 = c.fecha_agendada || '';
        const f2 = c.fecha_hora_programada ? c.fecha_hora_programada.slice(0, 10) : '';
        const f3 = c.fecha_creado ? c.fecha_creado.slice(0, 10) : '';
        return f1 === hoyStr || f2 === hoyStr || f3 === hoyStr;
      }
      if (filtroFecha === 'este_mes') {
        return esDelMesActual(c, [
          'fecha_agendada',
          'fecha_creado',
          'created_at',
          'fecha_hora_programada',
        ]);
      }
      return true;
    });
  }, [citasActivas, filtroFecha]);

  const llamadasFiltradas = useMemo(() => {
    if (filtroFecha === 'todos') return llamadas;
    const ahora = new Date();
    const hoyStr = ahora.toISOString().slice(0, 10);

    return llamadas.filter((call) => {
      const fechaCall = call.fecha_hora_inicio ? call.fecha_hora_inicio.slice(0, 10) : '';
      if (filtroFecha === 'hoy') return fechaCall === hoyStr;
      if (filtroFecha === 'este_mes') {
        return esDelMesActual(call, [
          'fecha_hora_inicio',
          'fecha_hora',
          'fecha',
          'calldate',
          'created_at',
        ]);
      }
      return true;
    });
  }, [llamadas, filtroFecha]);

  // Motor de Cruce Inteligente (auditoría ±5 min, comparación telefónica y de asesor)
  const crucesAuditoria = useMemo(() => {
    return ejecutarCruceAuditoria(citasFiltradas, llamadasFiltradas, parametros);
  }, [citasFiltradas, llamadasFiltradas, parametros]);

  const resumenKPIs = useMemo(() => {
    return calcularResumenKPIs(crucesAuditoria);
  }, [crucesAuditoria]);

  const metricasVendedores = useMemo(() => {
    return calcularMetricasPorVendedor(crucesAuditoria);
  }, [crucesAuditoria]);

  // Conteos del mes actual para la barra lateral (muestra solo la cantidad del mes)
  const conteosMes = useMemo(() => {
    return {
      pbx: rawPbx.filter((item) =>
        esDelMesActual(item, ['fecha_hora', 'fecha', 'calldate', 'created_at'])
      ).length,
      celular: rawCelular.filter((item) =>
        esDelMesActual(item, ['fecha', 'dia_consultado', 'created_at'])
      ).length,
      whatsapp: rawWhatsapp.filter((item) =>
        esDelMesActual(item, ['fecha_llamada', 'created_at', 'fecha_hora'])
      ).length,
      leads: rawLeads.filter((item) =>
        esDelMesActual(item, ['fecha_agendada', 'fecha_creado', 'created_at'])
      ).length,
      leadsNoCalificados: rawLeadsNoCalificados.filter((item) =>
        esDelMesActual(item, ['created_at', 'created_at_sv'])
      ).length,
      teams: rawTeams.filter((item) =>
        esDelMesActual(item, ['fecha_hora_inicio', 'fecha_hora', 'created_at'])
      ).length,
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
    <div className="flex h-screen bg-[#070b14] text-slate-100 overflow-hidden font-sans">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl border transition-all animate-bounce ${
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

      {/* 1. SIDEBAR NAVEGACIÓN (CON TOGGLE AL CLIC EN LOGO Y DOS ENTRADAS) */}
      <Sidebar
        vistaActiva={vistaActiva}
        onCambiarVista={(vista) => setVistaActiva(vista)}
        modoLeads={modoLeads}
        onAlternarModoLeads={handleAlternarModoLeads}
        conteos={conteosMes}
        onAbrirConfigSupabase={() => setModalSupabaseAbierto(true)}
      />

      {/* 2. ÁREA PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header Superior */}
        <Header
          filtroFecha={filtroFecha}
          setFiltroFecha={setFiltroFecha}
          onAbrirParametros={() => setVistaActiva('criterios')}
          onAbrirConfigSupabase={() => setModalSupabaseAbierto(true)}
          onSincronizar={handleSincronizarManual}
          sincronizando={sincronizando}
          supabaseConfig={{
            supabase_url: 'https://sbopifiiyezmvsadwkpg.supabase.co',
            supabase_anon_key: 'oculto-en-backend',
            edge_function_name: 'sincronizar-datos',
            almacenar_en_bd: true,
            frecuencia_sync_minutos: 60,
            conectado: true,
          }}
          onLogout={() => {
            localStorage.removeItem('kpi_auth_user');
            setUsuarioAutenticado(null);
          }}
          usuario={usuarioAutenticado}
        />

        {/* Contenido Dinámico */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* VISTA 1: CRITERIOS */}
          {vistaActiva === 'criterios' && (
            <VistaCriterios
              parametros={parametros}
              onActualizarParametros={(nuevos) => {
                setParametros(nuevos);
                localStorage.setItem('kpi_parametros_auditoria', JSON.stringify(nuevos));
                mostrarToast('Criterios de auditoría actualizados.', 'exito');
              }}
            />
          )}

          {/* VISTA 2: REGISTROS -> PBX */}
          {vistaActiva === 'reg_pbx' && (
            <VistaTablaRegistros
              titulo="Registros de Llamadas PBX"
              subtitulo="Datos sincronizados desde getCalls2 en public.llamadas_pbx"
              icono="pbx"
              datos={rawPbx}
              catalogo={catalogo}
              leadsDisponibles={rawLeads}
              onGuardarLlamadaManual={handleGuardarLlamadaManual}
              columnas={[
                { clave: 'uniqueid', etiqueta: 'Unique ID' },
                { clave: 'fecha_hora', etiqueta: 'Fecha y Hora', esFecha: true },
                {
                  clave: 'nombre',
                  etiqueta: 'Asesor / Nombre',
                  render: (val, fila) => (
                    <span className="font-medium text-slate-200">
                      {fila.asesor_nombre || val || (fila.extension ? `Ext. ${fila.extension}` : 'Línea PBX')}
                    </span>
                  ),
                },
                { clave: 'extension', etiqueta: 'Ext.', render: (val) => val || '-' },
                { clave: 'destino', etiqueta: 'Tel. Destino', render: (val) => val || 'N/D' },
                {
                  clave: 'duracion_segundos',
                  etiqueta: 'Duración',
                  render: (val) => `${val || 0}s (${Math.round((val || 0) / 60)}m)`,
                },
                {
                  clave: 'estado',
                  etiqueta: 'Estado',
                  render: (val) => (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        val?.toLowerCase() === 'answered'
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-rose-950 text-rose-300'
                      }`}
                    >
                      {val || 'Sin contestar'}
                    </span>
                  ),
                },
                {
                  clave: 'audio_url',
                  etiqueta: 'Audio / Grabación',
                  render: (val, fila) => {
                    const audio = val || fila.grabacion_url;
                    return audio ? (
                      <a
                        href={audio}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                      >
                        <Play className="h-3 w-3" /> Escuchar
                      </a>
                    ) : (
                      <span className="text-slate-600">-</span>
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
              subtitulo="Datos de ejecutivos en public.llamadas_celular"
              icono="celular"
              datos={rawCelular}
              catalogo={catalogo}
              leadsDisponibles={rawLeads}
              onGuardarLlamadaManual={handleGuardarLlamadaManual}
              columnas={[
                { clave: 'id', etiqueta: 'ID' },
                { clave: 'fecha', etiqueta: 'Fecha', esFecha: true },
                { clave: 'hora', etiqueta: 'Hora' },
                {
                  clave: 'usuario',
                  etiqueta: 'Usuario / Asesor',
                  render: (val, fila) => (
                    <span className="font-medium text-slate-200">
                      {fila.asesor_nombre || val || 'Ejecutivo Celular'}
                    </span>
                  ),
                },
                { clave: 'linea', etiqueta: 'Línea Celular', render: (val) => val || 'Móvil Corporativo' },
                { clave: 'destino', etiqueta: 'Número Destino', render: (val) => val || 'N/D' },
                {
                  clave: 'duracion',
                  etiqueta: 'Duración',
                  render: (val) => {
                    if (!val || val === '0' || val === '0s') {
                      return <span className="text-slate-500">0s (Sin respuesta)</span>;
                    }
                    return typeof val === 'string' && val.includes(':') ? val : `${val}s`;
                  },
                },
                { clave: 'operador', etiqueta: 'Operador', render: (val) => val || 'Claro' },
                {
                  clave: 'tipo',
                  etiqueta: 'Tipo',
                  render: (val) => (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-medium">
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
                  render: (val, fila) => fila.asesor_nombre || val || 'Asesor WhatsApp',
                },
                { clave: 'numero_cliente', etiqueta: 'Cel. Cliente', render: (val) => val || 'N/D' },
                {
                  clave: 'duracion_segundos',
                  etiqueta: 'Duración',
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
              subtitulo="Citas agendadas en public.leads con fecha y hora de reunión pactada, SLA y Retroalimentación"
              icono="leads"
              datos={rawLeads}
              columnas={[
                {
                  clave: 'codigo_prospecto',
                  etiqueta: 'Código',
                  render: (val) => (
                    <span className="font-mono font-bold text-amber-300">
                      {val || '-'}
                    </span>
                  ),
                },
                {
                  clave: 'nombre_prospecto',
                  etiqueta: 'Prospecto',
                  render: (val, fila) => (
                    <span className="font-semibold text-slate-100">
                      {val || (fila.codigo_prospecto ? `Prospecto ${fila.codigo_prospecto}` : 'Prospecto Sin Nombre')}
                    </span>
                  ),
                },
                {
                  clave: 'telefono',
                  etiqueta: 'Teléfono',
                  render: (val, fila) => (
                    <span className="font-mono text-slate-200">
                      {val || fila.celular || fila.movil || 'Sin teléfono'}
                    </span>
                  ),
                },
                {
                  clave: 'fecha_agendada',
                  etiqueta: 'Fecha Reunión (Agendada)',
                  esFecha: true,
                  render: (val) => {
                    const fecha = val && val !== 'null' ? String(val).slice(0, 10) : '';
                    return fecha ? (
                      <span className="font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                        {fecha}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic text-[11px]">
                        Sin reunión pactada
                      </span>
                    );
                  },
                },
                {
                  clave: 'hora_agendada',
                  etiqueta: 'Hora Reunión (Agendada)',
                  render: (val) => {
                    const hora = val && val !== 'null' ? String(val).slice(0, 8) : '';
                    return hora ? (
                      <span className="font-mono font-bold text-emerald-300 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/30">
                        {hora}
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">-</span>
                    );
                  },
                },
                {
                  clave: 'fecha_creado',
                  etiqueta: 'Fecha Creación',
                  esFecha: true,
                  render: (val, fila) => (
                    <span className="font-mono text-slate-300">
                      {val || (fila.created_at ? String(fila.created_at).slice(0, 10) : 'N/D')}
                    </span>
                  ),
                },
                {
                  clave: 'hora_creado',
                  etiqueta: 'Hora Creación',
                  render: (val, fila) => (
                    <span className="font-mono text-slate-300">
                      {val ? String(val).slice(0, 8) : (fila.created_at ? String(fila.created_at).slice(11, 19) : 'N/D')}
                    </span>
                  ),
                },
                {
                  clave: 'asesor_nombre',
                  etiqueta: 'Asesor Asignado',
                  render: (val, fila) => (
                    <span className="font-medium text-slate-200">
                      {val || fila.asesor_id || 'Asesor General'}
                    </span>
                  ),
                },
                {
                  clave: 'pais',
                  etiqueta: 'País',
                  render: (val) => (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      val === 'GT'
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/40'
                        : 'bg-indigo-950 text-indigo-300 border border-indigo-800/40'
                    }`}>
                      {val || 'SV'}
                    </span>
                  ),
                },
                {
                  clave: 'status',
                  etiqueta: 'Status',
                  render: (val) => (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/40">
                      {val || 'Agendado'}
                    </span>
                  ),
                },
                // KPI RETROALIMENTACION
                {
                  clave: 'kpi_retroalimentacion_etapa_1',
                  etiqueta: 'ETAPA 1',
                  grupo: 'KPI RETROALIMENTACION',
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
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                          : 'bg-rose-950 text-rose-300 border-rose-500/50'
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
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                          : 'bg-rose-950 text-rose-300 border-rose-500/50'
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
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                          : 'bg-rose-950 text-rose-300 border-rose-500/50'
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
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                          : 'bg-rose-950 text-rose-300 border-rose-500/50'
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
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                          : 'bg-rose-950 text-rose-300 border-rose-500/50'
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
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                          : 'bg-rose-950 text-rose-300 border-rose-500/50'
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
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                          : 'bg-rose-950 text-rose-300 border-rose-500/50'
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
              subtitulo="Prospectos directos recibidos en public.leads_no_calificados"
              icono="leads"
              datos={rawLeadsNoCalificados}
              columnas={[
                {
                  clave: 'client_id',
                  etiqueta: 'Client ID',
                  render: (val) => (
                    <span className="font-mono font-bold text-cyan-300">
                      {val || '-'}
                    </span>
                  ),
                },
                {
                  clave: 'client_name',
                  etiqueta: 'Cliente / Prospecto',
                  render: (val) => (
                    <span className="font-semibold text-slate-100">
                      {val || '-'}
                    </span>
                  ),
                },
                {
                  clave: 'telefono',
                  etiqueta: 'Teléfono',
                  render: (val) => (
                    <span className="font-mono text-slate-200">
                      {val || 'Sin teléfono'}
                    </span>
                  ),
                },
                {
                  clave: 'created_at_sv',
                  etiqueta: 'Fecha/Hora Ingreso',
                  render: (val, fila) => (
                    <span className="font-mono text-emerald-300 font-medium">
                      {val || (fila.fecha && fila.hora ? `${fila.fecha} ${fila.hora}` : 'N/D')}
                    </span>
                  ),
                },
                {
                  clave: 'fecha',
                  etiqueta: 'Fecha',
                  esFecha: true,
                  render: (val, fila) => (
                    <span className="font-mono text-slate-300">
                      {val || (fila.created_at ? String(fila.created_at).slice(0, 10) : 'N/D')}
                    </span>
                  ),
                },
                {
                  clave: 'hora',
                  etiqueta: 'Hora',
                  render: (val, fila) => (
                    <span className="font-mono text-slate-300">
                      {val || (fila.created_at ? String(fila.created_at).slice(11, 19) : 'N/D')}
                    </span>
                  ),
                },
                { clave: 'advisor_name', etiqueta: 'Asesor' },
                { clave: 'campaign_name', etiqueta: 'Campaña' },
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
                  render: (val, fila) => {
                    const p = val || fila.pais || 'SV';
                    return (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                          p === 'GT'
                            ? 'bg-sky-950 text-sky-300 border border-sky-800/60'
                            : 'bg-blue-950 text-blue-300 border border-blue-800/60'
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
                  render: (val) => <span className="font-bold text-white">{val || '-'}</span>,
                },
                {
                  clave: 'cliente',
                  etiqueta: 'Cliente / Prospecto',
                  render: (val, fila) =>
                    val || (fila.codigo_prospecto ? `Prospecto ${fila.codigo_prospecto}` : 'Cliente Virtual'),
                },
                {
                  clave: 'ejecutivo',
                  etiqueta: 'Ejecutivo Teams',
                  render: (val, fila) => (
                    <span className="font-medium text-purple-300">
                      {fila.ejecutivo_nombre || val || 'Ejecutivo Teams'}
                    </span>
                  ),
                },
                { clave: 'fecha_reunion', etiqueta: 'Fecha', esFecha: true },
                { clave: 'hora_reunion', etiqueta: 'Hora' },
                {
                  clave: 'estado_teams',
                  etiqueta: 'Estado de Reunión',
                  render: (val) => {
                    const st = val || 'Pendiente de realizar';
                    let estilo = 'bg-slate-800 text-slate-400 border-slate-700';
                    if (st.includes('evidencia') || (st.includes('hizo') && !st.includes('sin'))) {
                      estilo = 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60';
                    } else if (st.includes('sin evidencia')) {
                      estilo = 'bg-amber-950/80 text-amber-300 border-amber-800/60';
                    } else if (st.includes('No') || st.includes('Cancel')) {
                      estilo = 'bg-rose-950/80 text-rose-300 border-rose-800/60';
                    } else if (st.includes('Reprog')) {
                      estilo = 'bg-blue-950/80 text-blue-300 border-blue-800/60';
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
                  render: (val) =>
                    val ? (
                      <a
                        href={val}
                        target="_blank"
                        rel="noreferrer"
                        className="text-purple-400 hover:text-purple-300 underline inline-flex items-center gap-1 font-sans"
                      >
                        <ExternalLink className="h-3 w-3" /> Ver Evidencia
                      </a>
                    ) : (
                      <span className="text-slate-600 italic">Sin enlace</span>
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
              <MetricsOverview
                kpis={resumenKPIs}
                cruces={crucesAuditoria}
                parametros={parametros}
                onVerDetalleCruce={() => setVistaActiva('kpi_cumplimiento')}
                onCambiarTab={() => {}}
              />
              <VendorScorecard vendedores={metricasVendedores} />
            </div>
          )}

          {/* VISTA 9: KPI 1 - CUMPLIMIENTO LEADS (+/- 5 MIN) CON LISTA DE VENDEDORES & DIAGNÓSTICO */}
          {vistaActiva === 'kpi_cumplimiento' && (
            <VistaKpiCumplimiento
              cruces={crucesAuditoria}
              tipoLeadActual={modoLeads}
            />
          )}

          {/* VISTA 10: KPI 2 - SLA DE ETAPAS */}
          {vistaActiva === 'kpi_sla' && (
            <VistaKpiSla
              citas={citasActivas}
              onActualizarLeadKpi={handleActualizarLeadKpi}
              tipoLeadActual={modoLeads}
            />
          )}

          {/* VISTA 11: KPI 3 - RETROALIMENTACIÓN DE ETAPAS */}
          {vistaActiva === 'kpi_retroalimentacion' && (
            <VistaKpiRetroalimentacion
              citas={citasActivas}
              onActualizarLeadKpi={handleActualizarLeadKpi}
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
          cargarDatosDesdeBackend();
          mostrarToast('Datos de Supabase actualizados tras sincronización', 'exito');
        }}
      />
    </div>
  );
}
