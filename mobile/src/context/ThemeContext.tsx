import AsyncStorage from 'expo-sqlite/kv-store';
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';

type Theme = 'light' | 'dark' | 'system';
type ThemeContextType = {
  theme: Theme;
  isDarkMode: boolean;
  toggleTheme: (newTheme: Theme) => void;
  colors: {
    background: string;
    card: string;
    text: string;
    textSecondary: string;
    border: string;
    primary: string;
    primarySoft: string;
    accent: string;
    danger: string;
    inputBackground: string;
    paper: string;
  };
};

const lightColors = {
  background: '#f4efe6',
  card: '#fffdf8',
  text: '#20323f',
  textSecondary: '#60707d',
  border: '#d9d1c4',
  primary: '#1e6f78',
  primarySoft: '#d7ebe7',
  accent: '#b96f3f',
  danger: '#b74936',
  inputBackground: '#fffaf1',
  paper: '#fff8ee',
};

const darkColors = {
  background: '#132028',
  card: '#1c2d36',
  text: '#f6f0e8',
  textSecondary: '#c6d4dc',
  border: '#34515e',
  primary: '#7dd3c6',
  primarySoft: '#1f3f45',
  accent: '#f0b07f',
  danger: '#ff8b78',
  inputBackground: '#203540',
  paper: '#243942',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [theme, setTheme] = useState<Theme>('system');
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('@theme');
        if (savedTheme) {
          setTheme(savedTheme as Theme);
        }
      } catch (error) {
        console.error('Error loading theme:', error);
      }
    };

    loadTheme();
  }, []);

  useEffect(() => {
    if (theme === 'system') {
      setIsDarkMode(systemColorScheme === 'dark');
    } else {
      setIsDarkMode(theme === 'dark');
    }
  }, [theme, systemColorScheme]);

  const toggleTheme = async (newTheme: Theme) => {
    setTheme(newTheme);
    try {
      await AsyncStorage.setItem('@theme', newTheme);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const colors = isDarkMode ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
