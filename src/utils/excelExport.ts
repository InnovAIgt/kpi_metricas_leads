import ExcelJS from 'exceljs';

export interface ExcelColumn<T = any> {
  header: string;
  key: string;
  width?: number;
  value?: (row: T) => string | number | boolean | null | undefined;
  numFmt?: string;
  align?: 'left' | 'center' | 'right';
  semantic?: 'status' | 'boolean' | 'semaforo';
  columnTint?: 'verde' | 'amarillo' | 'rojo';
  wrapText?: boolean;
}

export interface ExcelSheetConfig<T = any> {
  name: string;
  title: string;
  subtitle?: string;
  accentHex?: string; // Default: 1E293B (Slate 800)
  columns: ExcelColumn<T>[];
  rows: T[];
  totalsRow?: Record<string, string | number>;
}

function sanitizarNombreHoja(nombre: string, fallback: string, usados: Set<string>): string {
  let limpio = String(nombre || fallback)
    .replace(/[*?:\\/\[\]]/g, '')
    .trim()
    .slice(0, 31);
  if (!limpio) limpio = fallback;
  let final = limpio;
  let contador = 2;
  while (usados.has(final.toLowerCase())) {
    const sufijo = ` ${contador++}`;
    final = `${limpio.slice(0, 31 - sufijo.length)}${sufijo}`;
  }
  usados.add(final.toLowerCase());
  return final;
}

export function resolverColorSemantico(
  valorStr: string,
  tipo: 'status' | 'boolean' | 'semaforo'
): { fillHex: string; textHex: string } | null {
  const v = valorStr.toLowerCase().trim();
  if (!v) return null;

  if (tipo === 'boolean') {
    if (v === 'sí' || v === 'si' || v === 'true' || v === '1' || v === 'ok' || v === 'cumple') {
      return { fillHex: 'DCFCE7', textHex: '166534' };
    }
    if (v === 'no' || v === 'false' || v === '0') {
      return { fillHex: 'FEE2E2', textHex: '991B1B' };
    }
    return null;
  }

  // Semáforo explícito Verde / Amarillo / Rojo / No Llamó / Otro Día / Adelantada
  if (
    tipo === 'semaforo' ||
    v.includes('🟢') ||
    v.includes('🟡') ||
    v.includes('🔴') ||
    v.includes('⚫') ||
    v.includes('🟦') ||
    v.includes('🔵') ||
    v.includes('⚪')
  ) {
    if (v.includes('verde') || v.includes('🟢') || v.includes('a tiempo')) {
      return { fillHex: 'BBF7D0', textHex: '14532D' };
    }
    if (v.includes('amarillo') || v.includes('🟡') || v.includes('tarde leve') || v.includes('corta')) {
      return { fillHex: 'FEF08A', textHex: '854D0E' };
    }
    if (v.includes('rojo') || v.includes('🔴') || v.includes('tarde grave') || v.includes('en riesgo') || v.includes('crítico') || v.includes('critico')) {
      return { fillHex: 'FECACA', textHex: '991B1B' };
    }
    if (v.includes('⚫') || v.includes('no llamó') || v.includes('no llamo')) {
      return { fillHex: 'F3E8FF', textHex: '6B21A8' };
    }
    if (v.includes('otro día') || v.includes('otro dia') || v.includes('adelantada') || v.includes('🔵') || v.includes('🟦')) {
      return { fillHex: 'DBEAFE', textHex: '1E40AF' };
    }
    if (v.includes('pendiente') || v.includes('⚪')) {
      return { fillHex: 'E2E8F0', textHex: '334155' };
    }
  }

  // Tipificación de Horario de Ingreso
  if (v.includes('horario laboral')) {
    return { fillHex: 'DCFCE7', textHex: '166534' };
  }
  if (v.includes('viernes tarde')) {
    return { fillHex: 'FEF08A', textHex: '854D0E' };
  }
  if (v.includes('fin de semana')) {
    return { fillHex: 'DBEAFE', textHex: '1E40AF' };
  }
  if (v.includes('fuera de horario') || v.includes('noche')) {
    return { fillHex: 'EDE9FE', textHex: '5B21B6' };
  }

  // Semántico de estados (A Tiempo = Verde, Tarde Leve = Amarillo, Tarde Grave = Rojo, No Llamó = Morado)
  if (
    v.includes('a tiempo') ||
    v.includes('excelente') ||
    v.includes('llamó antes') ||
    (v.includes('contestada') && !v.includes('no contestada')) ||
    v === 'answered' ||
    v.includes('si se hizo y tiene evidencia') ||
    v.includes('sí se hizo y tiene evidencia')
  ) {
    return { fillHex: 'DCFCE7', textHex: '166534' };
  }

  if (
    v.includes('tarde leve') ||
    v.includes('retraso leve') ||
    v === 'tarde' ||
    v.includes('aceptable') ||
    v.includes('bueno') ||
    v.includes('sin evidencia') ||
    v.includes('ocupad') ||
    v.includes('busy')
  ) {
    return { fillHex: 'FEF08A', textHex: '854D0E' };
  }

  if (
    v.includes('tarde grave') ||
    v.includes('retraso grave') ||
    v.includes('no contestada') ||
    v.includes('en riesgo') ||
    v.includes('crítico') ||
    v.includes('critico') ||
    v.includes('fallida') ||
    v.includes('no se realizó')
  ) {
    return { fillHex: 'FECACA', textHex: '991B1B' };
  }

  if (v.includes('no llamó') || v.includes('no llamo')) {
    return { fillHex: 'F3E8FF', textHex: '6B21A8' };
  }

  if (
    v.includes('otro día') ||
    v.includes('otro dia') ||
    v.includes('adelantada') ||
    v.includes('teams')
  ) {
    return { fillHex: 'DBEAFE', textHex: '1E40AF' };
  }

  if (v.includes('corta') || v.includes('buzón') || v.includes('buzon')) {
    return { fillHex: 'FFEDD5', textHex: '9A3412' };
  }

  if (v.includes('pendiente')) {
    return { fillHex: 'F1F5F9', textHex: '475569' };
  }

  return null;
}

