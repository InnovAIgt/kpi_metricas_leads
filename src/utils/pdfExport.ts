import jsPDF from 'jspdf';
import autoTable, { Styles } from 'jspdf-autotable';
import {
  ExcelSheetConfig,
  resolverColorSemantico,
  TINT_COLORS,
} from './excelExport';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^FF/i, '').replace('#', '').trim();
  if (clean.length !== 6) return [30, 41, 59];
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return [30, 41, 59];
  return [r, g, b];
}

// Helvetica estándar en jsPDF no soporta emojis Unicode; se limpian manteniendo el texto íntegro
function limpiarTextoPdf(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '-';
  let txt = String(valor)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Limpiar separador inicial si quedó huérfano tras remover emoji
  txt = txt.replace(/^[·•\-–—]+\s*/, '').trim();
  return txt || '-';
}

function formatearCeldaPdf(raw: unknown, numFmt?: string): string {
  if (raw === null || raw === undefined || raw === '') return '-';
  if (typeof raw === 'boolean') return raw ? 'Sí' : 'No';
  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    if (numFmt === '0%') {
      return `${Math.round(raw * 100)}%`;
    }
    return String(raw);
  }
  return limpiarTextoPdf(raw);
}

function dibujarBannerPagina(
  doc: jsPDF,
  title: string,
  subtitle?: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 24;
  const contentWidth = pageWidth - marginX * 2;

  // Banner título oscuro (#0F172A) igual que fila 1 en Excel
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(marginX, 22, contentWidth, 28, 4, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(255, 255, 255);
  const cleanTitle = limpiarTextoPdf(title);
  doc.text(cleanTitle, marginX + 10, 40, { maxWidth: contentWidth - 20 });

  let nextY = 54;
  if (subtitle) {
    doc.setFillColor(241, 245, 249);
    doc.rect(marginX, 52, contentWidth, 18, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.8);
    doc.setTextColor(51, 65, 85);
    doc.text(limpiarTextoPdf(subtitle), marginX + 10, 64, {
      maxWidth: contentWidth - 20,
    });
    nextY = 74;
  }

  return nextY;
}

export async function exportarLibroPdf(
  fileName: string,
  sheets: ExcelSheetConfig<any>[]
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 24;

  sheets.forEach((sheet, idx) => {
    if (idx > 0) doc.addPage();

    const startY = dibujarBannerPagina(doc, sheet.title, sheet.subtitle);
    const numCols = Math.max(1, sheet.columns.length);
    const accentRgb = hexToRgb(sheet.accentHex || '1E293B');

    const head = [sheet.columns.map((c) => limpiarTextoPdf(c.header))];

    const rawStrings: string[][] = [];
    const body = sheet.rows.map((row) => {
      const rowRawStrs: string[] = [];
      const cells = sheet.columns.map((col) => {
        const raw = col.value ? col.value(row) : (row as any)?.[col.key];
        rowRawStrs.push(String(raw ?? ''));
        return formatearCeldaPdf(raw, col.numFmt);
      });
      rawStrings.push(rowRawStrs);
      return cells;
    });

    const foot = sheet.totalsRow
      ? [
          sheet.columns.map((col) => {
            const raw = sheet.totalsRow?.[col.key];
            if (raw === undefined || raw === null || raw === '') return '';
            return formatearCeldaPdf(raw, col.numFmt);
          }),
        ]
      : undefined;

    // Tamaño de fuente responsivo para que tablas anchas calcen limpiamente
    const baseFontSize = numCols >= 13 ? 6.6 : numCols >= 10 ? 7.2 : 8;
    const headFontSize = numCols >= 13 ? 6.8 : numCols >= 10 ? 7.4 : 8.2;

    const columnStyles: Record<number, Partial<Styles>> = {};
    const totalDeclaredWidth = sheet.columns.reduce(
      (acc, c) => acc + (c.width || 16),
      0
    );
    const usableWidth = pageWidth - marginX * 2;

    sheet.columns.forEach((col, colIdx) => {
      const halign =
        col.align ||
        (col.numFmt === '0%' ? 'right' : 'left');
      const proportionalWidth =
        ((col.width || 16) / Math.max(1, totalDeclaredWidth)) * usableWidth;
      columnStyles[colIdx] = {
        halign,
        cellWidth: Math.max(28, proportionalWidth),
      };
    });

    autoTable(doc, {
      startY,
      margin: { left: marginX, right: marginX, top: 24, bottom: 28 },
      head,
      body,
      foot,
      showFoot: 'lastPage',
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: baseFontSize,
        cellPadding: numCols >= 12 ? 3 : 4,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.4,
        valign: 'middle',
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: accentRgb,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: headFontSize,
        halign: 'center',
        valign: 'middle',
      },
      footStyles: {
        fillColor: [226, 232, 240],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: baseFontSize,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles,
      didParseCell: (data) => {
        const colDef = sheet.columns[data.column.index];
        if (!colDef) return;

        // Column Tints en encabezado y cuerpo (igual que en Excel)
        if (colDef.columnTint) {
          const tint = TINT_COLORS[colDef.columnTint];
          if (data.section === 'head') {
            data.cell.styles.fillColor = hexToRgb(tint.headerBg);
            data.cell.styles.textColor = [255, 255, 255];
          } else if (data.section === 'body') {
            data.cell.styles.fillColor = hexToRgb(tint.cellBg);
            data.cell.styles.textColor = hexToRgb(tint.textHex);
            data.cell.styles.fontStyle = 'bold';
          }
        }

        // Colores semánticos en cuerpo (Semáforo Verde/Amarillo/Rojo, Sí/No, Estados)
        if (data.section === 'body' && colDef.semantic) {
          const rawStr = rawStrings[data.row.index]?.[data.column.index] ?? String(data.cell.raw ?? '');
          const sem = resolverColorSemantico(rawStr, colDef.semantic);
          if (sem) {
            data.cell.styles.fillColor = hexToRgb(sem.fillHex);
            data.cell.styles.textColor = hexToRgb(sem.textHex);
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
  });

  // Pie de página global con numeración
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'KPI Auditoría Multicanal · Reporte Corporativo',
      marginX,
      pageHeight - 12
    );
    doc.text(
      `Página ${p} de ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 12,
      { align: 'right' }
    );
  }

  const safeName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  doc.save(safeName);
}

export async function exportarTablaAPdf<T = any>(
  fileName: string,
  config: ExcelSheetConfig<T>
): Promise<void> {
  return exportarLibroPdf(fileName, [config]);
}
