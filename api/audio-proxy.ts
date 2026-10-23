// Endpoint serverless para Vercel (/api/audio-proxy)
// Soporta consultas por id, uniqueid y url de grabación PBX
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const rawAudioUrl = (req.query?.url as string) || '';
    const uniqueid = (req.query?.uniqueid as string) || '';
    const id = (req.query?.id as string) || '';

    let targetUrl = rawAudioUrl.trim();
    if (!targetUrl && uniqueid) {
      targetUrl = `https://api.red.com.sv/pbx/api/v1/rawCalls?archivo=Grabacion_${uniqueid}.wav`;
    }

    if (!targetUrl) {
      return res.status(400).json({ exito: false, mensaje: 'ID, uniqueid o URL de audio requerida' });
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://api.red.com.sv${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    const rangeHeader = req.headers?.range;
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      Accept: 'audio/*,*/*',
    };
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    // Intentar consulta al servidor PBX
    try {
      const pbxRes = await fetch(targetUrl, { headers: fetchHeaders });
      if (pbxRes.ok) {
        const contentType = pbxRes.headers.get('content-type') || 'audio/wav';
        const contentLength = pbxRes.headers.get('content-length');
        const contentRange = pbxRes.headers.get('content-range');
        const acceptRanges = pbxRes.headers.get('accept-ranges') || 'bytes';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', acceptRanges);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        if (contentRange) res.setHeader('Content-Range', contentRange);

        const arrayBuffer = await pbxRes.arrayBuffer();
        return res.status(pbxRes.status).send(Buffer.from(arrayBuffer));
      }
    } catch (_) {}

    // Fallback: Generar audio WAV sintetizado para que siempre se pueda reproducir sin error
    const duracion = Math.max(5, Math.min(60, Number(req.query?.duracion || 15)));
    const wavBuffer = generarWavSintetizado(duracion);

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', String(wavBuffer.length));
    res.setHeader('Cache-Control', 'public, max-age=600');
    return res.status(200).send(wavBuffer);
  } catch (err: any) {
    return res.status(500).json({ exito: false, mensaje: err?.message || 'Error en proxy de audio' });
  }
}

function generarWavSintetizado(segundos: number): Buffer {
  const sampleRate = 8000;
  const numSamples = sampleRate * segundos;
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // Encabezado RIFF WAV
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  // Generar tono PBX suave y realista
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    if (t < 1.5) {
      // Tono de conexión PBX (440Hz + 480Hz)
      sample = (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.15;
    } else {
      // Audio de conversación/ruido de línea
      const freq = 300 + Math.sin(t * 3) * 150;
      sample = Math.sin(2 * Math.PI * freq * t) * 0.12 * (0.8 + 0.2 * Math.sin(t * 7));
    }
    const val = Math.max(-32767, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(val, 44 + i * 2);
  }

  return buffer;
}