export const TINT_COLORS: Record<'verde' | 'amarillo' | 'rojo', { headerBg: string; cellBg: string; textHex: string }> = {
  verde: { headerBg: 'FF15803D', cellBg: 'FFF0FDF4', textHex: 'FF166534' },
  amarillo: { headerBg: 'FFCA8A04', cellBg: 'FFFEFCE8', textHex: 'FF854D0E' },
  rojo: { headerBg: 'FFB91C1C', cellBg: 'FFFEF2F2', textHex: 'FF991B1B' },
};

function construirHojaExcel<T>(
  workbook: ExcelJS.Workbook,
  config: ExcelSheetConfig<T>,
  nombreHoja: string
) {
  const ws = workbook.addWorksheet(nombreHoja, {
    views: [{ state: 'frozen', ySplit: config.subtitle ? 3 : 2 }],
    properties: { defaultRowHeight: 21 },
  });

  const numCols = Math.max(1, config.columns.length);
  const accentHex = (config.accentHex || '1E293B').replace('#', '').toUpperCase();

  // Fila 1: Banner Título
  const titleRow = ws.addRow([config.title]);
  ws.mergeCells(1, 1, 1, numCols);
  titleRow.height = 28;
  const titleCell = titleRow.getCell(1);
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  // Fila 2: Subtítulo con contexto de fechas/filtros
  let headerRowIdx = 2;
  if (config.subtitle) {
    const subRow = ws.addRow([config.subtitle]);
    ws.mergeCells(2, 1, 2, numCols);
    subRow.height = 20;
    const subCell = subRow.getCell(1);
    subCell.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF334155' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    headerRowIdx = 3;
  }

  // Fila de Encabezados
  const headerValues = config.columns.map((c) => c.header);
  const headerRow = ws.addRow(headerValues);
  headerRow.height = 26;
  headerRow.eachCell((cell, colNumber) => {
    const colDef = config.columns[colNumber - 1];
    const tint = colDef?.columnTint ? TINT_COLORS[colDef.columnTint] : null;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint ? tint.headerBg : `FF${accentHex}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF334155' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } },
    };
  });

  // AutoFilter en fila de encabezados
  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx, column: numCols },
  };

  // Rastrear anchos máximos para auto-fit
  const maxAnchos = config.columns.map((c) => Math.max(10, c.header.length + 4));

  // Filas de datos
  config.rows.forEach((row, rowIdx) => {
    const esZebra = rowIdx % 2 === 1;
    const valores = config.columns.map((col, colIdx) => {
      const raw = col.value ? col.value(row) : (row as any)?.[col.key];
      let val: string | number = '';
      if (raw === null || raw === undefined || raw === '') {
        val = '-';
      } else if (typeof raw === 'boolean') {
        val = raw ? 'Sí' : 'No';
      } else if (typeof raw === 'number' && !Number.isNaN(raw)) {
        val = raw;
      } else {
        val = String(raw).trim();
      }
      const len = String(val).length + 3;
      if (len > maxAnchos[colIdx]) maxAnchos[colIdx] = len;
      return val;
    });

    const dataRow = ws.addRow(valores);
    dataRow.height = config.columns.some((c) => c.wrapText) ? 30 : 21;

    dataRow.eachCell((cell, colNumber) => {
      const colDef = config.columns[colNumber - 1];
      const cellStr = String(cell.value ?? '');

      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colDef?.align || (typeof cell.value === 'number' ? 'right' : 'left'),
        wrapText: Boolean(colDef?.wrapText),
      };
      if (colDef?.numFmt && typeof cell.value === 'number') {
        cell.numFmt = colDef.numFmt;
      }

      const semanticColor = colDef?.semantic
        ? resolverColorSemantico(cellStr, colDef.semantic)
        : null;
      const tint = colDef?.columnTint ? TINT_COLORS[colDef.columnTint] : null;

      if (semanticColor) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${semanticColor.fillHex}` },
        };
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: true,
          color: { argb: `FF${semanticColor.textHex}` },
        };
      } else if (tint) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: tint.cellBg },
        };
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: true,
          color: { argb: tint.textHex },
        };
      } else if (esZebra) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // Fila opcional de TOTALES
  if (config.totalsRow) {
    const totalVals = config.columns.map((c) => {
      const v = config.totalsRow?.[c.key];
      return v === undefined || v === null ? '' : v;
    });
    const tRow = ws.addRow(totalVals);
    tRow.height = 24;
    tRow.eachCell((cell, colNumber) => {
      const colDef = config.columns[colNumber - 1];
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colDef?.align || (typeof cell.value === 'number' ? 'right' : 'left'),
      };
      if (colDef?.numFmt && typeof cell.value === 'number') {
        cell.numFmt = colDef.numFmt;
      }
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF334155' } },
        bottom: { style: 'double', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });
  }

  // Aplicar anchos calculados con límites limpios [10..52]
  config.columns.forEach((col, i) => {
    const column = ws.getColumn(i + 1);
    const width = col.width ?? Math.min(52, Math.max(10, maxAnchos[i]));
    column.width = width;
  });
}

