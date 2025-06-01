import React, { useState, useEffect, ReactNode } from 'react';
import Layout from '@theme/Layout';
import DummyGraphPage from '@site/src/components/DummyGraphPage';
import { SketchPicker, ColorResult } from 'react-color';
import { argbFromHex, Hct, SchemeContent, hexFromArgb } from '@material/material-color-utilities';
import Translate, {translate} from '@docusaurus/Translate';
import styles from './index.module.css';

interface CorePalette {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
}

const initialSourceColor = '#992139';

const generateAndApplyTheme = (
  sourceColorHex: string, 
  isDark: boolean,
  constrastValue: number
): CorePalette => {
  const scheme = new SchemeContent(Hct.fromInt(argbFromHex(sourceColorHex)), isDark, constrastValue)

  return {
    primary: hexFromArgb(scheme.primary),
    onPrimary: hexFromArgb(scheme.onPrimary),
    primaryContainer: hexFromArgb(scheme.primaryContainer),
    onPrimaryContainer: hexFromArgb(scheme.onPrimaryContainer),
    secondary: hexFromArgb(scheme.secondary),
    onSecondary: hexFromArgb(scheme.onSecondary),
    secondaryContainer: hexFromArgb(scheme.secondaryContainer),
    onSecondaryContainer: hexFromArgb(scheme.onSecondaryContainer),
    tertiary: hexFromArgb(scheme.tertiary),
    onTertiary: hexFromArgb(scheme.onTertiary),
    tertiaryContainer: hexFromArgb(scheme.tertiaryContainer),
    onTertiaryContainer: hexFromArgb(scheme.onTertiaryContainer),
    error: hexFromArgb(scheme.error),
    onError: hexFromArgb(scheme.onError),
    errorContainer: hexFromArgb(scheme.errorContainer),
    onErrorContainer: hexFromArgb(scheme.onErrorContainer),
    background: hexFromArgb(scheme.background),
    onBackground: hexFromArgb(scheme.onBackground),
    surface: hexFromArgb(scheme.surface),
    onSurface: hexFromArgb(scheme.onSurface),
    surfaceVariant: hexFromArgb(scheme.surfaceVariant),
    onSurfaceVariant: hexFromArgb(scheme.onSurfaceVariant),
    outline: hexFromArgb(scheme.outline),
    outlineVariant: hexFromArgb(scheme.outlineVariant),
    surfaceContainerLowest: hexFromArgb(scheme.surfaceContainerLowest),
    surfaceContainerLow: hexFromArgb(scheme.surfaceContainerLow),
    surfaceContainer: hexFromArgb(scheme.surfaceContainer),
    surfaceContainerHigh: hexFromArgb(scheme.surfaceContainerHigh),
    surfaceContainerHighest: hexFromArgb(scheme.surfaceContainerHighest),
  };
};

// Define a type for the keys of colors we want to expose as pickers
type CoreColorRole = 'primary' | 'secondary' | 'tertiary' | 'error' | 'surface'; // 'surface' will represent neutral/background for picker simplicity

