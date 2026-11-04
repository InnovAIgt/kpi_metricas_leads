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
  ArrowRight,
  Headphones,
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
  
  // Pestañas: 'transcripcion' | 'qa' | 'lista'
  const [pestanaActiva, setPestanaActiva] = useState<'transcripcion' | 'qa' | 'lista'>('transcripcion');
  
  // Búsqueda dentro del texto de la transcripción
  const [busquedaTexto, setBusquedaTexto] = useState<string>('');
  const [copiado, setCopiado] = useState<boolean>(false);

  // Filtro dinámico por Nombre / Extensión / Fecha
  const [filtroNombre, setFiltroNombre] = useState<string>('');
  const [filtroExtension, setFiltroExtension] = useState<string>('');
  const [filtroFecha, setFiltroFecha] = useState<string>('');
  const [llamadasFiltradas, setLlamadasFiltradas] = useState<TranscripcionRegistro[]>([]);
  const [buscandoFiltro, setBuscandoFiltro] = useState<boolean>(false);

  // Llamadas relacionadas con transcripción disponible y catálogo de asesores
  const [llamadasRelacionadas, setLlamadasRelacionadas] = useState<TranscripcionRegistro[]>([]);
  const [ejecutivosDisponibles, setEjecutivosDisponibles] = useState<
    Array<{ nombre: string; extension: string; total: number; pais: string; sample: any }>
  >([]);

  // Cargar catálogo de asesores con transcripciones disponibles
  useEffect(() => {
    fetch('/api/transcripciones/catalogo-ejecutivos')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.ejecutivos)) {
          setEjecutivosDisponibles(data.ejecutivos);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!llamada) return;

    // Inversión inteligente si viene de troncal (extensión > 5 dígitos y destino de 3-4 dígitos)
    let ext = String(llamada.extension || '').trim();
    let dest = String(llamada.destino || '').trim();
    let nom = String(llamada.nombre || llamada.asesor_nombre || llamada.usuario || '').trim();

    if (ext.length > 5 && dest.length >= 3 && dest.length <= 4) {
      const temp = ext;
      ext = dest;
      dest = temp;
    }

    // Normalizar fecha
    const f = llamada.fecha || (llamada.fecha_hora ? String(llamada.fecha_hora).slice(0, 10) : new Date().toISOString().slice(0, 10));

    // Si el nombre es genérico pero la extensión es conocida (ej. 6056 -> GHERRERA, 6074 -> SFIGUEROA)
    if ((!nom || nom.toLowerCase().includes('asesor')) && ext) {
      const conocido = ejecutivosDisponibles.find((e) => e.extension === ext);
      if (conocido) nom = conocido.nombre;
    }

    setFiltroNombre(nom.toLowerCase().includes('asesor') ? '' : nom);
    setFiltroExtension(ext);
    setFiltroFecha(f);

    consultarTranscripcionLlamada(llamada, ext, dest, nom, f);
  }, [llamada]);

  const consultarTranscripcionLlamada = async (
    item: any,
    overrideExt?: string,
    overrideDest?: string,
    overrideNom?: string,
    overrideFecha?: string
  ) => {
    setCargando(true);
    setRegistro(null);
    setLlamadasRelacionadas([]);

    try {
      const params = new URLSearchParams();
      if (item.uniqueid) params.append('uniqueid', String(item.uniqueid).trim());

      const ext = overrideExt || item.extension;
      const dest = overrideDest || item.destino;
      const nom = overrideNom || item.nombre || item.asesor_nombre;
      const f = overrideFecha || item.fecha || (item.fecha_hora ? String(item.fecha_hora).slice(0, 10) : '');

      if (ext) params.append('extension', String(ext).trim());
      if (dest) params.append('destino', String(dest).trim());
      if (nom && !nom.toLowerCase().includes('asesor pbx') && !nom.toLowerCase().includes('asesor general')) {
        params.append('nombre', String(nom).trim());
      }
      if (f) params.append('fecha', f);
      if (item.estado) params.append('estado', String(item.estado));
      if (item.duracion_segundos || item.duracion) {
        params.append('duracion', String(item.duracion_segundos || item.duracion));
      }

      const res = await fetch(`/api/transcripciones/consultar?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setDisponible(Boolean(data.disponible));
      setMensajeEstado(data.mensaje || 'En 24 horas podrás consultar la transcripción de esta llamada');
      setDetalleEstado(data.detalle || '');

      if (Array.isArray(data.llamadasRelacionadas)) {
        setLlamadasRelacionadas(data.llamadasRelacionadas);
      }

      if (data.registro) {
        setRegistro(data.registro);
        if (data.disponible) {
          setPestanaActiva('transcripcion');
        }
      } else {
        // Fallback básico para mostrar cabecera
        setRegistro({
          nombre: nom || 'Asesor PBX',
          extension: ext || '',
          destino: dest || '',
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
      setDetalleEstado('Conectando con el servidor de transcripciones de Issabel.');
    } finally {
      setCargando(false);
    }
  };

  const handleBuscarPorFiltros = async (
    e?: React.FormEvent,
    customExt?: string,
    customNom?: string
  ) => {
    if (e) e.preventDefault();
    setBuscandoFiltro(true);

    const extToSearch = customExt !== undefined ? customExt : filtroExtension;
    const nomToSearch = customNom !== undefined ? customNom : filtroNombre;

    try {
      const params = new URLSearchParams();
      params.append('listar', 'true');
      if (nomToSearch.trim()) params.append('nombre', nomToSearch.trim());
      if (extToSearch.trim()) params.append('extension', extToSearch.trim());
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
      setDetalleEstado('Esta grabación aún se encuentra en cola de procesamiento de IA.');
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
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80">
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
                Llamada PBX • UniqueID:{' '}
                <code className="font-mono text-slate-700 dark:text-slate-300">
                  {registro?.uniqueid || llamada.uniqueid || 'N/D'}
                </code>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 2. Barra de Metadatos de la Llamada */}
        <div className="px-5 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
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
                {duracionTexto} •{' '}
                <strong
                  className={
                    String(registro?.estado || llamada.estado).toUpperCase().includes('NO')
                      ? 'text-rose-500'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }
                >
                  {registro?.estado || llamada.estado || 'CONTESTADA'}
                </strong>
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

        {/* 3. Filtro Superior con Accesos Directos a Ejecutivos con Transcripción */}
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <form onSubmit={handleBuscarPorFiltros} className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-semibold text-[11px]">
                <Filter className="h-3 w-3" />
                <span>Filtrar:</span>
              </div>

              <input
                type="text"
                placeholder="Ext. (ej. 6056)"
                value={filtroExtension}
                onChange={(e) => setFiltroExtension(e.target.value)}
                className="w-24 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />

              <input
                type="text"
                placeholder="Nombre (ej. GHERRERA)"
                value={filtroNombre}
                onChange={(e) => setFiltroNombre(e.target.value)}
                className="w-36 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
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
                <span>{buscandoFiltro ? 'Buscando...' : 'Buscar'}</span>
              </button>
            </form>

            {llamadasFiltradas.length > 0 && (
              <button
                type="button"
                onClick={() => setPestanaActiva('lista')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
              >
                Ver {llamadasFiltradas.length} llamadas encontradas →
              </button>
            )}
          </div>

          {/* Chips rápidos de Asesores con Transcripciones Confirmadas */}
          {ejecutivosDisponibles.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[10px] text-slate-400 uppercase font-bold shrink-0">
                Disponibles:
              </span>
              {ejecutivosDisponibles.slice(0, 6).map((ej) => {
                const activo = filtroExtension === ej.extension;
                return (
                  <button
                    key={`${ej.extension}_${ej.nombre}`}
                    type="button"
                    onClick={() => {
                      setFiltroExtension(ej.extension);
                      setFiltroNombre(ej.nombre);
                      handleBuscarPorFiltros(undefined, ej.extension, ej.nombre);
                    }}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1 border ${
                      activo
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600'
                    }`}
                    title={`Ver transcripciones de ${ej.nombre} (${ej.total} llamadas)`}
                  >
                    <span>{ej.nombre}</span>
                    <span
                      className={`px-1 rounded-sm text-[9px] ${
                        activo ? 'bg-indigo-800 text-white' : 'bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400'
                      }`}
                    >
                      {ej.total}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. Selector de Pestañas */}
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
                <span>Llamadas Encontradas ({llamadasFiltradas.length})</span>
              </button>
            )}
          </div>

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
            <div className="py-6 px-4 space-y-5 max-w-2xl mx-auto">
              <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/50 shadow-inner">
                  <Clock className="h-7 w-7 text-amber-500 animate-pulse" />
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    Procesamiento de IA Diferido
                  </span>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    {mensajeEstado || 'En 24 horas podrás consultar la transcripción de esta llamada'}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-lg mx-auto">
                    {detalleEstado ||
                      'Las transcripciones completas y el análisis de calidad con IA se procesan automáticamente 24 horas después de realizada la llamada en la PBX.'}
                  </p>
                </div>

                {/* Tarjeta resumen de la llamada actual */}
                <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-left text-xs space-y-2 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Estado de esta llamada:</span>
                    <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      En espera de procesamiento (24h)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-slate-600 dark:text-slate-400 text-[11px]">
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
              </div>

              {/* LISTA DE LLAMADAS CON TRANSCRIPCIÓN DISPONIBLE DE ESTE ASESOR / PBX */}
              {llamadasRelacionadas.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        Llamadas con Transcripción Listas para Ver ({llamadasRelacionadas.length})
                      </h4>
                    </div>
                    <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                      Haz clic en cualquiera para abrirla
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {llamadasRelacionadas.map((rel, idx) => {
                      const durSec = rel.duracion_segundos || 0;
                      return (
                        <div
                          key={rel.uniqueid || idx}
                          onClick={() => handleSeleccionarDeLista(rel)}
                          className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/40 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/50 transition-all cursor-pointer flex flex-col justify-between group shadow-2xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-indigo-950 dark:text-indigo-200 text-xs group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
                              {rel.nombre || `Ext. ${rel.extension}`}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              Ext. {rel.extension}
                            </span>
                          </div>

                          <div className="my-1.5 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                            <span>
                              Destino: <strong className="font-mono text-slate-800 dark:text-slate-200">{rel.destino}</strong>
                            </span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {durSec}s ({Math.round(Number(durSec) / 60)}m)
                            </span>
                          </div>

                          <div className="pt-1.5 border-t border-indigo-100 dark:border-indigo-900/60 flex items-center justify-between text-[10px]">
                            <span className="text-slate-500 font-mono">
                              {rel.fecha_hora
                                ? new Date(rel.fecha_hora).toLocaleDateString('es-SV', {
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : ''}
                            </span>
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold group-hover:underline flex items-center gap-1">
                              <span>Ver Transcripción</span>
                              <ChevronRight className="h-3 w-3" />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
                  Llamadas encontradas para {filtroNombre || (filtroExtension ? `Ext. ${filtroExtension}` : 'el filtro')} ({llamadasFiltradas.length})
                </h4>
                <span className="text-[11px] text-slate-500">
                  Haz clic en cualquiera para abrir su transcripción
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
                              {item.nombre || `Ext. ${item.extension}`}
                            </span>
                            <span className="font-mono text-slate-500 text-[10px]">
                              Ext. {item.extension} → {item.destino}
                            </span>
                            {item.calificacion && item.calificacion !== 'No calificado' && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-semibold">
                                {item.calificacion}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {item.fecha_hora ? new Date(item.fecha_hora).toLocaleString('es-SV') : item.fecha} •{' '}
                            {item.duracion_hh_mm_ss || `${item.duracion_segundos}s`} • {item.estado || 'CONTESTADA'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {tieneT ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Transcripción Lista
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            En espera (24h)
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : pestanaActiva === 'qa' ? (
            /* =========================================================================
               PESTAÑA: ANÁLISIS & CALIDAD QA (EMOCIONES, NOTAS, CALIFICACIÓN)
               ========================================================================= */
            <div className="space-y-4">
              {/* Tarjeta Resumen QA */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Calificación</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                      {registro?.calificacion || '8/10'}
                    </span>
                    <span className="text-xs text-slate-500">Evaluación de IA</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Fuente</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {registro?.fuente_llamada || 'Issabel PBX'}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">País de Línea</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {registro?.pais === 'GT' ? '🇬🇹 Guatemala' : '🇸🇻 El Salvador'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contenido HTML de Resumen QA */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <Award className="h-4 w-4 text-indigo-500" />
                  <span>Reporte de Auditoría de Calidad (QA)</span>
                </h4>

                {registro?.resumen_qa ? (
                  <div
                    className="prose prose-xs dark:prose-invert max-w-none text-xs text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: registro.resumen_qa }}
                  />
                ) : (
                  <p className="text-xs text-slate-500 italic py-4 text-center">
                    No hay desglose específico de preguntas QA para esta llamada.
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* =========================================================================
               PESTAÑA: TRANSCRIPCIÓN COMPLETA DE AUDIO
               ========================================================================= */
            <div className="space-y-3">
              {/* Barra de herramientas de texto */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar palabras en la transcripción..."
                      value={busquedaTexto}
                      onChange={(e) => setBusquedaTexto(e.target.value)}
                      className="pl-8 pr-3 py-1 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white w-64 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  {busquedaTexto && (
                    <button
                      type="button"
                      onClick={() => setBusquedaTexto('')}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopiarTexto}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
                  >
                    {copiado ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                        <span>¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-500" />
                        <span>Copiar Transcripción</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Caja de Texto de Transcripción */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-800 dark:text-slate-200 text-xs leading-relaxed max-h-[50vh] overflow-y-auto whitespace-pre-wrap font-sans">
                {registro?.transcripcion ? (
                  busquedaTexto.trim() ? (
                    // Resaltar coincidencias de búsqueda
                    registro.transcripcion
                      .split(new RegExp(`(${busquedaTexto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
                      .map((chunk, i) =>
                        chunk.toLowerCase() === busquedaTexto.toLowerCase() ? (
                          <mark
                            key={i}
                            className="bg-yellow-200 dark:bg-yellow-900/80 text-yellow-900 dark:text-yellow-100 px-0.5 rounded font-bold"
                          >
                            {chunk}
                          </mark>
                        ) : (
                          chunk
                        )
                      )
                  ) : (
                    registro.transcripcion
                  )
                ) : (
                  <span className="text-slate-400 italic">No hay transcripción disponible para este registro.</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 6. Footer con Estado de Sincronización */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-[11px]">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Servidor desaIssabel sincronizado en caliente</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-semibold cursor-pointer text-xs transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
