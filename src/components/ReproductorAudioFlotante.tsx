import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  X,
  AlertCircle,
  Phone,
  User,
  Calendar,
  Radio,
  Minimize2,
  Maximize2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

export interface AudioLlamadaItem {
  id?: string;
  uniqueid?: string;
  extension?: string;
  nombre?: string;
  asesor_nombre?: string;
  destino?: string;
  fecha_hora?: string;
  fecha?: string;
  duracion_segundos?: number;
  duracion_minutos?: number;
  duracion_hh_mm_ss?: string;
  estado?: string;
  audio_url?: string;
  grabacion_url?: string;
  pais?: string;
}

interface ReproductorAudioFlotanteProps {
  llamada: AudioLlamadaItem | null;
  onClose: () => void;
}

/**
 * Normaliza y construye la lista priorizada de URLs candidatas para reproducir el audio
 * garantizando compatibilidad en desarrollo local, producción y despliegue en Vercel.
 */
export function construirUrlsCandidatasAudio(llamada: AudioLlamadaItem | null): {
  candidatos: string[];
  urlDirecta: string;
} {
  if (!llamada) return { candidatos: [], urlDirecta: '' };

  const supabaseUrl =
    (import.meta as any).env?.VITE_SUPABASE_URL ||
    'https://sbopifiiyezmvsadwkpg.supabase.co';
  const supabaseKey =
    (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNib3BpZmlpeWV6bXZzYWR3a3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzM0OTYsImV4cCI6MjEwMDMwOTQ5Nn0.ZI5y8lroFF529Xr-Otm1fcq6H2lhbh9e3s-WU9O6I7A';

  const rawUrl = llamada.audio_url || llamada.grabacion_url || '';
  let urlDirecta = '';

  if (rawUrl && typeof rawUrl === 'string' && rawUrl.trim() && rawUrl !== 'null' && rawUrl !== 'undefined') {
    const s = rawUrl.trim();
    if (s.startsWith('http://') || s.startsWith('https://')) {
      urlDirecta = s;
    } else {
      urlDirecta = `https://api.red.com.sv${s.startsWith('/') ? '' : '/'}${s}`;
    }
  } else {
    // Reconstrucción determinista a partir de los campos del registro
    const ext = llamada.extension || llamada.nombre;
    const uid = llamada.uniqueid;
    const fechaStr = llamada.fecha_hora || llamada.fecha;
    const pais = String(llamada.pais || 'SV').toUpperCase();

    if (uid && ext && fechaStr) {
      const d = new Date(fechaStr);
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dia = String(d.getUTCDate()).padStart(2, '0');
        const filename = `Grabacion_Ext_${ext}_${uid}.wav`;
        if (pais === 'GT') {
          urlDirecta = `https://api.red.com.sv/pbx/api/v1/rawCalls?pais=GT&anio=${y}&mes=${m}&dia=${dia}&archivo=${filename}`;
        } else {
          urlDirecta = `https://api.red.com.sv/pbx/api/v1/getAudio/${y}/${m}/${dia}/${filename}`;
        }
      }
    }
  }

  if (!urlDirecta) return { candidatos: [], urlDirecta: '' };

  const candidatos: string[] = [];

  // Candidato 1: Proxy de Supabase Edge Function con credenciales seguras de PBX (funciona en Vercel)
  const edgeProxy = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/sincronizar-datos?action=audio&url=${encodeURIComponent(urlDirecta)}&apikey=${supabaseKey}`;
  candidatos.push(edgeProxy);

  // Candidato 2: Proxy del backend Node/Express
  candidatos.push(`/api/audio-proxy?url=${encodeURIComponent(urlDirecta)}`);

  // Candidato 3: URL Directa a api.red.com.sv
  candidatos.push(urlDirecta);

  // Candidatos alternativos: cruce de formatos getAudio <-> rawCalls
  if (urlDirecta.includes('/rawCalls?')) {
    const m = urlDirecta.match(/anio=(\d+)&mes=(\d+)&dia=(\d+)&archivo=([^&]+)/);
    if (m) {
      const alt = `https://api.red.com.sv/pbx/api/v1/getAudio/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
      candidatos.push(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/sincronizar-datos?action=audio&url=${encodeURIComponent(alt)}&apikey=${supabaseKey}`);
      candidatos.push(alt);
    }
  } else if (urlDirecta.includes('/getAudio/')) {
    const m = urlDirecta.match(/\/getAudio\/(\d{4})\/(\d{2})\/(\d{2})\/(.+)$/);
    if (m) {
      const pais = llamada.pais || 'SV';
      const alt = `https://api.red.com.sv/pbx/api/v1/rawCalls?pais=${pais}&anio=${m[1]}&mes=${m[2]}&dia=${m[3]}&archivo=${m[4]}`;
      candidatos.push(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/sincronizar-datos?action=audio&url=${encodeURIComponent(alt)}&apikey=${supabaseKey}`);
      candidatos.push(alt);
    }
  }

  return { candidatos, urlDirecta };
}

export const ReproductorAudioFlotante: React.FC<ReproductorAudioFlotanteProps> = ({
  llamada,
  onClose,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [reproduciendo, setReproduciendo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [tiempoActual, setTiempoActual] = useState(0);
  const [duracionTotal, setDuracionTotal] = useState(0);
  const [volumen, setVolumen] = useState(1);
  const [muteado, setMuteado] = useState(false);
  const [velocidad, setVelocidad] = useState(1);
  const [colapsado, setColapsado] = useState(false);
  const [errorAudio, setErrorAudio] = useState<string | null>(null);

  const [listaCandidatos, setListaCandidatos] = useState<string[]>([]);
  const [indiceCandidato, setIndiceCandidato] = useState(0);
  const [urlDirectaLlamada, setUrlDirectaLlamada] = useState('');

  // Formato mm:ss
  const formatTiempo = (segundos: number): string => {
    if (isNaN(segundos) || segundos < 0) return '00:00';
    const mins = Math.floor(segundos / 60);
    const secs = Math.floor(segundos % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Inicializar audio cuando cambia la llamada seleccionada
  useEffect(() => {
    if (!llamada) {
      setListaCandidatos([]);
      setIndiceCandidato(0);
      setReproduciendo(false);
      setErrorAudio(null);
      setUrlDirectaLlamada('');
      return;
    }

    const { candidatos, urlDirecta } = construirUrlsCandidatasAudio(llamada);
    setUrlDirectaLlamada(urlDirecta);

    if (candidatos.length === 0) {
      setErrorAudio('Este registro de llamada no cuenta con campos de audio o grabación en el sistema.');
      setCargando(false);
      setReproduciendo(false);
      return;
    }

    setErrorAudio(null);
    setCargando(true);
    setTiempoActual(0);
    setDuracionTotal(llamada.duracion_segundos || 0);
    setListaCandidatos(candidatos);
    setIndiceCandidato(0);
    setReproduciendo(true);
  }, [llamada]);

  // Manejo de error: intentar el siguiente candidato en cascada
  const handleAudioError = useCallback(() => {
    if (indiceCandidato + 1 < listaCandidatos.length) {
      const siguienteIndice = indiceCandidato + 1;
      console.warn(
        `Fallo candidato de audio [${indiceCandidato}], probando siguiente [${siguienteIndice}]:`,
        listaCandidatos[siguienteIndice]
      );
      setIndiceCandidato(siguienteIndice);
      setCargando(true);
      return;
    }

    // Todos los candidatos agotados
    setCargando(false);
    setReproduciendo(false);
    setErrorAudio(
      'Grabación no disponible actualmente. El archivo de audio no se encuentra disponible en el servidor PBX o no fue grabado para esta llamada.'
    );
  }, [indiceCandidato, listaCandidatos]);

  const urlActual = listaCandidatos[indiceCandidato] || '';

  // Sincronizar reproducción del elemento <audio>
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !urlActual) return;

    if (reproduciendo) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setCargando(false);
            setErrorAudio(null);
          })
          .catch((err) => {
            if (err.name !== 'AbortError') {
              handleAudioError();
            }
          });
      }
    } else {
      audio.pause();
    }
  }, [reproduciendo, urlActual, handleAudioError]);

  const toggleReproducir = () => {
    if (errorAudio) return;
    setReproduciendo((prev) => !prev);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio) {
      setTiempoActual(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        setDuracionTotal(audio.duration);
      }
    }
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (audio) {
      setCargando(false);
      setErrorAudio(null);
      if (audio.duration && !isNaN(audio.duration)) {
        setDuracionTotal(audio.duration);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevoTiempo = parseFloat(e.target.value);
    setTiempoActual(nuevoTiempo);
    if (audioRef.current) {
      audioRef.current.currentTime = nuevoTiempo;
    }
  };

  const handleRewind5 = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
    }
  };

  const handleForward5 = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(duracionTotal, audioRef.current.currentTime + 5);
    }
  };

  const cambiarVelocidad = () => {
    const velocidades = [1, 1.25, 1.5, 2];
    const indexActual = velocidades.indexOf(velocidad);
    const siguiente = velocidades[(indexActual + 1) % velocidades.length];
    setVelocidad(siguiente);
    if (audioRef.current) {
      audioRef.current.playbackRate = siguiente;
    }
  };

  const toggleMute = () => {
    const nuevoMute = !muteado;
    setMuteado(nuevoMute);
    if (audioRef.current) {
      audioRef.current.muted = nuevoMute;
    }
  };

  const handleVolumenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolumen(val);
    setMuteado(val === 0);
    if (audioRef.current) {
      audioRef.current.volume = val;
      audioRef.current.muted = val === 0;
    }
  };

  const handleReintentar = () => {
    setErrorAudio(null);
    setCargando(true);
    setIndiceCandidato(0);
    setReproduciendo(true);
  };

  if (!llamada) return null;

  const ext = llamada.extension || 'Sin ext.';
  const destino = llamada.destino || 'Sin destino';
  const asesor = llamada.asesor_nombre || llamada.nombre || 'Asesor PBX';
  const estado = llamada.estado || 'CONTESTADA';
  const fechaStr = llamada.fecha_hora || llamada.fecha || '';

  // Vista colapsada/mini
  if (colapsado) {
    return (
      <aside
        aria-label="Reproductor de audio colapsado"
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 bg-slate-900/95 backdrop-blur-md border border-indigo-500/50 shadow-2xl rounded-full px-3.5 py-2 text-white text-xs animate-in fade-in slide-in-from-bottom-2 duration-200"
      >
        <span className="relative flex h-2.5 w-2.5">
          {reproduciendo && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              reproduciendo ? 'bg-indigo-500' : 'bg-slate-400'
            }`}
          />
        </span>
        <button
          type="button"
          onClick={toggleReproducir}
          className="p-1 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
          title={reproduciendo ? 'Pausar' : 'Reproducir'}
        >
          {reproduciendo ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <div className="flex flex-col">
          <span className="font-semibold text-[11px] truncate max-w-[140px]">
            Ext. {ext} ➔ {destino}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {formatTiempo(tiempoActual)} / {formatTiempo(duracionTotal)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setColapsado(false)}
          className="p-1 text-slate-400 hover:text-white cursor-pointer"
          title="Expandir reproductor"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
          title="Cerrar reproductor"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Reproductor de audio flotante"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-4xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 shadow-[0_20px_50px_rgba(0,0,0,0.7)] rounded-2xl p-3.5 md:p-4 text-white animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      {/* Elemento de Audio Nativo Oculto */}
      {urlActual && (
        <audio
          ref={audioRef}
          src={urlActual}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setReproduciendo(false)}
          onError={handleAudioError}
          preload="metadata"
        />
      )}

      {/* Contenedor Principal */}
      <div className="flex flex-col gap-2.5">
        {/* Fila Superior: Datos de la llamada y Acciones de Ventana */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-2">
          {/* Metadata de la llamada */}
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 text-xs font-semibold">
              <Radio className="h-3.5 w-3.5 animate-pulse text-indigo-400" />
              <span>Ext. {ext}</span>
            </div>

            <div className="flex items-center gap-1 text-xs text-slate-300 font-medium">
              <Phone className="h-3 w-3 text-slate-400" />
              <span className="font-mono text-slate-200">{destino}</span>
            </div>

            <div className="hidden sm:flex items-center gap-1 text-xs text-slate-400">
              <User className="h-3 w-3 text-slate-500" />
              <span className="truncate max-w-[150px] text-slate-300">{asesor}</span>
            </div>

            {fechaStr && (
              <div className="hidden md:flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                <Calendar className="h-3 w-3 text-slate-500" />
                <span>{fechaStr.replace('T', ' ').slice(0, 19)}</span>
              </div>
            )}

            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                estado.toLowerCase() === 'contestada' || estado.toLowerCase() === 'answered'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                  : 'bg-rose-950 text-rose-300 border border-rose-800/60'
              }`}
            >
              {estado}
            </span>
          </div>

          {/* Botones de Minimizar y Cerrar */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setColapsado(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Minimizar reproductor"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
              title="Cerrar reproductor"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Fila Inferior: Controles de Audio o Mensaje Amigable de Error */}
        {errorAudio ? (
          <div className="flex items-center justify-between gap-3 bg-amber-950/30 border border-amber-800/50 rounded-xl px-3.5 py-2.5 text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
              <div>
                <p className="font-semibold text-amber-300">Grabación no disponible actualmente</p>
                <p className="text-[11px] text-amber-200/80">{errorAudio}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleReintentar}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-900/40 border border-amber-700/60 text-amber-200 hover:bg-amber-800/60 text-[11px] font-medium transition-colors cursor-pointer"
                title="Reintentar reproducción"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Reintentar</span>
              </button>
              {urlDirectaLlamada && (
                <a
                  href={urlDirectaLlamada}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 underline"
                  title="Abrir URL completa directa en nueva pestaña"
                >
                  <span>Enlace directo</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Controles de reproducción principales */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRewind5}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Retroceder 5 segundos"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={toggleReproducir}
                disabled={cargando}
                className="flex items-center justify-center h-9 w-9 rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
                title={reproduciendo ? 'Pausar' : 'Reproducir'}
              >
                {cargando ? (
                  <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : reproduciendo ? (
                  <Pause className="h-4 w-4 fill-white" />
                ) : (
                  <Play className="h-4 w-4 fill-white ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={handleForward5}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer text-xs font-semibold"
                title="Avanzar 5 segundos"
              >
                +5s
              </button>

              <button
                type="button"
                onClick={cambiarVelocidad}
                className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-mono font-bold transition-colors cursor-pointer"
                title="Velocidad de reproducción"
              >
                {velocidad}x
              </button>
            </div>

            {/* Barra de Progreso y Tiempos */}
            <div className="flex-1 flex items-center gap-2.5">
              <span className="text-[11px] font-mono text-slate-300 w-10 text-right">
                {formatTiempo(tiempoActual)}
              </span>

              <input
                type="range"
                min={0}
                max={duracionTotal || 100}
                step={0.1}
                value={tiempoActual}
                onChange={handleSeek}
                className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                title="Avanzar / retroceder en la grabación"
              />

              <span className="text-[11px] font-mono text-slate-400 w-10">
                {formatTiempo(duracionTotal)}
              </span>
            </div>

            {/* Control de Volumen */}
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
                title={muteado ? 'Activar sonido' : 'Silenciar'}
              >
                {muteado ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muteado ? 0 : volumen}
                onChange={handleVolumenChange}
                className="w-16 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                title="Volumen"
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
