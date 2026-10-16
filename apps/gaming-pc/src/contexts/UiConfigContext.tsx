import React, { createContext, useContext, useEffect } from 'react';

export interface UiConfig {
  primaryColor?: string;
  accentColor?: string;
  backgroundImage?: string;
  logoUrl?: string;
  publicName?: string;
}

const UiConfigContext = createContext<UiConfig | null>(null);

export const useUiConfig = () => useContext(UiConfigContext);

export const UiConfigProvider: React.FC<{ config: UiConfig | null | undefined, children: React.ReactNode }> = ({ config, children }) => {
  useEffect(() => {
    if (config?.primaryColor) {
      document.documentElement.style.setProperty('--primary', config.primaryColor);
      document.documentElement.style.setProperty('--color-primary', config.primaryColor);
      document.documentElement.style.setProperty('--color-gold', config.primaryColor);
    } else {
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--color-primary');
      document.documentElement.style.removeProperty('--color-gold');
    }
    
    if (config?.accentColor) {
      document.documentElement.style.setProperty('--accent', config.accentColor);
      document.documentElement.style.setProperty('--color-accent', config.accentColor);
    } else {
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--color-accent');
    }
  }, [config]);

  return (
    <UiConfigContext.Provider value={config || null}>
      {children}
    </UiConfigContext.Provider>
  );
};
