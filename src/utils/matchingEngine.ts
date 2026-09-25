import {
  Cita,
  Llamada,
  CruceAuditoria,
  ParametrosAuditoria,
  ResumenKPIs,
  VendedorMetricas,
  EstadoCumplimiento,
} from '../types';
import { esFechaProxima } from './dateHelpers';

/**
 * Normaliza un número telefónico extrayendo solo dígitos
 */
export function normalizarTelefono(tel?: string | number): string {
  if (!tel) return '';
  const s = String(tel).trim();
  if (s === 'null' || s === 'undefined') return '';
  return s.replace(/\D/g, '');
}

/**
 * Compara dos números telefónicos con tolerancia de sufijos
 * (últimos 8 dígitos para El Salvador / Guatemala / Centroamérica / México o 7 dígitos)
 */
export function coincideTelefono(tel1?: string | number, tel2?: string | number): boolean {
  if (!tel1 || !tel2) return false;
  const n1 = normalizarTelefono(tel1);
  const n2 = normalizarTelefono(tel2);
  if (!n1 || !n2) return false;

  // Coincidencia exacta completa
  if (n1 === n2) return true;

  // Uno contiene al otro
  if (n1.endsWith(n2) || n2.endsWith(n1)) return true;

  // Comparar últimos 8 dígitos (estándar Centroamérica y móviles)
  const suf1 = n1.length >= 8 ? n1.slice(-8) : n1;
  const suf2 = n2.length >= 8 ? n2.slice(-8) : n2;
  if (suf1.length >= 7 && suf2.length >= 7) {
    if (suf1 === suf2) return true;
    if (n1.endsWith(suf2) || n2.endsWith(suf1)) return true;
  }

  // Comparar últimos 7 dígitos
  if (n1.length >= 7 && n2.length >= 7) {
    if (n1.slice(-7) === n2.slice(-7)) return true;
  }

  return false;
}

/**
 * Compara si dos nombres de vendedor/asesor coinciden por token, usuario de catálogo o aproximación
 */
export function coincideVendedor(
  vendedor1?: string,
  vendedor2?: string,
  extension?: string,
  extensionAsesor?: string
): boolean {
  if (!vendedor1 || !vendedor2) return true; // Si falta en alguno, permitir match por teléfono

  const v1 = vendedor1.trim().toLowerCase();
  const v2 = vendedor2.trim().toLowerCase();

  // Si uno de los dos es genérico o no asignado, permitir
  if (
    v1.includes('asesor') ||
    v2.includes('asesor') ||
    v1.includes('linea') ||
    v2.includes('linea') ||
    v1 === 'ejecutivo' ||
    v2 === 'ejecutivo'
  ) {
    return true;
  }

  if (v1 === v2) return true;
  if (v1.includes(v2) || v2.includes(v1)) return true;

  // Comparar tokens (ej: "Anyelo" y "Anyelo Hernández")
  const tokens1 = v1.split(/\s+/).filter((t) => t.length > 2);
  const tokens2 = v2.split(/\s+/).filter((t) => t.length > 2);
  const intersect = tokens1.filter((t) => tokens2.includes(t));
  if (intersect.length >= 1) return true;

  return false;
}

/**
 * Valida si una fecha/hora cae dentro del horario laboral de lunes a viernes (8:00 AM a 6:00 PM)
 */
export function estaEnHorarioLaboral(
  fechaIso: string,
  horaInicioStr = '08:00',
  horaFinStr = '18:00'
): boolean {
  const d = new Date(fechaIso);
  if (isNaN(d.getTime())) return true;

  // Lunes a Viernes: getDay() 1 = Lunes, 5 = Viernes. (0 = Domingo, 6 = Sábado)
  const diaSemana = d.getDay();
  if (diaSemana === 0 || diaSemana === 6) {
    return false; // Fin de semana
  }

  const [hIni, mIni] = horaInicioStr.split(':').map(Number);
  const [hFin, mFin] = horaFinStr.split(':').map(Number);

  const minutosDia = d.getHours() * 60 + d.getMinutes();
  const inicioMinutos = (hIni || 8) * 60 + (mIni || 0);
  const finMinutos = (hFin || 18) * 60 + (mFin || 0);

  return minutosDia >= inicioMinutos && minutosDia <= finMinutos;
}

