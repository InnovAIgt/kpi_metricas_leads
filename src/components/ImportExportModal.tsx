import React, { useState } from 'react';
import { X, Upload, Download, FileSpreadsheet, Check, AlertCircle } from 'lucide-react';
import { CruceAuditoria, Cita, Llamada } from '../types';

interface ImportExportModalProps {
  abierto: boolean;
  onCerrar: () => void;
  cruces: CruceAuditoria[];
  onImportarCitas: (citas: Cita[]) => void;
  onImportarLlamadas: (llamadas: Llamada[]) => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  abierto,
  onCerrar,
  cruces,
  onImportarCitas,
  onImportarLlamadas,
}) => {
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  if (!abierto) return null;

  // Exportar auditoría a CSV
  const handleExportarCSV = () => {
    const headers = [
      'ID Cruce',
      'Prospecto',
      'Telefono',
      'Vendedor',
      'Hora Cita Programada',
      'Hora Llamada Real',
      'Desfase Minutos',
      'Duracion Segundos',
      'Estado Cumplimiento',
      'Explicacion',
    ];

    const rows = cruces.map((c) => [
      `"${c.id}"`,
      `"${c.prospecto_nombre}"`,
      `"${c.telefono}"`,
      `"${c.vendedor_nombre}"`,
      `"${c.fecha_cita || ''}"`,
      `"${c.fecha_llamada || ''}"`,
      `"${c.desfase_minutos !== undefined ? c.desfase_minutos : ''}"`,
      `"${c.duracion_llamada_segundos !== undefined ? c.duracion_llamada_segundos : ''}"`,
      `"${c.estado_cumplimiento}"`,
      `"${c.explicacion.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `auditoria_kpi_citas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setMensaje({ tipo: 'exito', texto: 'Archivo CSV descargado exitosamente.' });
  };

  // Carga de archivo JSON o CSV
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, tipo: 'citas' | 'llamadas') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (file.name.endsWith('.json')) {
          const data = JSON.parse(text);
          if (Array.isArray(data)) {
            if (tipo === 'citas') {
              onImportarCitas(data as Cita[]);
              setMensaje({ tipo: 'exito', texto: `Se importaron ${data.length} citas correctamente.` });
            } else {
              onImportarLlamadas(data as Llamada[]);
              setMensaje({ tipo: 'exito', texto: `Se importaron ${data.length} llamadas correctamente.` });
            }
          } else {
            setMensaje({ tipo: 'error', texto: 'El archivo JSON debe contener un arreglo de objetos.' });
          }
        } else {
          setMensaje({ tipo: 'error', texto: 'Por favor sube un archivo .json válido o usa los datos de muestra.' });
        }
      } catch (err: any) {
        setMensaje({ tipo: 'error', texto: `Error al procesar el archivo: ${err.message}` });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Importar y Exportar Datos</h3>
              <p className="text-xs text-slate-400">
                Descarga informes de auditoría o sube registros propios
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 text-xs">
          {/* Feedback banner */}
          {mensaje && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 ${
                mensaje.tipo === 'exito'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              }`}
            >
              {mensaje.tipo === 'exito' ? (
                <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span>{mensaje.texto}</span>
            </div>
          )}

          {/* Export Section */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="font-bold text-white text-xs flex items-center gap-2">
              <Download className="h-4 w-4 text-indigo-400" />
              Exportar Informe de Auditoría Actual
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Descarga un archivo CSV compatible con Excel y Google Sheets que contiene el cruce de cada cita con su llamada respectiva, desfase en minutos y diagnóstico de cumplimiento.
            </p>
            <button
              onClick={handleExportarCSV}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Descargar CSV ({cruces.length} registros)</span>
            </button>
          </div>

          {/* Import Section */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <h4 className="font-bold text-white text-xs flex items-center gap-2">
              <Upload className="h-4 w-4 text-cyan-400" />
              Cargar Archivos Externos (JSON)
            </h4>
            <p className="text-[11px] text-slate-400">
              Carga tus propios datasets de citas o llamadas para procesarlos al instante con el motor de cruce:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <label className="p-3 border border-slate-700 hover:border-slate-600 rounded-xl bg-slate-900/60 cursor-pointer block text-center">
                <span className="text-indigo-300 font-semibold block text-xs">Cargar Citas JSON</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Click para seleccionar</span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, 'citas')}
                />
              </label>

              <label className="p-3 border border-slate-700 hover:border-slate-600 rounded-xl bg-slate-900/60 cursor-pointer block text-center">
                <span className="text-cyan-300 font-semibold block text-xs">Cargar Llamadas JSON</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Click para seleccionar</span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, 'llamadas')}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onCerrar}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
