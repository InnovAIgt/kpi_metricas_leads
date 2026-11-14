/**
 * Utilidades para filtrar llamadas PBX y Celular únicamente a los ejecutivos
 * configurados en el catálogo oficial (public.catalogo).
 */

export interface IndiceCatalogo {
  extensiones: Set<string>;
  usuarios: Set<string>;
  nombres: Set<string>;
  celulares: Set<string>;
}

export function construirIndiceCatalogo(catalogo: any[]): IndiceCatalogo {
  const extensiones = new Set<string>();
  const usuarios = new Set<string>();
  const nombres = new Set<string>();
  const celulares = new Set<string>();

  if (!Array.isArray(catalogo)) {
    return { extensiones, usuarios, nombres, celulares };
  }

  catalogo.forEach((cat) => {
    if (!cat) return;

    if (cat.extension && String(cat.extension).trim() !== 'null') {
      String(cat.extension)
        .split(/[,;/|]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .forEach((ext) => extensiones.add(ext));
    }

    if (cat.usuario && String(cat.usuario).trim() !== 'null') {
      usuarios.add(String(cat.usuario).trim().toLowerCase());
    }

    if (cat.nombre_ejecutivo && String(cat.nombre_ejecutivo).trim() !== 'null') {
      nombres.add(String(cat.nombre_ejecutivo).trim().toLowerCase());
    }

    if (cat.celular && String(cat.celular).trim() !== 'null') {
      const digits = String(cat.celular).replace(/\D/g, '');
      if (digits.length >= 7) {
        celulares.add(digits.length >= 8 ? digits.slice(-8) : digits.slice(-7));
      }
    }
  });

  return { extensiones, usuarios, nombres, celulares };
}

export function esPbxDeCatalogo(pbx: any, indice: IndiceCatalogo): boolean {
  if (!pbx) return false;

  const extRaw = String(pbx.extension ?? '')
    .replace(/^ext\.?\s*/i, '')
    .trim()
    .toLowerCase();
  if (extRaw && extRaw !== 'null' && extRaw !== 'undefined') {
    if (indice.extensiones.has(extRaw)) return true;
    const extDigits = extRaw.replace(/\D/g, '');
    if (extDigits.length >= 7) {
      const key = extDigits.length >= 8 ? extDigits.slice(-8) : extDigits.slice(-7);
      if (indice.celulares.has(key)) return true;
    }
  }

  const nomRaw = String(pbx.nombre ?? '').trim().toLowerCase();
  if (nomRaw && nomRaw !== 'null' && nomRaw !== 'undefined') {
    if (indice.usuarios.has(nomRaw) || indice.nombres.has(nomRaw)) return true;
  }

  return false;
}

export function esCelularDeCatalogo(cel: any, indice: IndiceCatalogo): boolean {
  if (!cel) return false;

  const lineaDigits = String(cel.linea ?? '').replace(/\D/g, '');
  if (lineaDigits.length >= 7) {
    const key = lineaDigits.length >= 8 ? lineaDigits.slice(-8) : lineaDigits.slice(-7);
    if (indice.celulares.has(key)) return true;
  }

  const userRaw = String(cel.usuario ?? '').trim().toLowerCase();
  if (userRaw && userRaw !== 'null' && userRaw !== 'undefined') {
    if (indice.usuarios.has(userRaw) || indice.nombres.has(userRaw)) return true;
  }

  return false;
}

export function filtrarPbxPorCatalogo<T = any>(llamadasPbx: T[], catalogo: any[]): T[] {
  if (!Array.isArray(llamadasPbx) || !Array.isArray(catalogo) || catalogo.length === 0) {
    return llamadasPbx;
  }
  const indice = construirIndiceCatalogo(catalogo);
  return llamadasPbx.filter((p) => esPbxDeCatalogo(p, indice));
}

export function filtrarCelularPorCatalogo<T = any>(llamadasCelular: T[], catalogo: any[]): T[] {
  if (!Array.isArray(llamadasCelular) || !Array.isArray(catalogo) || catalogo.length === 0) {
    return llamadasCelular;
  }
  const indice = construirIndiceCatalogo(catalogo);
  return llamadasCelular.filter((c) => esCelularDeCatalogo(c, indice));
}