/**
 * Calcula el límite máximo permitido para llamar a un Lead No Calificado.
 * Regla de negocio:
 * 1. Desde la hora en que ingresa el lead, el vendedor tiene 1 hora para llamarle.
 * 2. Si entró fuera de horario laboral (ej: después de las 6:00 PM o fin de semana):
 *    - El vendedor tiene chance de llamarle al siguiente día hábil hasta las 9:00 AM.
 *    - Si es viernes en la noche o fin de semana, el siguiente día hábil es el lunes hasta las 9:00 AM.
 */
export function calcularLimiteLlamadaNoCalificado(
  fechaIngresoIso: string,
  horaLaboralInicio = '08:00',
  horaLaboralFin = '18:00'
): { fechaLimite: Date; dentroDeHorarioLaboral: boolean; plazoDescripcion: string } {
  const ingreso = new Date(fechaIngresoIso);
  if (isNaN(ingreso.getTime())) {
    const ahora = new Date();
    return {
      fechaLimite: new Date(ahora.getTime() + 60 * 60 * 1000),
      dentroDeHorarioLaboral: true,
      plazoDescripcion: '1 hora (defecto)',
    };
  }

  const enHorario = estaEnHorarioLaboral(fechaIngresoIso, horaLaboralInicio, horaLaboralFin);

  if (enHorario) {
    // Si entró en horario laboral: exactamente 1 hora después
    const limite = new Date(ingreso.getTime() + 60 * 60 * 1000);
    return {
      fechaLimite: limite,
      dentroDeHorarioLaboral: true,
      plazoDescripcion: '1 hora (entró en horario laboral)',
    };
  }

  // Fuera de horario laboral: Siguiente día hábil a las 9:00 AM
  const limite = new Date(ingreso);
  const diaSemana = ingreso.getDay(); // 0: Dom, 1: Lun, ..., 5: Vie, 6: Sab

  if (diaSemana === 5) {
    // Viernes fuera de horario -> Lunes a las 9:00 AM (+3 días)
    limite.setDate(limite.getDate() + 3);
  } else if (diaSemana === 6) {
    // Sábado -> Lunes a las 9:00 AM (+2 días)
    limite.setDate(limite.getDate() + 2);
  } else if (diaSemana === 0) {
    // Domingo -> Lunes a las 9:00 AM (+1 día)
    limite.setDate(limite.getDate() + 1);
  } else {
    // Lunes a Jueves fuera de horario:
    const minutosDia = ingreso.getHours() * 60 + ingreso.getMinutes();
    const [hFin, mFin] = horaLaboralFin.split(':').map(Number);
    const finMinutos = (hFin || 18) * 60 + (mFin || 0);

    if (minutosDia > finMinutos) {
      // Después de las 6:00 PM -> Mañana a las 9:00 AM
      limite.setDate(limite.getDate() + 1);
    }
    // Si entró antes de las 8:00 AM del mismo día hábil -> Hoy a las 9:00 AM (sin cambiar fecha)
  }

  limite.setHours(9, 0, 0, 0);

  return {
    fechaLimite: limite,
    dentroDeHorarioLaboral: false,
    plazoDescripcion: 'Hasta las 9:00 AM del siguiente día hábil',
  };
}

/**
 * Realiza el cruce entre una lista de citas/leads y las llamadas de todos los canales
 * (PBX, Celular, WhatsApp, Teams).
 *
 * Soporta dos modos:
 * 1. Leads Calificados: Ventana de cita agendada (+/- 5 minutos).
 * 2. Leads No Calificados: Regla de 1 hora o hasta las 9:00 AM del siguiente día hábil.
 */
