import React, { createContext, useContext, useState, useEffect } from 'react';

export type Tema = 'dark' | 'light';

interface ThemeContextType {
  tema: Tema;
  esOscuro: boolean;
  alternarTema: () => void;
  setTema: (tema: Tema) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  tema: 'dark',
  esOscuro: true,
  alternarTema: () => {},
  setTema: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tema, setTemaState] = useState<Tema>(() => {
    try {
      const saved = localStorage.getItem('kpi_tema');
      if (saved === 'light' || saved === 'dark') return saved;
      // Por defecto oscuro (estilo corporativo original), con opción de cambiar a claro
      return 'dark';
    } catch (_) {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('kpi_tema', tema);
    } catch (_) {}

    const root = document.documentElement;
    if (tema === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      root.style.colorScheme = 'light';
    }
  }, [tema]);

  const alternarTema = () => {
    setTemaState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTema = (nuevo: Tema) => {
    setTemaState(nuevo);
  };

  return (
    <ThemeContext.Provider value={{ tema, esOscuro: tema === 'dark', alternarTema, setTema }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
