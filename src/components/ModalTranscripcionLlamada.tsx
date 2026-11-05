import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Download,
  Headphones,
  Sliders,
  Radio,
} from 'lucide-react';
import { cargarAudioRealPbx } from '../services/audioPbxService';

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
  audio_url?: string;
  grabacion_url?: string;
}

interface ModalTranscripcionLlamadaProps {
  llamada: any | null;
  onClose: () => void;
  onEscucharAudio?: (llamada: any) => void;
}

export const ModalTranscripcionLlamada: React.FC<ModalTranscripcionLlamadaProps> = ({
  llamada,
  onClose,
}) => {
  // ==========================================
  // ESTADO DE TRANSCRIPCIÓN Y QA
  // ==========================================
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

  // Filtros dinámicos
  const [filtroNombre, setFiltroNombre] = useState<string>('');
  const [filtroExtension, setFiltroExtension] = useState<string>('');
  const [filtroFecha, setFiltroFecha] = useState<string>('');
  const [llamadasFiltradas, setLlamadasFiltradas] = useState<TranscripcionRegistro[]>([]);
  const [buscandoFiltro, setBuscandoFiltro] = useState<boolean>(false);

  // Llamadas relacionadas y catálogo de asesores
  const [llamadasRelacionadas, setLlamadasRelacionadas] = useState<TranscripcionRegistro[]>([]);
  const [ejecutivosDisponibles, setEjecutivosDisponibles] = useState<
    Array<{ nombre: string; extension: string; total: number; pais: string; sample: any }>
  >([]);

  // ==========================================
  // REPRODUCTOR INTEGRADO DE AUDIO (EN LA MISMA VENTANA)
  // ==========================================
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [cargandoAudio, setCargandoAudio] = useState<boolean>(false);
  const [reproduciendo, setReproduciendo] = useState<boolean>(false);
  const [tiempoActual, setTiempoActual] = useState<number>(0);
  const [duracionTotal, setDuracionTotal] = useState<number>(0);
  const [volumen, setVolumen] = useState<number>(1);
  const [muteado, setMuteado] = useState<boolean>(false);
  const [velocidad, setVelocidad] = useState<number>(1);
  const [errorAudio, setErrorAudio] = useState<string | null>(null);
  const [blobAudioUrl, setBlobAudioUrl] = useState<string | null>(null);
  const [directAudioUrl, setDirectAudioUrl] = useState<string>('');

  // Formato mm:ss
  const formatTiempo = (segundos: number): string => {
    if (isNaN(segundos) || segundos < 0) return '00:00';
    const mins = Math.floor(segundos / 60);
    const secs = Math.floor(segundos % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Cargar audio real de la llamada seleccionada
  const cargarAudioDeLlamada = useCallback(async (item: any) => {
    setCargandoAudio(true);
    setErrorAudio(null);
    setReproduciendo(false);
    setTiempoActual(0);
    setDuracionTotal(Number(item.duracion_segundos || item.duracion || 0));

    try {
      const res = await cargarAudioRealPbx(item);
      setDirectAudioUrl(res.directUrl || '');

      if (res.blobUrl) {
        setBlobAudioUrl((prev) => {
          if (prev && prev.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(prev);
            } catch (_) {}
          }
          return res.blobUrl;
        });
        setErrorAudio(null);
        setCargandoAudio(false);
      } else {
        setBlobAudioUrl(null);
        setCargandoAudio(false);
        setErrorAudio(
          res.error ||
            'No hay grabación de audio disponible para esta llamada en la PBX.'
        );
      }
    } catch (err: any) {
      setBlobAudioUrl(null);
      setCargandoAudio(false);
      setErrorAudio(
        err?.message ||
          'No se pudo conectar con el servidor PBX para obtener el audio.'
      );
    }
  }, []);

  // Cargar catálogo de ejecutivos disponibles
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

  // Inicializar llamada actual (audio + transcripción)
  useEffect(() => {
    if (!llamada) return;

    let ext = String(llamada.extension || '').trim();
    let dest = String(llamada.destino || '').trim();
    let nom = String(llamada.nombre || llamada.asesor_nombre || llamada.usuario || '').trim();

    if (ext.length > 5 && dest.length >= 3 && dest.length <= 4) {
      const temp = ext;
      ext = dest;
      dest = temp;
    }

    const f = llamada.fecha || (llamada.fecha_hora ? String(llamada.fecha_hora).slice(0, 10) : new Date().toISOString().slice(0, 10));

    if ((!nom || nom.toLowerCase().includes('asesor')) && ext) {
      const conocido = ejecutivosDisponibles.find((e) => e.extension === ext);
      if (conocido) nom = conocido.nombre;
    }

    setFiltroNombre(nom.toLowerCase().includes('asesor') ? '' : nom);
    setFiltroExtension(ext);
    setFiltroFecha(f);

    consultarTranscripcionLlamada(llamada, ext, dest, nom, f);
    cargarAudioDeLlamada({ ...llamada, extension: ext, destino: dest, nombre: nom });
  }, [llamada, cargarAudioDeLlamada]);

  // Limpieza de blob de audio al desmontar
  useEffect(() => {
    return () => {
      if (blobAudioUrl && blobAudioUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(blobAudioUrl);
        } catch (_) {}
      }
    };
  }, [blobAudioUrl]);

  // Controles del audio HTML5
  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (reproduciendo) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => {
        console.error('Error al reproducir audio:', err);
      });
    }
  };

  const saltarTiempo = (deltaSegundos: number) => {
    if (!audioRef.current) return;
    const nuevo = Math.max(0, Math.min(audioRef.current.currentTime + deltaSegundos, duracionTotal));
    audioRef.current.currentTime = nuevo;
    setTiempoActual(nuevo);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setTiempoActual(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const cambiarVelocidad = (nuevaVelocidad: number) => {
    setVelocidad(nuevaVelocidad);
    if (audioRef.current) {
      audioRef.current.playbackRate = nuevaVelocidad;
    }
  };

  const toggleMute = () => {
    const nuevoMute = !muteado;
    setMuteado(nuevoMute);
    if (audioRef.current) {
      audioRef.current.muted = nuevoMute;
    }
  };

  const cambiarVolumen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolumen(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      audioRef.current.muted = val === 0;
      setMuteado(val === 0);
    }
  };

  // Consulta API de transcripción
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

      if (data.disponible && data.registro) {
        setRegistro(data.registro);
        setPestanaActiva('transcripcion');
      } else {
        setRegistro({
          nombre: nom || 'Asesor PBX',
          extension: ext || '',
          destino: dest || '',
          duracion_segundos: item.duracion_segundos || item.duracion || 0,
          duracion_hh_mm_ss: item.duracion_hh_mm_ss || '',
          fecha_hora: item.fecha_hora || item.fecha || '',
          uniqueid: item.uniqueid || '',
          pais: item.pais || 'SV',
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
    // Cargar también el audio de esta llamada seleccionada
    cargarAudioDeLlamada(item);
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
    <div className="fixed inset-0 z-50 bg-black/70 dark:bg-black/85 flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* ELEMENTO AUDIO OCULTO DE HTML5 */}
        {blobAudioUrl && (
          <audio
            ref={audioRef}
            src={blobAudioUrl}
            onTimeUpdate={() => {
              if (audioRef.current) {
                setTiempoActual(audioRef.current.currentTime);
              }
            }}
            onLoadedMetadata={() => {
              if (audioRef.current && audioRef.current.duration) {
                setDuracionTotal(audioRef.current.duration);
              }
            }}
            onPlay={() => setReproduciendo(true)}
            onPause={() => setReproduciendo(false)}
            onEnded={() => {
              setReproduciendo(false);
              setTiempoActual(0);
            }}
            onError={(e) => {
              console.error('Error al reproducir audio blob:', e);
              setErrorAudio('Error al reproducir el formato de audio de la PBX.');
              setReproduciendo(false);
            }}
          />
        )}

        {/* 1. HEADER PRINCIPAL */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shrink-0 shadow-md shadow-indigo-600/30">
              <Headphones className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  Consulta de Llamada (Audio & Transcripción IA)
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
            title="Cerrar ventana"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 2. BARRA DE METADATOS RÁPIDOS */}
        <div className="px-5 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
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

        {/* =========================================================================
            3. REPRODUCTOR DE AUDIO INTEGRADO EN LA MISMA VENTANA (ESCUCHAR + LEER)
            ========================================================================= */}
        <div className="px-5 py-3 bg-gradient-to-r from-indigo-950/70 via-slate-900 to-indigo-950/70 border-b border-indigo-900/50 text-white space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            
            {/* Controles de Reproducción Izquierda */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => saltarTiempo(-5)}
                disabled={!blobAudioUrl}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 cursor-pointer transition-colors"
                title="Retroceder 5 segundos"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={togglePlayAudio}
                disabled={cargandoAudio || !blobAudioUrl}
                className={`h-10 w-10 rounded-full flex items-center justify-center font-bold transition-all shadow-md cursor-pointer ${
                  cargandoAudio
                    ? 'bg-slate-700 text-slate-400 cursor-wait'
                    : reproduciendo
                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-emerald-500/40 ring-2 ring-emerald-300'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-600/40 hover:scale-105'
                }`}
                title={reproduciendo ? 'Pausar audio' : 'Reproducir audio de la llamada'}
              >
                {cargandoAudio ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : reproduciendo ? (
                  <Pause className="h-5 w-5 fill-slate-950" />
                ) : (
                  <Play className="h-5 w-5 fill-white ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => saltarTiempo(5)}
                disabled={!blobAudioUrl}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 cursor-pointer transition-colors"
                title="Adelantar 5 segundos"
              >
                <RotateCw className="h-4 w-4" />
              </button>

              {/* Indicador de estado y animación de onda de audio */}
              <div className="ml-2 flex items-center gap-2">
                {reproduciendo ? (
                  <div className="flex items-center gap-0.5 h-4">
                    <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-3" />
                    <span className="w-1 bg-emerald-400 rounded-full animate-bounce [animation-delay:150ms] h-4" />
                    <span className="w-1 bg-emerald-400 rounded-full animate-bounce [animation-delay:300ms] h-2" />
                    <span className="w-1 bg-emerald-400 rounded-full animate-bounce [animation-delay:450ms] h-4" />
                  </div>
                ) : (
                  <Radio className="h-4 w-4 text-slate-400" />
                )}
                <span className="text-xs font-semibold text-slate-200">
                  {cargandoAudio
                    ? 'Cargando grabación PBX...'
                    : reproduciendo
                    ? 'Escuchando llamada en vivo'
                    : blobAudioUrl
                    ? 'Grabación lista para escuchar'
                    : 'Sin grabación de voz'}
                </span>
              </div>
            </div>

            {/* Controles de Velocidad, Volumen y Descarga Derecha */}
            <div className="flex items-center gap-3">
              {/* Selector de Velocidad */}
              <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60 text-[10px] font-bold">
                {[0.75, 1, 1.25, 1.5, 2].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => cambiarVelocidad(v)}
                    className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                      velocidad === v
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {v}x
                  </button>
                ))}
              </div>

              {/* Volumen y Silencio */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="text-slate-400 hover:text-white cursor-pointer"
                  title={muteado ? 'Activar sonido' : 'Silenciar'}
                >
                  {muteado || volumen === 0 ? (
                    <VolumeX className="h-4 w-4 text-rose-400" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={muteado ? 0 : volumen}
                  onChange={cambiarVolumen}
                  className="w-16 h-1 accent-indigo-500 bg-slate-700 rounded-lg cursor-pointer"
                  title={`Volumen: ${Math.round(volumen * 100)}%`}
                />
              </div>

              {/* Descargar archivo WAV directo si existe */}
              {blobAudioUrl && (
                <a
                  href={blobAudioUrl}
                  download={`Grabacion_${registro?.extension || llamada.extension}_${registro?.uniqueid || llamada.uniqueid}.wav`}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                  title="Descargar archivo WAV de audio"
                >
                  <Download className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {/* Línea de tiempo / Scrubber Slider */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-indigo-300 font-bold shrink-0">
                {formatTiempo(tiempoActual)}
              </span>

              <input
                type="range"
                min="0"
                max={duracionTotal || 1}
                step="0.5"
                value={tiempoActual}
                onChange={handleSeek}
                disabled={!blobAudioUrl}
                className="flex-1 h-2 bg-slate-700/80 rounded-lg accent-emerald-400 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              />

              <span className="font-mono text-xs text-slate-400 shrink-0">
                {formatTiempo(duracionTotal)}
              </span>
            </div>

            {errorAudio && (
              <p className="text-[11px] text-amber-300/90 flex items-center gap-1 pt-0.5">
                <AlertCircle className="h-3 w-3 shrink-0" />
                <span>{errorAudio}</span>
              </p>
            )}
          </div>
        </div>

        {/* 4. FILTROS RÁPIDOS Y SELECTOR DE ASESORES */}
        <div className="px-5 py-2 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
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
                className="w-24 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />

              <input
                type="text"
                placeholder="Nombre (ej. AACOSTA)"
                value={filtroNombre}
                onChange={(e) => setFiltroNombre(e.target.value)}
                className="w-36 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />

              <input
                type="date"
                value={filtroFecha}
                onChange={(e) => setFiltroFecha(e.target.value)}
                className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />

              <button
                type="submit"
                disabled={buscandoFiltro}
                className="px-2.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50 shadow-xs"
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

          {/* Chips rápidos de Asesores */}
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

        {/* 5. SELECTOR DE PESTAÑAS */}
        <div className="flex items-center justify-between px-5 pt-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
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
              <span>Transcripción de Audio (Texto)</span>
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
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
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
        </div>

        {/* 6. CONTENIDO INFERIOR: TEXTO O QA MIENTRAS EL AUDIO SUENA */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {cargando ? (
            <div className="py-12 text-center space-y-3">
              <div className="inline-block p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-700/60">
                <RefreshCw className="h-7 w-7 text-indigo-500 animate-spin" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Consultando transcripción y resumen de calidad...
              </h4>
            </div>
          ) : !disponible ? (
            /* AVISO DE 24 HORAS CON TARJETAS RELACIONADAS */
            <div className="py-4 px-4 space-y-4 max-w-2xl mx-auto">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/50 shadow-inner">
                  <Clock className="h-6 w-6 text-amber-500 animate-pulse" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {mensajeEstado || 'En 24 horas podrás consultar la transcripción de esta llamada'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-lg mx-auto">
                  {detalleEstado ||
                    'Las transcripciones completas se procesan 24 horas después de realizada la llamada en la PBX.'}
                </p>
              </div>

              {/* LISTA DE LLAMADAS RELACIONADAS CON AUDIO Y TRANSCRIPCIÓN DISPONIBLE */}
              {llamadasRelacionadas.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-indigo-500" />
                      <span>Otras llamadas con audio y transcripción listos ({llamadasRelacionadas.length}):</span>
                    </span>
                    <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                      Haz clic para reproducir y leer
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {llamadasRelacionadas.map((rel, idx) => (
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
                        <div className="my-1 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                          <span>Destino: <strong>{rel.destino}</strong></span>
                          <span>{rel.duracion_segundos}s</span>
                        </div>
                        <div className="pt-1 border-t border-indigo-100 dark:border-indigo-900/60 flex items-center justify-between text-[10px]">
                          <span className="text-slate-500 font-mono">
                            {rel.fecha_hora ? new Date(rel.fecha_hora).toLocaleDateString('es-SV') : ''}
                          </span>
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold group-hover:underline flex items-center gap-1">
                            <span>Consultar Llamada</span>
                            <ChevronRight className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : pestanaActiva === 'lista' ? (
            /* PESTAÑA: LISTA DE LLAMADAS FILTRADAS */
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Llamadas encontradas ({llamadasFiltradas.length})
                </h4>
                <span className="text-[11px] text-slate-500">
                  Selecciona una llamada para cargar su audio y transcripción simultáneamente
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
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {item.fecha_hora ? new Date(item.fecha_hora).toLocaleString('es-SV') : item.fecha} •{' '}
                            {item.duracion_hh_mm_ss || `${item.duracion_segundos}s`} • {item.estado || 'CONTESTADA'}
                          </p>
                        </div>
                      </div>

                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white flex items-center gap-1">
                        <Headphones className="h-3 w-3" />
                        <span>Consultar</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : pestanaActiva === 'qa' ? (
            /* PESTAÑA: ANÁLISIS QA */
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Calificación</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                      {registro?.calificacion || '9/10'}
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
            /* PESTAÑA: TRANSCRIPCIÓN COMPLETA (LECTURA MIENTRAS SE ESCUCHA) */
            <div className="space-y-3">
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
                      className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

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

              {/* Caja de Texto de Transcripción */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-800 dark:text-slate-200 text-xs leading-relaxed max-h-[46vh] overflow-y-auto whitespace-pre-wrap font-sans select-text">
                {registro?.transcripcion ? (
                  busquedaTexto.trim() ? (
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

        {/* 7. FOOTER */}
        <div className="px-5 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-[11px]">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Audio & Transcripción unificados en una sola ventana</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 font-semibold cursor-pointer text-xs transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