export function ejecutarCruceAuditoria(
  citas: Cita[],
  llamadas: Llamada[],
  parametros: ParametrosAuditoria
): CruceAuditoria[] {
  const cruces: CruceAuditoria[] = [];
  const llamadasUsadas = new Set<string>();

  citas.forEach((cita) => {
    const esNoCalificado = cita.tipo_lead === 'no_calificados';
    const fechaCita = new Date(cita.fecha_hora_programada);
    const esFechaValida = !isNaN(fechaCita.getTime());

    // 1. Buscar todas las llamadas dirigidas al prospecto
    const llamadasProspecto = llamadas.filter((call) => {
      // A. Coincidencia por teléfono
      const matchTel = coincideTelefono(call.telefono_marcado, cita.prospecto_telefono);

      // B. Coincidencia por código de prospecto (ej: LD709, LD619)
      const codCita = String(cita.codigo_prospecto || '').trim().toLowerCase();
      const codCall = String(call.telefono_marcado || '').trim().toLowerCase();
      const matchCodigo = Boolean(
        codCita &&
        (codCall === codCita ||
         (call.notas_llamada && call.notas_llamada.toLowerCase().includes(codCita)) ||
         (call.prospecto_nombre && call.prospecto_nombre.toLowerCase().includes(codCita)))
      );

      // C. Coincidencia por nombre exacto
      const matchNombre = Boolean(
        cita.prospecto_nombre &&
        call.prospecto_nombre &&
        cita.prospecto_nombre.trim().toLowerCase() === call.prospecto_nombre.trim().toLowerCase()
      );

      return matchTel || matchCodigo || matchNombre;
    });

    // 2. Si es No Calificado: Evaluar regla de 1 hora o siguiente día hábil 9:00 AM
    if (esNoCalificado) {
      const { fechaLimite, dentroDeHorarioLaboral, plazoDescripcion } =
        calcularLimiteLlamadaNoCalificado(
          cita.fecha_hora_programada,
          parametros.horario_laboral_inicio || '08:00',
          parametros.horario_laboral_fin || '18:00'
        );

      // Buscar si se realizó alguna llamada posterior a la creación del lead
      let mejorLlamada: Llamada | undefined;
      let mejorFechaCall: Date | null = null;

      // Priorizar llamadas realizadas por el asesor asignado (usuario/extensión/celular)
      const llamadasMismoAsesor = llamadasProspecto.filter((c) =>
        coincideVendedor(cita.vendedor_nombre, c.vendedor_nombre)
      );
      const poolLlamadas = llamadasMismoAsesor.length > 0 ? llamadasMismoAsesor : llamadasProspecto;

      // Ordenar llamadas del prospecto cronológicamente para evaluar la primera respuesta
      const llamadasOrdenadas = [...poolLlamadas].sort((a, b) => {
        return new Date(a.fecha_hora_inicio).getTime() - new Date(b.fecha_hora_inicio).getTime();
      });

      for (const c of llamadasOrdenadas) {
        const fCall = new Date(c.fecha_hora_inicio);
        if (!isNaN(fCall.getTime())) {
          // Si la llamada fue después de la hora de ingreso (o hasta 5 min antes por sincronización)
          if (fCall.getTime() >= fechaCita.getTime() - 5 * 60 * 1000) {
            mejorLlamada = c;
            mejorFechaCall = fCall;
            break;
          }
        }
      }

      // Si no hay posterior, tomar la más cercana
      if (!mejorLlamada && llamadasProspecto.length > 0) {
        mejorLlamada = llamadasProspecto[0];
        mejorFechaCall = new Date(mejorLlamada.fecha_hora_inicio);
      }

      if (mejorLlamada && mejorFechaCall) {
        llamadasUsadas.add(mejorLlamada.id);

        // Comparar hora de la llamada con la fecha límite
        const diffMinutosDesdeIngreso = Math.round(
          (mejorFechaCall.getTime() - fechaCita.getTime()) / (1000 * 60)
        );
        const sePasoDelLimite = mejorFechaCall.getTime() > fechaLimite.getTime();

        let estado: EstadoCumplimiento = 'A_TIEMPO';
        let explicacion = '';

        if (sePasoDelLimite) {
          const minutosTarde = Math.round(
            (mejorFechaCall.getTime() - fechaLimite.getTime()) / (1000 * 60)
          );
          estado = minutosTarde > 30 ? 'TARDE_GRAVE' : 'TARDE_LEVE';
          explicacion = `Llamó tarde: se contactó ${minutosTarde} min después del límite permitido (${plazoDescripcion}).`;
        } else {
          estado = 'A_TIEMPO';
          explicacion = `A tiempo: llamado en ${diffMinutosDesdeIngreso} min desde ingreso (${plazoDescripcion}) por ${mejorLlamada.canal_tipo || mejorLlamada.proveedor}.`;
        }

        cruces.push({
          id: `cruce-${cita.id}`,
          cita,
          llamada: mejorLlamada,
          vendedor_id: cita.vendedor_id,
          vendedor_nombre: cita.vendedor_nombre,
          prospecto_nombre: cita.prospecto_nombre,
          telefono: cita.prospecto_telefono,
          pais: cita.pais || 'SV',
          fecha_cita: cita.fecha_hora_programada,
          fecha_llamada: mejorLlamada.fecha_hora_inicio,
          desfase_minutos: diffMinutosDesdeIngreso,
          duracion_llamada_segundos: mejorLlamada.duracion_segundos,
          estado_cumplimiento: estado,
          explicacion,
          canal_utilizado: mejorLlamada.canal_tipo || mejorLlamada.proveedor,
          fuera_de_horario: !dentroDeHorarioLaboral,
        });
      } else {
        // No llamó aún
        const esFutura = esFechaProxima(cita.fecha_hora_programada);
        const estado: EstadoCumplimiento = esFutura ? 'PENDIENTE' : 'NO_LLAMO';
        cruces.push({
          id: `cruce-${cita.id}`,
          cita,
          vendedor_id: cita.vendedor_id,
          vendedor_nombre: cita.vendedor_nombre,
          prospecto_nombre: cita.prospecto_nombre,
          telefono: cita.prospecto_telefono,
          pais: cita.pais || 'SV',
          fecha_cita: cita.fecha_hora_programada,
          estado_cumplimiento: estado,
          explicacion: esFutura
            ? `Lead pendiente de contactar (${cita.fecha_hora_programada.slice(0, 10)}). Fecha próxima (no hoy o en el pasado).`
            : `No se encontró llamada al número ${cita.prospecto_telefono || 'sin teléfono'}. Plazo límite era: ${plazoDescripcion}.`,
          fuera_de_horario: !dentroDeHorarioLaboral,
        });
      }

      return;
    }

    // 3. Leads Calificados: Ventana pactada (+/- 5 minutos, o llamadas del mismo día)
    let mejorLlamada: Llamada | undefined;
    let menorDiferenciaMs = Infinity;

    // Priorizar llamadas realizadas por el asesor asignado al lead (por usuario, extensión o celular)
    const llamadasMismoAsesor = llamadasProspecto.filter((c) =>
      coincideVendedor(cita.vendedor_nombre, c.vendedor_nombre)
    );
    const poolLlamadas = llamadasMismoAsesor.length > 0 ? llamadasMismoAsesor : llamadasProspecto;

    const fProg =
      cita.fecha_agendada ||
      cita.fecha_creado ||
      (cita.fecha_hora_programada ? cita.fecha_hora_programada.slice(0, 10) : '');

    // Buscar si hay llamadas el MISMO DÍA agendado
    const llamadasMismoDia = poolLlamadas.filter((c) => {
      const fCall = c.fecha_hora_inicio ? c.fecha_hora_inicio.slice(0, 10) : '';
      return fCall && fCall === fProg;
    });

    if (llamadasMismoDia.length > 0) {
      llamadasMismoDia.forEach((candidata) => {
        const fechaLlamada = new Date(candidata.fecha_hora_inicio);
        const diffMs = esFechaValida && !isNaN(fechaLlamada.getTime())
          ? Math.abs(fechaLlamada.getTime() - fechaCita.getTime())
          : 0;

        if (diffMs < menorDiferenciaMs) {
          menorDiferenciaMs = diffMs;
          mejorLlamada = candidata;
        }
      });
    } else if (poolLlamadas.length > 0) {
      // Se llamó pero en una fecha / día diferente al agendado
      mejorLlamada = poolLlamadas[0];
    }

    const dentroDeHorarioLaboral = estaEnHorarioLaboral(
      cita.fecha_hora_programada,
      parametros.horario_laboral_inicio || '08:00',
      parametros.horario_laboral_fin || '18:00'
    );

    if (mejorLlamada) {
      llamadasUsadas.add(mejorLlamada.id);
      const fechaLlamada = new Date(mejorLlamada.fecha_hora_inicio);
      const fCallStr = mejorLlamada.fecha_hora_inicio ? mejorLlamada.fecha_hora_inicio.slice(0, 10) : '';

      // Si la llamada fue en un día diferente al día pactado
      if (fProg && fCallStr && fCallStr !== fProg) {
        cruces.push({
          id: `cruce-${cita.id}`,
          cita,
          llamada: mejorLlamada,
          vendedor_id: cita.vendedor_id,
          vendedor_nombre: cita.vendedor_nombre,
          prospecto_nombre: cita.prospecto_nombre,
          telefono: cita.prospecto_telefono,
          pais: cita.pais || 'SV',
          fecha_cita: cita.fecha_hora_programada,
          fecha_llamada: mejorLlamada.fecha_hora_inicio,
          desfase_minutos: undefined,
          duracion_llamada_segundos: mejorLlamada.duracion_segundos,
          estado_cumplimiento: 'LLAMO_OTRO_DIA',
          explicacion: `Llamó otro día: la cita estaba pactada para el ${fProg} y la llamada se realizó el ${fCallStr} por ${mejorLlamada.canal_tipo || mejorLlamada.proveedor}.`,
          canal_utilizado: mejorLlamada.canal_tipo || mejorLlamada.proveedor,
          fuera_de_horario: !dentroDeHorarioLaboral,
        });
        return;
      }

      // Desfase en minutos (mismo día)
      const desfaseMinutos = esFechaValida && !isNaN(fechaLlamada.getTime())
        ? Math.round((fechaLlamada.getTime() - fechaCita.getTime()) / (1000 * 60))
        : 0;

      let estado: EstadoCumplimiento = 'A_TIEMPO';
      let explicacion = '';

      const tolAntes = parametros.tolerancia_anticipacion_minutos || 5;
      const tolDespues = parametros.tolerancia_retraso_a_tiempo_minutos || 5;
      const umbralGrave = parametros.umbral_retraso_grave_minutos || 15;

      if (desfaseMinutos > umbralGrave) {
        estado = 'TARDE_GRAVE';
        explicacion = `Retraso severo: llamó ${desfaseMinutos} min después de la hora pactada.`;
      } else if (desfaseMinutos > tolDespues) {
        estado = 'TARDE_LEVE';
        explicacion = `Llamó tarde (+${desfaseMinutos} min, tolerancia max: +${tolDespues} min).`;
      } else if (desfaseMinutos < -tolAntes) {
        estado = 'ADELANTADA';
        explicacion = `Llamó antes (${Math.abs(desfaseMinutos)} min de anticipación, tolerancia max: -${tolAntes} min).`;
      } else {
        estado = 'A_TIEMPO';
        const detalle =
          desfaseMinutos === 0
            ? 'exacto en punto'
            : desfaseMinutos > 0
            ? `+${desfaseMinutos} min después (dentro de tolerancia ±5 min)`
            : `${desfaseMinutos} min antes (dentro de tolerancia ±5 min)`;
        explicacion = `A tiempo: ${detalle} por ${mejorLlamada.canal_tipo || mejorLlamada.proveedor}.`;
      }

      cruces.push({
        id: `cruce-${cita.id}`,
        cita,
        llamada: mejorLlamada,
        vendedor_id: cita.vendedor_id,
        vendedor_nombre: cita.vendedor_nombre,
        prospecto_nombre: cita.prospecto_nombre,
        telefono: cita.prospecto_telefono,
        pais: cita.pais || 'SV',
        fecha_cita: cita.fecha_hora_programada,
        fecha_llamada: mejorLlamada.fecha_hora_inicio,
        desfase_minutos: desfaseMinutos,
        duracion_llamada_segundos: mejorLlamada.duracion_segundos,
        estado_cumplimiento: estado,
        explicacion,
        canal_utilizado: mejorLlamada.canal_tipo || mejorLlamada.proveedor,
        fuera_de_horario: !dentroDeHorarioLaboral,
      });
    } else {
      // Cita sin llamada
      const esFutura = esFechaProxima(cita.fecha_agendada || cita.fecha_hora_programada);
      const estado: EstadoCumplimiento = esFutura ? 'PENDIENTE' : 'NO_LLAMO';
      const fProg = cita.fecha_agendada || cita.fecha_hora_programada.slice(0, 10);
      const explicacion = esFutura
        ? `Cita agendada pendiente (${fProg}). Fecha próxima (no hoy o en el pasado). Aún no vence la reunión.`
        : `No se encontró llamada al teléfono ${cita.prospecto_telefono || 'sin número'} ni Teams a la hora agendada.`;

      cruces.push({
        id: `cruce-${cita.id}`,
        cita,
        vendedor_id: cita.vendedor_id,
        vendedor_nombre: cita.vendedor_nombre,
        prospecto_nombre: cita.prospecto_nombre,
        telefono: cita.prospecto_telefono,
        pais: cita.pais || 'SV',
        fecha_cita: cita.fecha_hora_programada,
        estado_cumplimiento: estado,
        explicacion,
        fuera_de_horario: !dentroDeHorarioLaboral,
      });
    }
  });

  return cruces;
}

