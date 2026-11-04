import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Sparkles,
  Clock,
  Search,
  Copy,
  Check,
  User,
  Phone,
  Calendar,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Filter,
  RefreshCw,
  Award,
  Smile,
  CheckCircle2,
  Volume2,
} from 'lucide-react';

export interface TranscripcionRegistro {
  nombre: string;
  extension: string;
  prefijo?: string;
  destino: string;
  duracion_minutos?: string;
  duracion_segundos?: string | number;
  duracion_hh_mm_ss?: string;
  estado?: string;
  fecha_hora?: string;
  fecha?: string;
  año?: number;
  mes?: number;
  dia?: number;
  uniqueid?: string;
  transcripcion?: string | null;
  pais?: string;
  fuente_llamada?: string;
  calificacion?: string;
  resumen_qa?: string | null;
}

interface ModalTranscripcionLlamadaProps {
  llamada: any | null;
  onClose: () => void;
  onEscucharAudio?: (llamada: any) => void;
}

export const ModalTranscripcionLlamada: React.FC<ModalTranscripcionLlamadaProps> = ({
  llamada,
  onClose,
  onEscucharAudio,
}) => {
  const [cargando, setCargando] = useState<boolean>(true);
  const [disponible, setDisponible] = useState<boolean>(false);
  const [registro, setRegistro] = useState<TranscripcionRegistro | null>(null);
  const [mensajeEstado, setMensajeEstado] = useState<string>('');
  const [detalleEstado, setDetalleEstado] = useState<string>('');
  
  // Pestañas
  const [pestanaActiva, setPestanaActiva] = useState<'transcripcion' | 'qa' | 'lista'>('transcripcion');
  
  // Búsqueda dentro del texto
  const [busquedaTexto, setBusquedaTexto] = useState<string>('');
  const [copiado, setCopiado] = useState<boolean>(false);

  // Filtro dinámico por Nombre / Extensión
  const [filtroNombre, setFiltroNombre] = useState<string>('');
  const [filtroExtension, setFiltroExtension] = useState<string>('');
  const [filtroFecha, setFiltroFecha] = useState<string>('');
  const [llamadasFiltradas, setLlamadasFiltradas] = useState<TranscripcionRegistro[]>([]);
  const [buscandoFiltro, setBuscandoFiltro] = useState<boolean>(false);

  useEffect(() => {
    if (!llamada) return;

    // Inicializar filtros con los datos de la llamada actual
    const nom = llamada.nombre || llamada.asesor_nombre || llamada.usuario || '';
    const ext = llamada.extension || '';
    const f = llamada.fecha || (llamada.fecha_hora ? String(llamada.fecha_hora).slice(0, 10) : new Date().toISOString().slice(0, 10));

    setFiltroNombre(nom);
    setFiltroExtension(ext);
    setFiltroFecha(f);

    consultarTranscripcionLlamada(llamada);
  }, [llamada]);

  const consultarTranscripcionLlamada = async (item: any) => {
    setCargando(true);
    setRegistro(null);
    try {
      const params = new URLSearchParams();
      if (item.uniqueid) params.append('uniqueid', String(item.uniqueid).trim());
      if (item.extension) params.append('extension', String(item.extension).trim());
      if (item.nombre || item.asesor_nombre) params.append('nombre', String(item.nombre || item.asesor_nombre).trim());
      if (item.destino) params.append('destino', String(item.destino).trim());
      
      const f = item.fecha || (item.fecha_hora ? String(item.fecha_hora).slice(0, 10) : '');
      if (f) params.append('fecha', f);

      const res = await fetch(`/api/transcripciones/consultar?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setDisponible(Boolean(data.disponible));
      setMensajeEstado(data.mensaje || 'En 24 horas podrás consultar la transcripción de esta llamada');
      setDetalleEstado(data.detalle || '');

      if (data.registro) {
        setRegistro(data.registro);
      } else {
        // Fallback básico para mostrar cabecera
        setRegistro({
          nombre: item.nombre || item.asesor_nombre || 'Asesor PBX',
          extension: item.extension || '',
          destino: item.destino || '',
          duracion_segundos: item.duracion_segundos || item.duracion || 0,
          duracion_hh_mm_ss: item.duracion_hh_mm_ss || '',
          fecha_hora: item.fecha_hora || item.fecha || '',
          uniqueid: item.uniqueid || '',
          pais: item.pais || 'GT',
          transcripcion: null,
          resumen_qa: null,
        });
      }
    } catch (err: any) {
      setDisponible(false);
      setMensajeEstado('En 24 horas podrás consultar la transcripción de esta llamada');
      setDetalleEstado('No se pudo contactar el servidor de transcripciones de Issabel.');
    } finally {
      setCargando(false);
    }
  };

  const handleBuscarPorFiltros = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBuscandoFiltro(true);
    try {
      const params = new URLSearchParams();
      params.append('listar', 'true');
      if (filtroNombre.trim()) params.append('nombre', filtroNombre.trim());
      if (filtroExtension.trim()) params.append('extension', filtroExtension.trim());
      if (filtroFecha) params.append('fecha', filtroFecha);

      const res = await fetch(`/api/transcripciones/consultar?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        setLlamadasFiltradas(items);
        if (items.length > 0) {
          setPestanaActiva('lista');
        }
      }
    } finally {
      setBuscandoFiltro(false);
    }
  };

  const handleSeleccionarDeLista = (item: TranscripcionRegistro) => {
    setRegistro(item);
    const tieneTrans = Boolean(item.transcripcion && item.transcripcion.trim().length > 5);
    setDisponible(tieneTrans);
    if (tieneTrans) {
      setPestanaActiva('transcripcion');
    } else {
      setMensajeEstado('En 24 horas podrás consultar la transcripción de esta llamada');
      setDetalleEstado('Esta grabación aún se encuentra en cola de transcripción de IA.');
    }
  };

  const handleCopiarTexto = () => {
    if (!registro?.transcripcion) return;
    navigator.clipboard.writeText(registro.transcripcion);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  if (!llamada) return null;

  const duracionTexto =
    registro?.duracion_hh_mm_ss ||
    (registro?.duracion_segundos
      ? `${registro.duracion_segundos}s (${Math.round(Number(registro.duracion_segundos) / 60)}m)`
      : llamada.duracion_segundos
      ? `${llamada.duracion_segundos}s`
      : '0s');

  const fechaFormateada = registro?.fecha_hora
    ? new Date(registro.fecha_hora).toLocaleString('es-SV', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : llamada.fecha_hora
    ? new Date(llamada.fecha_hora).toLocaleString('es-SV', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'N/D';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* 1. Header Principal */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 dark:bg-indigo-950/60 dark:border-indigo-700/60 dark:text-indigo-400 shrink-0 shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  Transcripción & Resumen de Calidad (IA)
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                  desaIssabel API
                </span>
                {registro?.pais && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60">
                    {registro.pais === 'GT' ? '🇬🇹 Guatemala' : '🇸🇻 El Salvador'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Llamada PBX • UniqueID: <code className="font-mono text-slate-700 dark:text-slate-300">{registro?.uniqueid || llamada.uniqueid || 'N/D'}</code>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 2. Barra de Metadatos de la Llamada */}
        <div className="px-5 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Asesor</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                {registro?.nombre || llamada.nombre || llamada.asesor_nombre || 'Asesor PBX'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Ext. / Destino</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">
                {registro?.extension || llamada.extension ? `Ext. ${registro?.extension || llamada.extension} → ` : ''}
                {registro?.destino || llamada.destino || 'Sin destino'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Duración & Estado</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {duracionTexto} • <strong className="text-emerald-600 dark:text-emerald-400">{registro?.estado || llamada.estado || 'CONTESTADA'}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Fecha de Llamada</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {fechaFormateada}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Filtro Superior: Filtrar por Nombre o Extensión */}
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <form onSubmit={handleBuscarPorFiltros} className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-semibold text-[11px]">
              <Filter className="h-3 w-3" />
              <span>Filtrar por:</span>
            </div>

            <input
              type="text"
              placeholder="Extensión (ej. 6056)"
              value={filtroExtension}
              onChange={(e) => setFiltroExtension(e.target.value)}
              className="w-28 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />

            <input
              type="text"
              placeholder="Nombre asesor (ej. GHERRERA)"
              value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              className="w-40 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />

            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
            />

            <button
              type="submit"
              disabled={buscandoFiltro}
              className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50 shadow-xs"
            >
              <Search className="h-3 w-3" />
              <span>{buscandoFiltro ? 'Buscando...' : 'Buscar llamadas'}</span>
            </button>
          </form>

          {llamadasFiltradas.length > 0 && (
            <button
              type="button"
              onClick={() => setPestanaActiva('lista')}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
            >
              Ver {llamadasFiltradas.length} llamadas encontradas
            </button>
          )}
        </div>

        {/* 4. Selector de Pestañas (si está disponible) */}
        <div className="flex items-center justify-between px-5 pt-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setPestanaActiva('transcripcion')}
              className={`pb-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                pestanaActiva === 'transcripcion'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Transcripción de Audio</span>
            </button>

            <button
              type="button"
              onClick={() => setPestanaActiva('qa')}
              className={`pb-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                pestanaActiva === 'qa'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Award className="h-3.5 w-3.5" />
              <span>Análisis & Calidad QA</span>
              {registro?.calificacion && registro.calificacion !== 'No calificado' && (
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {registro.calificacion}
                </span>
              )}
            </button>

            {llamadasFiltradas.length > 0 && (
              <button
                type="button"
                onClick={() => setPestanaActiva('lista')}
                className={`pb-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  pestanaActiva === 'lista'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                <span>Otras Llamadas ({llamadasFiltradas.length})</span>
              </button>
            )}
          </div>

          {/* Botón rápido para escuchar audio si está disponible */}
          {onEscucharAudio && (
            <button
              type="button"
              onClick={() => onEscucharAudio(llamada)}
              className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer pb-2.5"
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span>Reproducir Audio</span>
            </button>
          )}
        </div>

        {/* 5. Contenido del Modal */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {cargando ? (
            /* Estado de Carga */
            <div className="py-16 text-center space-y-3">
              <div className="inline-block p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-700/60">
                <RefreshCw className="h-7 w-7 text-indigo-500 animate-spin" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Consultando servidor de transcripciones de IA...
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Conectando con <code className="font-mono text-indigo-600 dark:text-indigo-300">desaIssabel/getResumenLlamada</code> para recuperar el texto y análisis del audio.
              </p>
            </div>
          ) : !disponible ? (
            /* =========================================================================
               ESTADO NO DISPONIBLE (REGLA DE 24 HORAS SOLICITADA POR EL USUARIO)
               ========================================================================= */
            <div className="py-10 px-4 text-center space-y-4 max-w-xl mx-auto">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/50 shadow-inner">
                <Clock className="h-8 w-8 text-amber-500 animate-pulse" />
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Procesamiento de IA Diferido
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {mensajeEstado || 'En 24 horas podrás consultar la transcripción de esta llamada'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Las transcripciones completas y el análisis de calidad con IA se procesan automáticamente{' '}
                  <strong>24 horas después</strong> de realizada la llamada en la PBX para consolidar el modelo de lenguaje y las métricas de calidad.
                </p>
              </div>

              {/* Tarjeta resumen de la llamada en espera */}
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-left text-xs space-y-2 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Estado de la llamada:</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    En espera de transcripción (24h)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400 text-[11px]">
                  <div>
                    <strong>Ejecutivo:</strong> {registro?.nombre || llamada.nombre || 'Asesor PBX'}
                  </div>
                  <div>
                    <strong>Extensión:</strong> {registro?.extension || llamada.extension || '-'}
                  </div>
                  <div>
                    <strong>Destino:</strong> {registro?.destino || llamada.destino || '-'}
                  </div>
                  <div>
                    <strong>Duración:</strong> {duracionTexto}
                  </div>
                  <div>
                    <strong>Fecha:</strong> {fechaFormateada}
                  </div>
                  <div>
                    <strong>Unique ID:</strong> {registro?.uniqueid || llamada.uniqueid || '-'}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => consultarTranscripcionLlamada(llamada)}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Reintentar Consulta</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-medium text-xs cursor-pointer transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : pestanaActiva === 'lista' ? (
            /* =========================================================================
               PESTAÑA: OTRAS LLAMADAS ENCONTRADAS POR FILTRO (NOMBRE / EXTENSIÓN)
               ========================================================================= */
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Llamadas encontradas para {filtroNombre || filtroExtension || 'el filtro seleccionado'} ({llamadasFiltradas.length})
                </h4>
                <span className="text-[11px] text-slate-500">
                  Haz clic en cualquiera para cargar su transcripción
                </span>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                {llamadasFiltradas.map((item, idx) => {
                  const tieneT = Boolean(item.transcripcion && item.transcripcion.trim().length > 5);
                  return (
                    <div
                      key={item.uniqueid || idx}
                      onClick={() => handleSeleccionarDeLista(item)}
                      className="p-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer flex items-center justify-between gap-3 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-2 rounded-lg shrink-0 ${
                            tieneT
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                              : 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400'
                          }`}
                        >
                          {tieneT ? <FileText className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white truncate">
                              {item.nombre} (Ext. {item.extension})
                            </span>
                            <span className="text-slate-400 font-mono text-[11px]">→ {item.destino}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {item.fecha_hora ? new Date(item.fecha_hora).toLocaleString('es-SV') : 'N/D'} • {item.duracion_segundos}s • {item.estado}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            tieneT
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-50 text-amber-700 border border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {tieneT ? 'Transcripción Lista' : 'En proceso (24h)'}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : pestanaActiva === 'qa' ? (
            /* =========================================================================
               PESTAÑA: RESUMEN Y ANÁLISIS QA DE CALIDAD DE LA LLAMADA
               ========================================================================= */
            <div className="space-y-4">
              {registro?.resumen_qa ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <h4 className="text-sm font-bold text-indigo-950 dark:text-indigo-200">
                          Evaluación de Calidad y Retroalimentación del Ejecutivo
                        </h4>
                      </div>
                      {registro.calificacion && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-600 text-white shadow-xs">
                          {registro.calificacion}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-indigo-900/80 dark:text-indigo-300">
                      Evaluación generada mediante el modelo de análisis semántico sobre la conversación completa.
                    </p>
                  </div>

                  {/* Tarjetas Parseadas de QA */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    <div
                      className="prose prose-xs dark:prose-invert max-w-none space-y-3 [&_b]:text-slate-900 dark:[&_b]:text-white [&_b]:text-xs [&_b]:font-bold [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1.5"
                      dangerouslySetInnerHTML={{ __html: registro.resumen_qa }}
                    />
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500 space-y-2">
                  <AlertCircle className="h-8 w-8 mx-auto text-slate-400" />
                  <p className="text-xs">Esta llamada no contiene resumen de QA estructurado.</p>
                </div>
              )}
            </div>
          ) : (
            /* =========================================================================
               PESTAÑA: TRANSCRIPCIÓN COMPLETA
               ========================================================================= */
            <div className="space-y-3">
              {/* Barra de herramientas de texto */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                {/* Buscador dentro del texto */}
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar palabra en la transcripción..."
                    value={busquedaTexto}
                    onChange={(e) => setBusquedaTexto(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-xs"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {registro?.transcripcion ? `${registro.transcripcion.split(/\s+/).length} palabras` : '0 palabras'}
                  </span>

                  <button
                    type="button"
                    onClick={handleCopiarTexto}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-medium text-xs cursor-pointer shadow-xs transition-colors"
                  >
                    {copiado ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-500" />
                        <span>Copiar Texto</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Contenedor del texto de la transcripción */}
              <div className="bg-slate-50/70 dark:bg-slate-950/70 p-5 rounded-xl border border-slate-200 dark:border-slate-800 max-h-[500px] overflow-y-auto leading-relaxed text-sm text-slate-800 dark:text-slate-200 shadow-inner">
                {registro?.transcripcion ? (
                  <div className="space-y-3 font-sans whitespace-pre-wrap">
                    {busquedaTexto.trim() ? (
                      // Resaltar términos de búsqueda
                      registro.transcripcion
                        .split(new RegExp(`(${busquedaTexto.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'))
                        .map((part, i) =>
                          part.toLowerCase() === busquedaTexto.toLowerCase() ? (
                            <mark key={i} className="bg-amber-200 dark:bg-amber-900 text-slate-900 dark:text-amber-100 px-0.5 rounded font-bold">
                              {part}
                            </mark>
                          ) : (
                            part
                          )
                        )
                    ) : (
                      registro.transcripcion
                    )}
                  </div>
                ) : (
                  <p className="text-center text-slate-400 py-8 text-xs">
                    No hay texto de transcripción disponible.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 6. Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Servidor desaIssabel sincronizado en caliente</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium cursor-pointer transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
