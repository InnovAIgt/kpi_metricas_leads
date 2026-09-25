import React from 'react';
import {
  PhoneCall,
  Calendar,
  RefreshCw,
  Sliders,
  Database,
  HelpCircle,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  LogOut,
  User,
} from 'lucide-react';
import { FiltroFecha, SupabaseConfig, ModoLeads } from '../types';

interface HeaderProps {
  filtroFecha: FiltroFecha;
  setFiltroFecha: (f: FiltroFecha) => void;
  onSincronizar: () => void;
  sincronizando: boolean;
  supabaseConfig: SupabaseConfig;
  onAbrirParametros: () => void;
  onAbrirConfigSupabase?: () => void;
  onLogout: () => void;
  usuario?: { nombre: string; rol: string } | null;
  modoLeads?: ModoLeads;
  onAlternarModo?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  filtroFecha,
  setFiltroFecha,
  onSincronizar,
  sincronizando,
  supabaseConfig,
  onAbrirParametros,
  onAbrirConfigSupabase,
  onLogout,
  usuario,
  modoLeads,
  onAlternarModo,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Título & Estado */}
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Logo"
              className="h-10 w-10 rounded-full object-cover shadow-md border border-slate-700/80 shadow-red-950/30"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">
                  Auditoría de Citas & Cumplimiento Multicanal
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  ±5 Minutos
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Horario Laboral: 8:00 AM - 6:00 PM (Lun-Vie) • Cruce PBX, Celular, WhatsApp y Teams
              </p>
            </div>
          </div>

          {/* Acciones & Filtros */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Indicador y Selector de Modo de Acceso */}
            {modoLeads && (
              <button
                type="button"
                onClick={onAlternarModo}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all cursor-pointer shadow-sm ${
                  modoLeads === 'calificados'
                    ? 'bg-amber-950/70 border-amber-500/50 text-amber-200 hover:bg-amber-900/60'
                    : 'bg-cyan-950/70 border-cyan-500/50 text-cyan-200 hover:bg-cyan-900/60'
                }`}
                title="Haga clic para alternar entre Leads Calificados y No Calificados"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{modoLeads === 'calificados' ? 'Modo: Leads Calificados' : 'Modo: No Calificados'}</span>
              </button>
            )}

            {/* Estado Supabase y Acceso a Edge Function */}
            <button
              type="button"
              onClick={onAbrirConfigSupabase}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border bg-indigo-950/60 hover:bg-indigo-900/80 border-indigo-500/40 text-indigo-300 transition-all cursor-pointer shadow-sm group"
              title="Abrir modal de Edge Function y sincronización de datos de Septiembre"
            >
              <Database className="h-3.5 w-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
              <span className="font-semibold text-white">Edge Function</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30 font-medium">
                Septiembre
              </span>
            </button>

            {/* Selector de Fecha */}
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
              <button
                onClick={() => setFiltroFecha('este_mes')}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filtroFecha === 'este_mes'
                    ? 'bg-rose-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mes Actual
              </button>
              <button
                onClick={() => setFiltroFecha('hoy')}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filtroFecha === 'hoy'
                    ? 'bg-rose-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Hoy
              </button>
              <button
                onClick={() => setFiltroFecha('todos')}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filtroFecha === 'todos'
                    ? 'bg-rose-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Histórico
              </button>
            </div>

            {/* Botón Sincronizar */}
            <button
              onClick={onSincronizar}
              disabled={sincronizando}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-medium shadow-sm transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
              <span>{sincronizando ? 'Sincronizando...' : 'Sincronizar'}</span>
            </button>

            {/* Usuario y Logout */}
            {usuario && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/80 text-xs text-slate-300 border border-slate-700/60">
                  <User className="h-3 w-3 text-indigo-400" />
                  <span className="font-semibold text-white">{usuario.nombre}</span>
                </div>
                <button
                  onClick={onLogout}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 transition-colors"
                  title="Cerrar Sesión"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