/**
 * Calcula el resumen general de KPIs a partir de los cruces
 */
export function calcularResumenKPIs(cruces: CruceAuditoria[]): ResumenKPIs {
  const crucesConCita = cruces.filter((c) => !!c.cita);
  const totalCitas = crucesConCita.length;
  const totalLlamadas = cruces.filter((c) => !!c.llamada).length;

  const aTiempo = crucesConCita.filter((c) => c.estado_cumplimiento === 'A_TIEMPO').length;
  const tarde = crucesConCita.filter(
    (c) => c.estado_cumplimiento === 'TARDE_LEVE' || c.estado_cumplimiento === 'TARDE_GRAVE'
  ).length;
  const noLlamo = crucesConCita.filter((c) => c.estado_cumplimiento === 'NO_LLAMO').length;
  const pendientes = crucesConCita.filter((c) => c.estado_cumplimiento === 'PENDIENTE').length;
  const llamadaCorta = crucesConCita.filter(
    (c) => c.estado_cumplimiento === 'LLAMADA_CORTA'
  ).length;

  // Los pendientes no penalizan el cumplimiento porque su cita no ha llegado todavía
  const totalAuditables = totalCitas - pendientes;
  const tasaCumplimiento = totalAuditables > 0 ? Math.round((aTiempo / totalAuditables) * 100) : (totalCitas > 0 ? 100 : 0);

  let segTotales = 0;
  let sumaDesfases = 0;
  let conteoDesfases = 0;

  cruces.forEach((c) => {
    if (c.duracion_llamada_segundos) {
      segTotales += c.duracion_llamada_segundos;
    }
    if (c.desfase_minutos !== undefined && c.cita) {
      sumaDesfases += Math.abs(c.desfase_minutos);
      conteoDesfases++;
    }
  });

  const duracionTotalHoras = Number((segTotales / 3600).toFixed(1));
  const promedioTiempoRespuesta =
    conteoDesfases > 0 ? Number((sumaDesfases / conteoDesfases).toFixed(1)) : 0;

  const shows = crucesConCita.filter((c) => c.cita?.estado_cita === 'asistio').length;
  const tasaShows = totalCitas > 0 ? Math.round((shows / totalCitas) * 100) : 0;

  return {
    total_citas: totalCitas,
    total_llamadas: totalLlamadas,
    citas_llamadas_a_tiempo: aTiempo,
    tasa_cumplimiento_general: tasaCumplimiento,
    citas_no_atendidas: noLlamo,
    citas_pendientes: pendientes,
    citas_con_retraso: tarde,
    citas_llamada_insuficiente: llamadaCorta,
    duracion_total_llamadas_horas: duracionTotalHoras,
    promedio_tiempo_respuesta_minutos: promedioTiempoRespuesta,
    tasa_shows_efectivos: tasaShows,
  };
}