const generateThemeCssContent = (light: CorePalette, dark: CorePalette): string => {
  return `
/* Color Theme Schemes */
:root {
  /* Font */
  --gt-typescale-title-large: 700 1.5rem/1.4 'Interop', sans-serif;
  --gt-typescale-title-medium: 700 1.2rem/1.4 'Interop', sans-serif;
  --gt-typescale-title-small: 700 0.9rem/1.4 'Interop', sans-serif;
  --gt-typescale-body-large: 400 1rem/1.4 'Interop', sans-serif;
  --gt-typescale-body-medium: 400 0.8rem/1.4 'Interop', sans-serif;
  --gt-typescale-body-small: 400 0.7rem/1.4 'Interop', sans-serif;
  
  /* Elevation */
  --gt-elevation-level1: 0 2px 6px 0 rgba(0,0,0,0.24);
  --gt-elevation-level2: 0 4px 8px 0 rgba(0,0,0,0.48);
  --gt-shadow: rgba(0,0,0,0.08);
  --gt-hover-filter: brightness(0.92);

  /* Light Theme */
  --gt-color-primary: ${light.primary};
  --gt-color-on-primary: ${light.onPrimary};
  --gt-color-primary-container: ${light.primaryContainer};
  --gt-color-on-primary-container: ${light.onPrimaryContainer};
  --gt-color-secondary: ${light.secondary};
  --gt-color-on-secondary: ${light.onSecondary};
  --gt-color-secondary-container: ${light.secondaryContainer};
  --gt-color-on-secondary-container: ${light.onSecondaryContainer};
  --gt-color-tertiary: ${light.tertiary};
  --gt-color-on-tertiary: ${light.onTertiary};
  --gt-color-tertiary-container: ${light.tertiaryContainer};
  --gt-color-on-tertiary-container: ${light.onTertiaryContainer};
  --gt-color-error: ${light.error};
  --gt-color-on-error: ${light.onError};
  --gt-color-error-container: ${light.errorContainer};
  --gt-color-on-error-container: ${light.onErrorContainer};
  --gt-color-background: ${light.background};
  --gt-color-on-background: ${light.onBackground};
  --gt-color-surface: ${light.surface};
  --gt-color-on-surface: ${light.onSurface};
  --gt-color-surface-variant: ${light.surfaceVariant};
  --gt-color-on-surface-variant: ${light.onSurfaceVariant};
  --gt-color-outline: ${light.outline};
  --gt-color-outline-variant: ${light.outlineVariant};
  --gt-color-surface-container-lowest: ${light.surfaceContainerLowest};
  --gt-color-surface-container-low: ${light.surfaceContainerLow};
  --gt-color-surface-container: ${light.surfaceContainer};
  --gt-color-surface-container-high: ${light.surfaceContainerHigh};
  --gt-color-surface-container-highest: ${light.surfaceContainerHighest};

  /* Graph Line */
  --gt-graph-grid-major: rgb(204 204 204);
  --gt-graph-grid-minor: rgb(238 238 238);
  --gt-graph-grid-text: rgb(72 72 72);
}

:root[data-theme='dark'] {
  --gt-color-primary: ${dark.primary};
  --gt-color-on-primary: ${dark.onPrimary};
  --gt-color-primary-container: ${dark.primaryContainer};
  --gt-color-on-primary-container: ${dark.onPrimaryContainer};
  --gt-color-secondary: ${dark.secondary};
  --gt-color-on-secondary: ${dark.onSecondary};
  --gt-color-secondary-container: ${dark.secondaryContainer};
  --gt-color-on-secondary-container: ${dark.onSecondaryContainer};
  --gt-color-tertiary: ${dark.tertiary};
  --gt-color-on-tertiary: ${dark.onTertiary};
  --gt-color-tertiary-container: ${dark.tertiaryContainer};
  --gt-color-on-tertiary-container: ${dark.onTertiaryContainer};
  --gt-color-error: ${dark.error};
  --gt-color-on-error: ${dark.onError};
  --gt-color-error-container: ${dark.errorContainer};
  --gt-color-on-error-container: ${dark.onErrorContainer};
  --gt-color-background: ${dark.background};
  --gt-color-on-background: ${dark.onBackground};
  --gt-color-surface: ${dark.surface};
  --gt-color-on-surface: ${dark.onSurface};
  --gt-color-surface-variant: ${dark.surfaceVariant};
  --gt-color-on-surface-variant: ${dark.onSurfaceVariant};
  --gt-color-outline: ${dark.outline};
  --gt-color-outline-variant: ${dark.outlineVariant};
  --gt-color-surface-container-lowest: ${dark.surfaceContainerLowest};
  --gt-color-surface-container-low: ${dark.surfaceContainerLow};
  --gt-color-surface-container: ${dark.surfaceContainer};
  --gt-color-surface-container-high: ${dark.surfaceContainerHigh};
  --gt-color-surface-container-highest: ${dark.surfaceContainerHighest};

  /* Graph Line */
  --gt-graph-grid-major: rgb(82 82 82);
  --gt-graph-grid-minor: rgb(38 38 38);
  --gt-graph-grid-text: rgb(204 204 204);
}
  `;
};

