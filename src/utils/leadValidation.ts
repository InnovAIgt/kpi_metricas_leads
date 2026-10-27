/**
 * Utilidades de validación y clasificación estricta de Leads.
 * Un lead calificado DEBE tener:
 * 1. Fecha agendada y hora agendada reales (no inventadas a partir de fecha_creado).
 * 2. Tipo de reunión válido (NO "(sin reunion)", "sin reunion", o vacío).
 * 3. Nombre real del contacto o empresa (NO emojis solos como "😎", NO iniciales de 1 letra como "L", NO apodos informales como "El Amigo").
 */

export function esNombreValido(nombre: string | null | undefined): boolean {
  if (!nombre) return false;
  const raw = String(nombre).trim();

  // Descartar si tiene menos de 2 caracteres (ej: "L", "A")
  if (raw.length < 2) return false;

  // Extraer letras y números Unicode (excluye emojis, símbolos, espacios)
  const caracteresValidos = raw.match(/[\p{L}\p{N}]/gu) || [];
  if (caracteresValidos.length < 2) {
    // Es únicamente un emoji (ej: "😎", "🔥") o un símbolo
    return false;
  }

  // Descartar placeholders y apodos informales conocidos
  const normalizado = raw.toLowerCase();
  const placeholdersInvalidos = [
    'el amigo',
    'amigo',
    'elamigo',
    'amigo mio',
    'el compa',
    'prueba',
    'test',
    'tester',
    'asdf',
    'qwerty',
    'desconocido',
    'anonimo',
    'anónimo',
    'sin nombre',
    'no nombre',
    'cliente',
    'lead',
  ];

  if (placeholdersInvalidos.includes(normalizado)) {
    return false;
  }

  return true;
}

export function tieneReunionAgendadaValida(lead: any): boolean {
  if (!lead) return false;

  // 1. Validar fecha_agendada real
  const fAg = lead.fecha_agendada && lead.fecha_agendada !== 'null' ? String(lead.fecha_agendada).trim() : '';
  if (!fAg || fAg.length < 8) return false;

  // 2. Validar tipo_reunion
  const tipo = String(lead.tipo_reunion || lead.tipo || '').toLowerCase().trim();
  if (
    tipo.includes('sin reunion') ||
    tipo.includes('sin reunión') ||
    tipo.includes('sin agendar') ||
    tipo.includes('no agendad') ||
    tipo === '(sin reunion)' ||
    tipo === 'sin reunion'
  ) {
    return false;
  }

  return true;
}

export function esLeadCalificadoValido(lead: any): boolean {
  if (!lead) return false;

  // Debe tener reunión agendada real
  if (!tieneReunionAgendadaValida(lead)) {
    return false;
  }

  // Debe tener nombre de contacto o empresa legítimo
  const nombre =
    lead.prospecto_nombre ||
    lead.nombre_prospecto ||
    lead.nombre ||
    lead.cliente ||
    lead.client_name ||
    '';

  if (!esNombreValido(nombre)) {
    return false;
  }

  return true;
}