/**
 * Calcula métricas individuales por vendedor a partir de los cruces
 */
export function calcularMetricasPorVendedor(cruces: CruceAuditoria[]): VendedorMetricas[] {
  const agrupado = new Map<string, CruceAuditoria[]>();

  cruces.forEach((cruce) => {
    const key = cruce.vendedor_nombre || 'Sin Asignar';
    if (!agrupado.has(key)) {
      agrupado.set(key, []);
    }
    agrupado.get(key)!.push(cruce);
  });

  const metricas: VendedorMetricas[] = [];

  agrupado.forEach((lista, nombreVendedor) => {
    const conCita = lista.filter((c) => !!c.cita);
    const conLlamada = lista.filter((c) => !!c.llamada);

    const totalCitas = conCita.length;
    const totalLlamadas = conLlamada.length;

    const aTiempo = conCita.filter((c) => c.estado_cumplimiento === 'A_TIEMPO').length;
    const tardeLeve = conCita.filter((c) => c.estado_cumplimiento === 'TARDE_LEVE').length;
    const tardeGrave = conCita.filter((c) => c.estado_cumplimiento === 'TARDE_GRAVE').length;
    const noLlamo = conCita.filter((c) => c.estado_cumplimiento === 'NO_LLAMO').length;
    const pendientes = conCita.filter((c) => c.estado_cumplimiento === 'PENDIENTE').length;
    const corta = conCita.filter((c) => c.estado_cumplimiento === 'LLAMADA_CORTA').length;

    const auditables = totalCitas - pendientes;
    const tasaCumplimiento = auditables > 0 ? Math.round((aTiempo / auditables) * 100) : (totalCitas > 0 ? 100 : 0);

    let sumaDesfase = 0;
    let cantDesfase = 0;
    let segTotal = 0;

    conCita.forEach((c) => {
      if (c.desfase_minutos !== undefined) {
        sumaDesfase += c.desfase_minutos;
        cantDesfase++;
      }
    });

    conLlamada.forEach((c) => {
      segTotal += c.duracion_llamada_segundos || 0;
    });

    const promedioDesfase = cantDesfase > 0 ? Number((sumaDesfase / cantDesfase).toFixed(1)) : 0;
    const duracionPromedio =
      totalLlamadas > 0 ? Number((segTotal / totalLlamadas / 60).toFixed(1)) : 0;

    const asistidas = conCita.filter((c) => c.cita?.estado_cita === 'asistio').length;
    const tasaAsistencia = totalCitas > 0 ? Math.round((asistidas / totalCitas) * 100) : 0;

    let score: 'Excelente' | 'Bueno' | 'Aceptable' | 'En Riesgo' | 'Crítico' = 'Aceptable';
    if (tasaCumplimiento >= 85) score = 'Excelente';
    else if (tasaCumplimiento >= 70) score = 'Bueno';
    else if (tasaCumplimiento >= 50) score = 'Aceptable';
    else if (tasaCumplimiento >= 30) score = 'En Riesgo';
    else score = 'Crítico';

    metricas.push({
      vendedor_id: nombreVendedor.toLowerCase().replace(/\s+/g, '_'),
      vendedor_nombre: nombreVendedor,
      rol: 'Account Executive',
      total_citas: totalCitas,
      total_llamadas: totalLlamadas,
      citas_a_tiempo: aTiempo,
      citas_tarde_leve: tardeLeve,
      citas_tarde_grave: tardeGrave,
      citas_no_llamo: noLlamo,
      citas_pendientes: pendientes,
      citas_llamada_corta: corta,
      tasa_cumplimiento_pct: tasaCumplimiento,
      promedio_desfase_minutos: promedioDesfase,
      duracion_promedio_minutos: duracionPromedio,
      tasa_asistencia_pct: tasaAsistencia,
      score_rendimiento: score,
    });
  });

  return metricas.sort((a, b) => b.total_citas - a.total_citas);
}
