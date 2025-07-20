import React, { useState, useEffect, ReactNode } from 'react';
import Layout from '@theme/Layout';
import DummyGraphPage from '@site/src/components/DummyGraphPage';
import { SketchPicker, ColorResult } from 'react-color';
import { argbFromHex, Hct, SchemeContent, hexFromArgb, TonalPalette, CorePalette as MaterialCorePalette } from '@material/material-color-utilities';
import Translate, {translate} from '@docusaurus/Translate';
import styles from './index.module.css';

interface ThemePalette {
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
  success: string;
  onSuccess: string;
  successContainer: string;
  onSuccessContainer: string;
  warning: string;
  onWarning: string;
  warningContainer: string;
  onWarningContainer: string;
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

interface CustomColors {
  primary: string;
  secondary?: string;
  tertiary?: string;
  success: string;
  warning: string;
}

const initialSourceColor = '#6750A4';
const defaultCustomColors: CustomColors = {
  primary: '#6750A4',   // Material Purple
  success: '#2E7D32',   // Material Green
  warning: '#F57C00',   // Material Orange
};

const generateAndApplyTheme = (
  customColors: CustomColors, 
  isDark: boolean,
  contrastValue: number
): ThemePalette => {
  // Create Material 3 CorePalette from primary color
  const corePalette = MaterialCorePalette.of(argbFromHex(customColors.primary));
  
  // Create individual tonal palettes for semantic colors
  const successPalette = TonalPalette.fromInt(argbFromHex(customColors.success));
  const warningPalette = TonalPalette.fromInt(argbFromHex(customColors.warning));
  
  // Use Material 3 scheme for base colors (background, surface, etc.)
  const scheme = new SchemeContent(Hct.fromInt(argbFromHex(customColors.primary)), isDark, contrastValue);
  
  // Define tones based on Material 3 guidelines
  const lightTones = { main: 40, onMain: 100, container: 90, onContainer: 10 };
  const darkTones = { main: 80, onMain: 20, container: 30, onContainer: 90 };
  const tones = isDark ? darkTones : lightTones;

  return {
    // Primary colors from Material 3 CorePalette (automatically harmonious)
    primary: hexFromArgb(corePalette.a1.tone(tones.main)),
    onPrimary: hexFromArgb(corePalette.a1.tone(tones.onMain)),
    primaryContainer: hexFromArgb(corePalette.a1.tone(tones.container)),
    onPrimaryContainer: hexFromArgb(corePalette.a1.tone(tones.onContainer)),
    
    // Secondary colors from Material 3 CorePalette (automatically generated to be harmonious)
    secondary: hexFromArgb(corePalette.a2.tone(tones.main)),
    onSecondary: hexFromArgb(corePalette.a2.tone(tones.onMain)),
    secondaryContainer: hexFromArgb(corePalette.a2.tone(tones.container)),
    onSecondaryContainer: hexFromArgb(corePalette.a2.tone(tones.onContainer)),
    
    // Tertiary colors from Material 3 CorePalette (automatically generated to be harmonious)
    tertiary: hexFromArgb(corePalette.a3.tone(tones.main)),
    onTertiary: hexFromArgb(corePalette.a3.tone(tones.onMain)),
    tertiaryContainer: hexFromArgb(corePalette.a3.tone(tones.container)),
    onTertiaryContainer: hexFromArgb(corePalette.a3.tone(tones.onContainer)),
    
    // Error colors from scheme (Material 3 default)
    error: hexFromArgb(scheme.error),
    onError: hexFromArgb(scheme.onError),
    errorContainer: hexFromArgb(scheme.errorContainer),
    onErrorContainer: hexFromArgb(scheme.onErrorContainer),
    
    // Success colors from custom palette
    success: hexFromArgb(successPalette.tone(tones.main)),
    onSuccess: hexFromArgb(successPalette.tone(tones.onMain)),
    successContainer: hexFromArgb(successPalette.tone(tones.container)),
    onSuccessContainer: hexFromArgb(successPalette.tone(tones.onContainer)),
    
    // Warning colors from custom palette
    warning: hexFromArgb(warningPalette.tone(tones.main)),
    onWarning: hexFromArgb(warningPalette.tone(tones.onMain)),
    warningContainer: hexFromArgb(warningPalette.tone(tones.container)),
    onWarningContainer: hexFromArgb(warningPalette.tone(tones.onContainer)),
    
    // Surface and background colors from scheme
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
type CoreColorRole = 'primary' | 'success' | 'warning';

const generateThemeCssContent = (light: ThemePalette, dark: ThemePalette): string => {
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
  --gt-color-success: ${light.success};
  --gt-color-on-success: ${light.onSuccess};
  --gt-color-success-container: ${light.successContainer};
  --gt-color-on-success-container: ${light.onSuccessContainer};
  --gt-color-warning: ${light.warning};
  --gt-color-on-warning: ${light.onWarning};
  --gt-color-warning-container: ${light.warningContainer};
  --gt-color-on-warning-container: ${light.onWarningContainer};
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
  --gt-color-success: ${dark.success};
  --gt-color-on-success: ${dark.onSuccess};
  --gt-color-success-container: ${dark.successContainer};
  --gt-color-on-success-container: ${dark.onSuccessContainer};
  --gt-color-warning: ${dark.warning};
  --gt-color-on-warning: ${dark.onWarning};
  --gt-color-warning-container: ${dark.warningContainer};
  --gt-color-on-warning-container: ${dark.onWarningContainer};
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
  const [customColors, setCustomColors] = useState<CustomColors>(defaultCustomColors);
  const [sourceContrast, setSourceContrast] = useState<number>(0); // -1 to 1, where 0 is neutral

  const [lightThemeColors, setLightThemeColors] = useState<ThemePalette>(generateAndApplyTheme(defaultCustomColors, false, 0));
  const [darkThemeColors, setDarkThemeColors] = useState<ThemePalette>(generateAndApplyTheme(defaultCustomColors, true, 0));

  // State to manage which picker is open, e.g., { pickerId: 'source', display: true } or null
  const [activePicker, setActivePicker] = useState<{ id: string; display: boolean } | null>(null);

  useEffect(() => {
    // Create a throttled function that will only execute once every 100ms
    const throttledThemeGeneration = () => {
      const timeoutId = setTimeout(() => {
        // Regenerate both themes from the custom colors
        const newLightTheme = generateAndApplyTheme(customColors, false, sourceContrast);
        const newDarkTheme = generateAndApplyTheme(customColors, true, sourceContrast);
        
        setLightThemeColors(newLightTheme);
        setDarkThemeColors(newDarkTheme);
      }, 50);

      return () => clearTimeout(timeoutId);
    };

    const cleanup = throttledThemeGeneration();
    return cleanup;
  }, [customColors, sourceContrast]);

  const handlePrimaryColorChange = (color: ColorResult) => {
    setCustomColors(prev => ({
      ...prev,
      primary: color.hex
    }));
  };

  const generateSemanticColor = (baseHue: number, saturationRange: [number, number], lightnessRange: [number, number]): string => {
    // Add some variation to the hue while keeping it in the semantic range
    const hueVariation = (Math.random() - 0.5) * 40; // ±20 degrees
    const hue = Math.max(0, Math.min(360, baseHue + hueVariation));
    
    // Random saturation and lightness within the specified ranges
    const saturation = saturationRange[0] + Math.random() * (saturationRange[1] - saturationRange[0]);
    const lightness = lightnessRange[0] + Math.random() * (lightnessRange[1] - lightnessRange[0]);

    function hslToHex(h, s, l) {
      l /= 100;
      const a = s * Math.min(l, 1 - l) / 100;
      const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
      };
      return `#${f(0)}${f(8)}${f(4)}`;
    }

    return hslToHex(Math.round(hue), Math.round(saturation), Math.round(lightness));
  };

  const handleRandomColorChange = () => {
    // Generate random hex colors for primary and semantic colors
    // Secondary and tertiary will be auto-generated from the primary
    const randomColors: CustomColors = {
      primary: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
      // Success: Green range (hue 100-160, good saturation, medium lightness)
      success: generateSemanticColor(130, [40, 80], [25, 45]),
      // Warning: Orange/Yellow range (hue 30-60, good saturation, medium lightness)  
      warning: generateSemanticColor(45, [60, 90], [35, 55]),
    };
    setCustomColors(randomColors);
  };

  const handleSourceContrastChange = (value: number) => {
    value = Math.max(-1, Math.min(1, value)); // Ensure value is within -1 to 1
    setSourceContrast(value);
  };

  const handleCoreColorChange = (colorName: CoreColorRole) => (color: ColorResult) => {
    setCustomColors(prevColors => ({
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

  const renderColorDisplayButton = (
    label: string, 
    colorValue: string, 
  ) => (
    <div className={styles.tgColorPickerWrapper}>
      <label>{label} <small>(auto-generated)</small></label>
      <button 
        type="button"
        className={styles.tgColorButton}
        style={{ 
          backgroundColor: colorValue,
          cursor: 'default',
          opacity: 0.8,
        }}
        disabled
      >
        {colorValue}
      </button>
    </div>
  );

  const renderColorPickerButton = (
    id: string, 
    label: string, 
    colorValue: string, 
    onChange: (color: ColorResult) => void,
  ) => (
    <div className={styles.tgColorPickerWrapper}>
      <label>{label}</label>
      <button 
        type="button"
        className={styles.tgColorButton}
        style={{ 
          backgroundColor: colorValue,
          cursor: 'pointer',
        }}
        onClick={() => togglePicker(id)}
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
              '#6750A4', '#625B71', '#7D5260', '#2E7D32', '#F57C00',
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
            <Translate>Primary Color</Translate>
          </h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--ifm-color-emphasis-600)', marginBottom: '1rem' }}>
            <Translate>Secondary and tertiary colors are automatically generated from the primary color using Material 3 algorithms.</Translate>
          </p>
          <section className={styles.tgSourceColorSection}>
            {renderColorPickerButton('primary', 'Primary', customColors.primary, handlePrimaryColorChange)}
            <button
              type="button"
              className={styles.tgSourceColorRandomizerButton}
              onClick={handleRandomColorChange}
            >
              <Translate>Random All</Translate>
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
                id="sourceContrastNumber"
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
          {renderColorPickerButton('core-primary', 'Primary', customColors.primary, handleCoreColorChange('primary'))}
          {renderColorDisplayButton('Secondary', lightThemeColors.secondary)}
          {renderColorDisplayButton('Tertiary', lightThemeColors.tertiary)}
          
          <h4><Translate>Semantic Colors</Translate></h4>
          {renderColorPickerButton('core-success', 'Success', customColors.success, handleCoreColorChange('success'))}
          {renderColorPickerButton('core-warning', 'Warning', customColors.warning, handleCoreColorChange('warning'))}
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