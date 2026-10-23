// Endpoint serverless para Vercel (/api/audio-proxy)
// Autentica contra api.red.com.sv/login (JWT) y transmite el audio real desde rawCalls
const PBX_HOST = 'https://api.red.com.sv';
const PBX_USER = 'DBOLAINES';
const PBX_PASS = 'Intelfon1234';

let pbxVercelToken: string | null = null;
let pbxVercelTokenExp = 0;

async function getPbxJwt(): Promise<string> {
  if (pbxVercelToken && Date.now() < pbxVercelTokenExp) {
    return pbxVercelToken;
  }
  const r = await fetch(`${PBX_HOST}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: PBX_USER, password: PBX_PASS }),
  });
  if (!r.ok) {
    throw new Error(`PBX login failed HTTP ${r.status}`);
  }
  const data = await r.json();
  const token = data.token || data.jwt || data.access_token;
  if (!token) throw new Error('No token in PBX login');
  pbxVercelToken = token;
  pbxVercelTokenExp = Date.now() + 23 * 3600 * 1000;
  return token;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const rawAudioUrl = (req.query?.url as string) || '';
    const uniqueid = (req.query?.uniqueid as string) || (req.query?.id as string) || '';
    let pais = ((req.query?.pais as string) || 'SV').toUpperCase();
    if (pais !== 'GT' && pais !== 'SV') pais = 'SV';

    let anio = (req.query?.anio as string) || '2026';
    let mes = (req.query?.mes as string) || '10';
    let dia = (req.query?.dia as string) || '22';
    let archivo = (req.query?.archivo as string) || '';

    if (rawAudioUrl) {
      try {
        const u = new URL(rawAudioUrl.startsWith('http') ? rawAudioUrl : `${PBX_HOST}${rawAudioUrl}`);
        const p = u.searchParams.get('pais')?.toUpperCase();
        if (p === 'GT' || p === 'SV') pais = p;
        if (u.searchParams.get('anio')) anio = u.searchParams.get('anio')!;
        if (u.searchParams.get('mes')) mes = u.searchParams.get('mes')!;
        if (u.searchParams.get('dia')) dia = u.searchParams.get('dia')!;
        if (u.searchParams.get('archivo')) archivo = u.searchParams.get('archivo')!;
      } catch (_) {
        if (rawAudioUrl.includes('/getAudio/')) {
          const partes = rawAudioUrl.split('/getAudio/')[1]?.split('/') || [];
          if (partes.length >= 4) {
            anio = partes[0];
            mes = partes[1];
            dia = partes[2];
            archivo = partes.slice(3).join('/');
          }
        }
      }
    }

    if (!uniqueid && !archivo && !rawAudioUrl) {
      return res.status(400).json({ exito: false, mensaje: 'ID o URL de audio requerida' });
    }

    let token = await getPbxJwt();

    let targetUrl = '';
    if (archivo) {
      targetUrl = `${PBX_HOST}/pbx/api/v1/rawCalls?pais=${pais}&anio=${anio}&mes=${mes}&dia=${dia}&archivo=${encodeURIComponent(archivo)}`;
    }

    const rangeHeader = req.headers?.range;
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Authorization: `Bearer ${token}`,
      Accept: 'audio/*,*/*',
    };
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    let pbxRes: Response | null = null;
    if (targetUrl) {
      pbxRes = await fetch(targetUrl, { headers: fetchHeaders });
      if (pbxRes.status === 401) {
        token = await getPbxJwt();
        fetchHeaders.Authorization = `Bearer ${token}`;
        pbxRes = await fetch(targetUrl, { headers: fetchHeaders });
      }
    }

    // Si falló o no teníamos archivo exacto, buscar en la lista del día por uniqueid
    if ((!pbxRes || !pbxRes.ok || pbxRes.status === 404) && uniqueid) {
      for (const p of [pais, pais === 'GT' ? 'SV' : 'GT']) {
        try {
          const listUrl = `${PBX_HOST}/pbx/api/v1/rawCalls?pais=${p}&anio=${anio}&mes=${mes}&dia=${dia}`;
          const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (listRes.ok) {
            const files = await listRes.json();
            if (Array.isArray(files)) {
              const match = files.find((f: any) => f.name && f.name.includes(uniqueid));
              if (match) {
                targetUrl = `${PBX_HOST}/pbx/api/v1/rawCalls?pais=${p}&anio=${anio}&mes=${mes}&dia=${dia}&archivo=${encodeURIComponent(match.name)}`;
                pbxRes = await fetch(targetUrl, { headers: fetchHeaders });
                break;
              }
            }
          }
        } catch (_) {}
      }
    }

    if (pbxRes && pbxRes.ok) {
      const contentType = pbxRes.headers.get('content-type') || 'audio/wav';
      const contentLength = pbxRes.headers.get('content-length');
      const contentRange = pbxRes.headers.get('content-range');
      const acceptRanges = pbxRes.headers.get('accept-ranges') || 'bytes';

      res.setHeader('Content-Type', contentType.startsWith('audio/') ? contentType : 'audio/wav');
      res.setHeader('Accept-Ranges', acceptRanges);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (contentRange) res.setHeader('Content-Range', contentRange);

      const arrayBuffer = await pbxRes.arrayBuffer();
      return res.status(pbxRes.status).send(Buffer.from(arrayBuffer));
    }

    return res.status(404).json({
      exito: false,
      mensaje: 'Esta llamada no cuenta con archivo de audio grabado en la PBX (llamada no contestada, fallida o sin grabación).',
    });
  } catch (err: any) {
    return res.status(500).json({
      exito: false,
      mensaje: err?.message || 'Error en proxy de audio PBX',
    });
  }
}