export default function ThemeGenerator(): ReactNode {
  const [sourceColor, setSourceColor] = useState<string>(initialSourceColor);
  const [sourceContrast, setSourceContrast] = useState<number>(0); // -1 to 1, where 0 is neutral

  const [lightThemeColors, setLightThemeColors] = useState<CorePalette>(generateAndApplyTheme(initialSourceColor, false, 0));
  const [darkThemeColors, setDarkThemeColors] = useState<CorePalette>(generateAndApplyTheme(initialSourceColor, true, 0));
  // Store the core colors that users can manually adjust. These will primarily affect the light theme directly.
  // Dark theme will be regenerated from sourceColor unless we add more complex logic for linked core color adjustments.
  const [manualCoreColors, setManualCoreColors] = useState<Pick<CorePalette, CoreColorRole>>({
    primary: lightThemeColors.primary || generateAndApplyTheme(initialSourceColor, false, 0).primary,
    secondary: lightThemeColors.secondary || generateAndApplyTheme(initialSourceColor, false, 0).secondary,
    tertiary: lightThemeColors.tertiary || generateAndApplyTheme(initialSourceColor, false, 0).tertiary,
    error: lightThemeColors.error || generateAndApplyTheme(initialSourceColor, false, 0).error,
    surface: lightThemeColors.surface || generateAndApplyTheme(initialSourceColor, false, 0).surface, // Represents neutral
  });

  // State to manage which picker is open, e.g., { pickerId: 'source', display: true } or null
  const [activePicker, setActivePicker] = useState<{ id: string; display: boolean } | null>(null);

  useEffect(() => {
    // Create a throttled function that will only execute once every 100ms
    const throttledThemeGeneration = () => {
      const timeoutId = setTimeout(() => {
        // Regenerate both themes from the source color
        const newLightTheme = generateAndApplyTheme(sourceColor, false, sourceContrast);
        const newDarkTheme = generateAndApplyTheme(sourceColor, true, sourceContrast);
        
        setLightThemeColors(newLightTheme);
        setDarkThemeColors(newDarkTheme);
        /*
        // Apply manual overrides to the light theme if they differ from the newly generated ones
        // This logic can be expanded if manual changes should also try to influence dark theme generation
        setLightThemeColors({
          ...newLightTheme,
          primary: manualCoreColors.primary,
          secondary: manualCoreColors.secondary,
          tertiary: manualCoreColors.tertiary,
          error: manualCoreColors.error,
          surface: manualCoreColors.surface,
        });
        setDarkThemeColors(newDarkTheme); // Dark theme is purely source-derived for now
        */
      }, 50);

      return () => clearTimeout(timeoutId);
    };

    const cleanup = throttledThemeGeneration();
    return cleanup;
  }, [sourceColor, manualCoreColors, sourceContrast]);

  const handleSourceColorChange = (color: ColorResult) => {
    setSourceColor(color.hex);
    // Also update the manualCoreColors to reflect the new source, so pickers are in sync
    const newCore = generateAndApplyTheme(color.hex, false, sourceContrast);
    setManualCoreColors({
        primary: newCore.primary,
        secondary: newCore.secondary,
        tertiary: newCore.tertiary,
        error: newCore.error,
        surface: newCore.surface,
    });
  };

  const handleSourceColorRandomChange = () => {
    // Generate a random hex color
    const randomHex = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    setSourceColor(randomHex);
    // Also update the manualCoreColors to reflect the new source, so pickers are in sync
    const newCore = generateAndApplyTheme(randomHex, false, sourceContrast);
    setManualCoreColors({
      primary: newCore.primary,
      secondary: newCore.secondary,
      tertiary: newCore.tertiary,
      error: newCore.error,
      surface: newCore.surface,
    });
  };

  const handleSourceContrastChange = (value: number) => {
    value = Math.max(-1, Math.min(1, value)); // Ensure value is within -1 to 1
    setSourceContrast(value);
  };

  const handleCoreColorChange = (colorName: CoreColorRole) => (color: ColorResult) => {
    setManualCoreColors(prevColors => ({
      ...prevColors,
      [colorName]: color.hex,
    }));
  };

  const togglePicker = (id: string) => {
    if (activePicker && activePicker.id === id) {
      setActivePicker(null); // Close if already open
    } else {
      setActivePicker({ id, display: true });
    }
  };

  const handleExportTheme = () => {
    const cssContent = generateThemeCssContent(lightThemeColors, darkThemeColors);
    const blob = new Blob([cssContent], { type: 'text/css' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'theme.css';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderColorPickerButton = (
    id: string, 
    label: string, 
    colorValue: string, 
    onChange: (color: ColorResult) => void,
    enablePicker: boolean = true,
  ) => (
    <div className={styles.tgColorPickerWrapper}>
      <label>{label}</label>
      <button 
        type="button"
        className={styles.tgColorButton}
        style={{ 
          backgroundColor: colorValue,
          cursor: enablePicker ? 'pointer' : 'default',
        }}
        onClick={() => enablePicker ? togglePicker(id) : null}
      >
        {colorValue}
      </button>
      {activePicker && activePicker.id === id && activePicker.display && (
        <div className={styles.tgPickerPopover}>
          <div className={styles.tgPickerCover} onClick={() => setActivePicker(null)} />
          <SketchPicker 
            className={styles.tgPickerElement} 
            color={colorValue} 
            onChange={onChange} 
            disableAlpha={true}
            presetColors={[
              '#992139', '#3EE9C4', '#405820', '#C60AB5', '#AEB34D',
              '#C5613C', '#69B3F4', '#9C49F9', '#118979', '#D55924',
              '#9FA025', '#D7CC38', '#0A8615', '#F2B666', '#CF6389',
            ]}
          />
        </div>
      )}
    </div>
  );

  return (
    <Layout title="Theme Generator" description="Theme Generator for modernGraphTool">
      <div className={styles.tgContainer}>
        <div className={styles.tgTools}>
          <h4>
            <Translate>Source Color</Translate>
          </h4>
          <section className={styles.tgSourceColorSection}>
            {renderColorPickerButton('source', 'Source', sourceColor, handleSourceColorChange)}
            <button
              type="button"
              className={styles.tgSourceColorRandomizerButton}
              onClick={handleSourceColorRandomChange}
            >
              <Translate>Random</Translate>
            </button>
          </section>
          <section className={styles.tgSourceContrastSection}>
            <label htmlFor="sourceContrastSlider">
              <Translate>Contrast</Translate>
            </label>
            <section className={styles.tgSourceContrastInputRow}>
              <input 
                id="sourceContrastSlider"
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={sourceContrast}
                className={styles.tgSourceContrastSlider}
                onChange={(e) => {
                  // Logic to adjust contrast based on slider value
                  handleSourceContrastChange(parseFloat(e.target.value));
                }}
              />
              <input 
                id="sourceContrastSlider"
                type="number"
                min="-1"
                max="1"
                step="0.01"
                value={sourceContrast}
                className={styles.tgSourceContrastNumberInput}
                onChange={(e) => {
                  // Logic to adjust contrast based on slider value
                  handleSourceContrastChange(parseFloat(e.target.value));
                }}
              />
            </section>
          </section>

          <h4><Translate>Core Colors</Translate></h4>
          {renderColorPickerButton('core-primary', 'Primary', manualCoreColors.primary, handleCoreColorChange('primary'), false)}
          {renderColorPickerButton('core-secondary', 'Secondary', manualCoreColors.secondary, handleCoreColorChange('secondary'), false)}
          {renderColorPickerButton('core-tertiary', 'Tertiary', manualCoreColors.tertiary, handleCoreColorChange('tertiary'), false)}
          {renderColorPickerButton('core-error', 'Error', manualCoreColors.error, handleCoreColorChange('error'), false)}
          {renderColorPickerButton('core-neutral', 'Neutral (Surface)', manualCoreColors.surface, handleCoreColorChange('surface'))}
          <button type="button" onClick={handleExportTheme} className={styles.tgExportButton}>
            <Translate>Export Theme.css</Translate>
          </button>
        </div>
        <div className={styles.tgPreview}>
          <DummyGraphPage colorMode='light' theme={lightThemeColors} />
          <DummyGraphPage colorMode='dark' theme={darkThemeColors} />
        </div>
      </div>
    </Layout>
  );
}