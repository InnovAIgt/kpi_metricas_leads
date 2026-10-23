const NOMBRES_MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export interface MesInfo {
  anio: number;
  mes: number;
  mesStr: string;
  mesTarget: string; // ej: "2026-10"
  nombreMes: string; // ej: "Octubre"
  inicioMes: string; // ej: "2026-10-01"
  finMes: string; // ej: "2026-10-31"
  hoy: string; // ej: "2026-10-07"
}

/**
 * Obtiene dinámicamente toda la información del mes actual del sistema
 */
export function getMesActualInfo(baseDate?: Date | string): MesInfo {
  const d = baseDate ? new Date(baseDate) : new Date();
  const anio = d.getFullYear();
  const mes = d.getMonth() + 1;
  const mesStr = String(mes).padStart(2, '0');
  const mesTarget = `${anio}-${mesStr}`;
  const nombreMes = NOMBRES_MESES[mes - 1] || 'Octubre';

  const inicioMes = `${anio}-${mesStr}-01`;
  const ultimoDiaNum = new Date(anio, mes, 0).getDate();
  const finMes = `${anio}-${mesStr}-${String(ultimoDiaNum).padStart(2, '0')}`;
  const hoy = d.toISOString().slice(0, 10);

  return {
    anio,
    mes,
    mesStr,
    mesTarget,
    nombreMes,
    inicioMes,
    finMes,
    hoy,
  };
}

/**
 * Obtiene dinámicamente la información del mes anterior
 */
export function getMesAnteriorInfo(baseDate?: Date | string): MesInfo {
  const d = baseDate ? new Date(baseDate) : new Date();
  const dAnterior = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return getMesActualInfo(dAnterior);
}

/**
 * Obtiene el rango de la semana actual calendario (Lunes a Domingo) en formato YYYY-MM-DD.
 */
export function getRangoSemanaActual(baseDate?: Date | string): { inicio: string; fin: string } {
  const ahora = baseDate ? new Date(baseDate) : new Date();
  const diaSemana = ahora.getDay(); // 0 = Domingo, 1 = Lunes, ...
  const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;

  const lunes = new Date(ahora);
  lunes.setDate(ahora.getDate() + diffLunes);

  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);

  const format = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return {
    inicio: format(lunes),
    fin: format(domingo),
  };
}

/**
 * Obtiene el rango por defecto del mes actual dinámico
 */
export function getRangoDefaultLeads(): { inicio: string; fin: string } {
  const info = getMesActualInfo();
  return {
    inicio: info.inicioMes,
    fin: info.finMes,
  };
}

/**
 * Obtiene el rango del mes actual dinámico
 */
export function getRangoMesActual(): { inicio: string; fin: string } {
  const info = getMesActualInfo();
  return {
    inicio: info.inicioMes,
    fin: info.finMes,
  };
}

/**
 * Obtiene el rango del mes anterior dinámico
 */
export function getRangoMesAnterior(): { inicio: string; fin: string } {
  const info = getMesAnteriorInfo();
  return {
    inicio: info.inicioMes,
    fin: info.finMes,
  };
}

/**
 * Valida si una fecha es futura/próxima (estrictamente mayor a hoy, no hoy ni en el pasado).
 */
export function esFechaProxima(fechaStrOVal?: string | null): boolean {
  if (!fechaStrOVal) return false;
  const str = String(fechaStrOVal).trim();
  const f = str.slice(0, 10);
  if (!f || f.length < 10) return false;

  const hoyStr = new Date().toISOString().slice(0, 10);
  return f > hoyStr;
}

/**
 * Valida si un registro pertenece al mes actual dinámico (ej: Octubre 2026)
 */
export function esDelMesActual(
  item: any,
  dateKeys: string[] = [
    'fecha_agendada',
    'fecha_creado',
    'fecha_hora',
    'fecha_hora_inicio',
    'fecha_llamada',
    'fecha',
    'created_at',
    'created_at_sv',
    'calldate',
    'solo_fecha',
  ]
): boolean {
  if (!item) return false;
  const info = getMesActualInfo();
  return esDelMesEspecifico(item, info.anio, info.mes, dateKeys);
}

/**
 * Valida si un registro pertenece al mes anterior dinámico (ej: Septiembre 2026)
 */
export function esDelMesAnterior(
  item: any,
  dateKeys: string[] = [
    'fecha_agendada',
    'fecha_creado',
    'fecha_hora',
    'fecha_hora_inicio',
    'fecha_llamada',
    'fecha',
    'created_at',
    'created_at_sv',
    'calldate',
    'solo_fecha',
  ]
): boolean {
  if (!item) return false;
  const info = getMesAnteriorInfo();
  return esDelMesEspecifico(item, info.anio, info.mes, dateKeys);
}

/**
 * Validador universal para cualquier año y mes especificado
 */
export function esDelMesEspecifico(
  item: any,
  anio: number,
  mes: number,
  dateKeys: string[] = [
    'fecha_agendada',
    'fecha_creado',
    'fecha_hora',
    'fecha_hora_inicio',
    'fecha_llamada',
    'fecha',
    'created_at',
    'created_at_sv',
    'calldate',
    'solo_fecha',
  ]
): boolean {
  if (!item) return false;
  const mesStr = String(mes).padStart(2, '0');
  const targetIso = `${anio}-${mesStr}`;
  const targetSlash = `/${mesStr}/${anio}`;
  const targetDash = `-${mesStr}-${anio}`;

  for (const k of dateKeys) {
    const val = item[k];
    if (val) {
      const s = String(val).trim();
      if (s.startsWith(targetIso) || s.includes(targetIso)) return true;
      if (s.includes(targetSlash) || s.includes(targetDash)) return true;

      // Parseo seguro de fecha si no coincide en string
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        if (d.getFullYear() === anio && d.getMonth() + 1 === mes) {
          return true;
        }
      }
    }
  }

  // Columnas numéricas/texto directas de llamadas_pbx ('mes' y 'anio')
  if (
    (Number(item.mes) === mes || String(item.mes) === mesStr) &&
    Number(item.anio) === anio
  ) {
    return true;
  }

  return false;
}

/**
 * Obtiene la última semana con leads registrados en la base de datos (14 al 20 de septiembre de 2026)
 */
export function getRangoSemanaConLeads(): { inicio: string; fin: string } {
  return {
    inicio: '2026-09-14',
    fin: '2026-09-20',
  };
}

/**
 * Obtiene el rango del mes de septiembre completo
 */
export function getRangoMesSeptiembre(): { inicio: string; fin: string } {
  return {
    inicio: '2026-09-01',
    fin: '2026-09-30',
  };
}

export function getRangoSemanaCalendario(): { inicio: string; fin: string } {
  return getRangoSemanaActual();
}
