// Endpoint serverless para Vercel: /api/transcripciones/catalogo-ejecutivos
const ISSABEL_RESUMEN_URL = 'http://200.35.189.133:3000/idata/api/v1/desaIssabel/getResumenLlamada';
let cacheCatalogo: { data: any[]; timestamp: number } | null = null;

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const fIni = '2026-10-01';
    const fFin = '2026-11-05';

    let data: any[] = [];
    if (cacheCatalogo && Date.now() - cacheCatalogo.timestamp < 300000) {
      data = cacheCatalogo.data;
    } else {
      const response = await fetch(`${ISSABEL_RESUMEN_URL}?fechaInicial=${fIni}&fechaFinal=${fFin}`);
      if (response.ok) {
        const json = await response.json();
        data = Array.isArray(json.info) ? json.info : [];
        cacheCatalogo = { data, timestamp: Date.now() };
      }
    }

    const conTrans = data.filter((c) => Boolean(c.transcripcion && c.transcripcion.trim().length > 10));
    const conteoPorEjecutivo: Record<string, { nombre: string; extension: string; total: number; pais: string; sample: any }> = {};

    conTrans.forEach((c) => {
      const key = `${c.extension || 'ext'}_${c.nombre || 'nom'}`;
      if (!conteoPorEjecutivo[key]) {
        conteoPorEjecutivo[key] = {
          nombre: c.nombre || `Ext. ${c.extension}`,
          extension: c.extension || '',
          total: 0,
          pais: c.pais || 'GT',
          sample: c,
        };
      }
      conteoPorEjecutivo[key].total += 1;
    });

    const lista = Object.values(conteoPorEjecutivo).sort((a, b) => b.total - a.total);
    return res.status(200).json({
      exito: true,
      total_con_transcripcion: conTrans.length,
      ejecutivos: lista,
    });
  } catch (err: any) {
    return res.status(500).json({ exito: false, mensaje: err?.message });
  }
}