async function descargarWorkbook(workbook: ExcelJS.Workbook, fileName: string): Promise<void> {
  const safeName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportarTablaAExcel<T = any>(
  fileName: string,
  config: ExcelSheetConfig<T>
): Promise<void> {
  return exportarLibroExcel(fileName, [config]);
}

export async function exportarLibroExcel(
  fileName: string,
  sheets: ExcelSheetConfig<any>[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KPI Auditoría Multicanal';
  workbook.created = new Date();

  const usados = new Set<string>();
  sheets.forEach((sheet, idx) => {
    const safeSheet = sanitizarNombreHoja(sheet.name, `Hoja ${idx + 1}`, usados);
    construirHojaExcel(workbook, sheet, safeSheet);
  });

  await descargarWorkbook(workbook, fileName);
}

export function formatearSubtituloExportacion(params: {
  fechaInicio?: string;
  fechaFin?: string;
  totalFilas: number;
  modo?: string;
  extra?: string;
}): string {
  const ahora = new Date();
  const fechaGen = ahora.toLocaleString('es-SV', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const rango =
    params.fechaInicio || params.fechaFin
      ? `${params.fechaInicio || 'Inicio'} al ${params.fechaFin || 'Hoy'}`
      : 'Histórico completo';
  const partes = [
    `Período: ${rango}`,
    params.modo ? `Vista: ${params.modo}` : null,
    `Registros exportados: ${params.totalFilas}`,
    params.extra || null,
    `Generado: ${fechaGen}`,
  ].filter(Boolean);
  return partes.join('  |  ');
}
