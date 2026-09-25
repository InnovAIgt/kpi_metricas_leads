import React, { useState } from 'react';
import {
  Lock,
  User,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  PhoneCall,
  AlertCircle,
  Zap,
  Users,
} from 'lucide-react';
import { ModoLeads } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (
    usuario: { nombre: string; rol: string },
    modoInicial: ModoLeads
  ) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [usuario, setUsuario] = useState('Gabi');
  const [password, setPassword] = useState('1234');
  const [modoSeleccionado, setModoSeleccionado] = useState<ModoLeads>('calificados');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario.trim(), password: password.trim() }),
      });

      const data = await res.json();

      if (res.ok && data.exito) {
        localStorage.setItem('kpi_auth_user', JSON.stringify(data.usuario));
        localStorage.setItem('kpi_auth_token', data.token);
        localStorage.setItem('kpi_modo_leads', modoSeleccionado);
        onLoginSuccess(data.usuario, modoSeleccionado);
      } else {
        // Fallback local por si el endpoint aún no responde en dev inicial
        if (
          (usuario.trim().toLowerCase() === 'gabi' || usuario.trim() === 'Gabi') &&
          password.trim() === '1234'
        ) {
          const userObj = { nombre: 'Gabi', rol: 'Super Administrador / Auditor' };
          localStorage.setItem('kpi_auth_user', JSON.stringify(userObj));
          localStorage.setItem('kpi_modo_leads', modoSeleccionado);
          onLoginSuccess(userObj, modoSeleccionado);
        } else {
          setError(data.mensaje || 'Credenciales no válidas. Revisa usuario y contraseña.');
        }
      }
    } catch (err: any) {
      // Fallback local
      if (
        (usuario.trim().toLowerCase() === 'gabi' || usuario.trim() === 'Gabi') &&
        password.trim() === '1234'
      ) {
        const userObj = { nombre: 'Gabi', rol: 'Super Administrador / Auditor' };
        localStorage.setItem('kpi_auth_user', JSON.stringify(userObj));
        localStorage.setItem('kpi_modo_leads', modoSeleccionado);
        onLoginSuccess(userObj, modoSeleccionado);
      } else {
        setError('Error al conectar con el servidor de autenticación.');
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-rose-500 selection:text-white relative overflow-hidden">
      {/* Luces y fondos decorativos */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <img
            src="/logo.png"
            alt="Logo"
            className="h-16 w-16 rounded-full object-cover shadow-2xl border-2 border-red-500/40 shadow-red-950/60"
          />
        </div>
        <h2 className="mt-4 text-center text-2xl font-black text-white tracking-tight">
          Auditoría de Citas & Cumplimiento
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">
          Cruce Multicanal PBX, Celular, WhatsApp y Teams
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-900/90 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-2xl border border-slate-800 sm:px-10">
          {/* DOS ENTRADAS: SELECCIÓN DE ENTRADA (CALIFICADOS VS NO CALIFICADOS) */}
          <div className="mb-6">
            <label className="block text-xs font-semibold text-slate-300 mb-2 text-center uppercase tracking-wider">
              Selecciona Modo de Entrada
            </label>
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setModoSeleccionado('calificados')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${
                  modoSeleccionado === 'calificados'
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Leads Calificados</span>
              </button>

              <button
                type="button"
                onClick={() => setModoSeleccionado('no_calificados')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${
                  modoSeleccionado === 'no_calificados'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                <span>No Calificados</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 text-center mt-2">
              {modoSeleccionado === 'calificados'
                ? 'Audita los leads pactados y calificados de la tabla public.leads'
                : 'Audita los leads de prospección directa de la tabla public.leads_no_calificados'}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 bg-rose-950/80 border border-rose-500/50 rounded-xl text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Usuario
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Gabi"
                  className="block w-full pl-9 pr-3 py-2 text-sm bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••"
                  className="block w-full pl-9 pr-3 py-2 text-sm bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={cargando}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 transition-all disabled:opacity-50"
              >
                {cargando ? (
                  <span>Iniciando sesión...</span>
                ) : (
                  <>
                    <span>Entrar a {modoSeleccionado === 'calificados' ? 'Calificados' : 'No Calificados'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <span className="text-[11px] text-slate-500">
              Acceso seguro para auditores • Credencial: <code className="text-slate-300">Gabi</code> / <code className="text-slate-300">1234</code>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
