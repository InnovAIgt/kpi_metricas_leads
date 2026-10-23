/**
 * Servicio para cargar y reproducir audios reales de grabaciones PBX (Asterisk / Issabel)
 * basado en la especificación técnica de autenticación JWT y descarga a Blob URL.
 */

export interface PbxAudioResult {
  blobUrl: string | null;
  directUrl: string;
  error?: string;
  sinGrabacion?: boolean;
}

const PBX_HOST = 'https://api.red.com.sv';
const PBX_USER = 'DBOLAINES';
const PBX_PASS = 'Intelfon1234';

// JWT guardado en memoria
let tokenMemoria: string | null = null;
let tokenExpiracion: number = 0;

/**
 * Autentica contra el backend PBX para obtener el JWT
 */
export async function loginPbx(): Promise<string> {
  if (tokenMemoria && Date.now() < tokenExpiracion) {
    return tokenMemoria;
  }

  try {
    const res = await fetch(`${PBX_HOST}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: PBX_USER, password: PBX_PASS }),
    });

    if (!res.ok) {
      throw new Error(`Login PBX falló con HTTP ${res.status}`);
    }

    const data = await res.json();
    const token = data.token || data.jwt || data.access_token;
    if (!token) {
      throw new Error('No se recibió token en respuesta de login PBX');
    }

    tokenMemoria = token;
    // Guardar con vigencia de 23 horas (el token vence en 24h)
    tokenExpiracion = Date.now() + 23 * 3600 * 1000;
    return token;
  } catch (err: any) {
    console.error('Error al iniciar sesión en PBX:', err);
    throw err;
  }
}

/**
 * Detecta el tipo MIME de audio real analizando los primeros bytes (magic numbers)
 */
export function sniffAudioMime(buf: ArrayBuffer): string {
  if (!buf || buf.byteLength < 12) return '';
  const b = new Uint8Array(buf.slice(0, 12));
  const s = String.fromCharCode(...b.slice(0, 4));

  if (s.startsWith('RIFF')) return 'audio/wav';
  if (s.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (s.startsWith('OggS')) return 'audio/ogg';
  return '';
}

/**
 * Valida si un buffer recibido es un documento HTML o texto de error en lugar de audio
 */
function esRespuestaHtmlOTexto(buf: ArrayBuffer): boolean {
  if (!buf || buf.byteLength < 16) return true;
  const muestra = String.fromCharCode(...new Uint8Array(buf.slice(0, 100))).toLowerCase();
  return (
    muestra.includes('<!doctype') ||
    muestra.includes('<html') ||
    muestra.includes('unauthorized') ||
    muestra.includes('not found') ||
    muestra.includes('cannot find') ||
    muestra.includes('{"error"') ||
    muestra.includes('{"ok":false')
  );
}

/**
 * Construye la URL canónica de rawCalls a partir de la metadata de la llamada
 */
export function resolverUrlRawCalls(llamada: any): {
  url: string;
  pais: 'SV' | 'GT';
  anio: string;
  mes: string;
  dia: string;
  archivo: string;
} {
  const rawUrl = llamada.audio_url || llamada.grabacion_url || '';
  const uid = String(llamada.uniqueid || llamada.id || '').trim();
  const ext = String(llamada.extension || llamada.nombre || '').replace(/[^0-9]/g, '');

  let pais: 'SV' | 'GT' =
    String(llamada.pais || '').toUpperCase() === 'GT' ? 'GT' : 'SV';

  let anio = '2026';
  let mes = '10';
  let dia = '22';
  let archivo = '';

  // 1. Si ya viene una URL completa o con parámetros
  if (rawUrl && typeof rawUrl === 'string' && rawUrl.includes('rawCalls')) {
    try {
      const u = new URL(rawUrl.startsWith('http') ? rawUrl : `${PBX_HOST}${rawUrl}`);
      const pPais = u.searchParams.get('pais')?.toUpperCase();
      if (pPais === 'GT' || pPais === 'SV') pais = pPais;
      anio = u.searchParams.get('anio') || anio;
      mes = u.searchParams.get('mes') || mes;
      dia = u.searchParams.get('dia') || dia;
      archivo = u.searchParams.get('archivo') || '';
    } catch (_) {}
  } else if (rawUrl && typeof rawUrl === 'string' && rawUrl.includes('/getAudio/')) {
    // Formato antiguo /getAudio/YYYY/MM/DD/filename.wav
    const partes = rawUrl.split('/getAudio/')[1]?.split('/') || [];
    if (partes.length >= 4) {
      anio = partes[0];
      mes = partes[1];
      dia = partes[2];
      archivo = partes.slice(3).join('/');
    }
  }

  // 2. Extraer fecha de la llamada si no se obtuvo de la URL
  if (!archivo || !anio) {
    const fechaStr = llamada.fecha_hora || llamada.fecha || '';
    if (fechaStr) {
      const d = new Date(fechaStr);
      if (!isNaN(d.getTime())) {
        anio = String(d.getUTCFullYear());
        mes = String(d.getUTCMonth() + 1).padStart(2, '0');
        dia = String(d.getUTCDate()).padStart(2, '0');
      }
    }
  }

  // 3. Si no hay archivo pero tenemos extension y uniqueid
  if (!archivo && uid) {
    if (ext) {
      archivo = `Grabacion_Ext_${ext}_${uid}.wav`;
    } else {
      archivo = `Grabacion_${uid}.wav`;
    }
  }

  const urlFinal = `${PBX_HOST}/pbx/api/v1/rawCalls?pais=${pais}&anio=${anio}&mes=${mes}&dia=${dia}&archivo=${encodeURIComponent(
    archivo
  )}`;

  return { url: urlFinal, pais, anio, mes, dia, archivo };
}

/**
 * Busca en el listado del día de la PBX el nombre de archivo real que contenga el uniqueid
 */
async function buscarArchivoPorUniqueId(
  token: string,
  pais: 'SV' | 'GT',
  anio: string,
  mes: string,
  dia: string,
  uniqueid: string
): Promise<string | null> {
  try {
    const listUrl = `${PBX_HOST}/pbx/api/v1/rawCalls?pais=${pais}&anio=${anio}&mes=${mes}&dia=${dia}`;
    const res = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!Array.isArray(data)) return null;

    const match = data.find(
      (item: any) =>
        item.name &&
        typeof item.name === 'string' &&
        item.name.toLowerCase().includes(uniqueid.toLowerCase())
    );
    return match ? match.name : null;
  } catch (_) {
    return null;
  }
}

/**
 * Descarga el audio real desde la PBX y retorna un Blob URL nativo reproducible.
 * Si el token vence (401), se reloguea automáticamente y reintenta.
 * Si la grabación no existe (404), retorna sinGrabacion: true.
 */
export async function cargarAudioRealPbx(llamada: any): Promise<PbxAudioResult> {
  const { url: urlInicial, pais, anio, mes, dia, archivo } = resolverUrlRawCalls(llamada);
  const uid = String(llamada.uniqueid || llamada.id || '').trim();

  let jwt = await loginPbx();

  let targetUrl = urlInicial;
  let res: Response | null = null;

  // Intento 1: Descargar archivo con la URL resuelta
  try {
    res = await fetch(targetUrl, {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    // Token vencido: reloguear y reintentar una sola vez
    if (res.status === 401) {
      jwt = await loginPbx();
      res = await fetch(targetUrl, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
    }

    // Si da 404 y tenemos el uniqueid, buscar el nombre exacto en el listado del día
    // (en Guatemala los nombres suelen ser out-XXXXXXXX-XXXX-YYYYMMDD-HHMMSS-UID.wav)
    if (res.status === 404 && uid) {
      // Probar en el país de la llamada
      let nombreReal = await buscarArchivoPorUniqueId(jwt, pais, anio, mes, dia, uid);

      // Si no lo encuentra, probar el otro país
      const otroPais = pais === 'GT' ? 'SV' : 'GT';
      if (!nombreReal) {
        nombreReal = await buscarArchivoPorUniqueId(jwt, otroPais, anio, mes, dia, uid);
        if (nombreReal) {
          targetUrl = `${PBX_HOST}/pbx/api/v1/rawCalls?pais=${otroPais}&anio=${anio}&mes=${mes}&dia=${dia}&archivo=${encodeURIComponent(
            nombreReal
          )}`;
        }
      } else {
        targetUrl = `${PBX_HOST}/pbx/api/v1/rawCalls?pais=${pais}&anio=${anio}&mes=${mes}&dia=${dia}&archivo=${encodeURIComponent(
          nombreReal
        )}`;
      }

      if (nombreReal) {
        res = await fetch(targetUrl, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
      }
    }
  } catch (errDirect: any) {
    // Si falla por CORS o red en el navegador, intentar a través de nuestro proxy de backend
    console.warn('Fetch directo a PBX bloqueado, intentando proxy interno:', errDirect);
  }

  // Si el fetch directo no funcionó o fue bloqueado, probar vía proxy interno /api/audio-proxy
  if (!res || !res.ok) {
    try {
      const proxyUrl = `/api/audio-proxy?uniqueid=${encodeURIComponent(uid)}&pais=${pais}&anio=${anio}&mes=${mes}&dia=${dia}&archivo=${encodeURIComponent(
        archivo
      )}&url=${encodeURIComponent(targetUrl)}`;
      const proxyRes = await fetch(proxyUrl);
      if (proxyRes.ok) {
        const buf = await proxyRes.arrayBuffer();
        if (buf.byteLength > 200 && !esRespuestaHtmlOTexto(buf)) {
          const ct = (proxyRes.headers.get('content-type') || '').split(';')[0];
          const tipo = ct.startsWith('audio/') ? ct : sniffAudioMime(buf) || 'audio/wav';
          const blobUrl = URL.createObjectURL(new Blob([buf], { type: tipo }));
          return { blobUrl, directUrl: targetUrl };
        }
      }
    } catch (_) {}
  }

  // Manejo de resultados
  if (!res || res.status === 404) {
    return {
      blobUrl: null,
      directUrl: targetUrl,
      sinGrabacion: true,
      error:
        'Esta llamada no cuenta con archivo de audio grabado en la PBX (llamada no contestada, fallida o sin grabación).',
    };
  }

  if (!res.ok) {
    return {
      blobUrl: null,
      directUrl: targetUrl,
      error: `Error al obtener grabación PBX: HTTP ${res.status}`,
    };
  }

  const buf = await res.arrayBuffer();

  // Validar que sea un audio binario real y no una página HTML de error
  if (buf.byteLength < 200 || esRespuestaHtmlOTexto(buf)) {
    return {
      blobUrl: null,
      directUrl: targetUrl,
      sinGrabacion: true,
      error:
        'El archivo devuelto por el servidor no contiene datos de audio válidos para esta llamada.',
    };
  }

  const ct = (res.headers.get('content-type') || '').split(';')[0];
  const tipo = ct.startsWith('audio/') ? ct : sniffAudioMime(buf) || 'audio/wav';
  const blobUrl = URL.createObjectURL(new Blob([buf], { type: tipo }));

  return { blobUrl, directUrl: targetUrl };
}
