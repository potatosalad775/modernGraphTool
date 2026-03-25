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
  --color-typescale-title-large: 700 1.5rem/1.4 'Interop', sans-serif;
  --color-typescale-title-medium: 700 1.2rem/1.4 'Interop', sans-serif;
  --color-typescale-title-small: 700 0.9rem/1.4 'Interop', sans-serif;
  --color-typescale-body-large: 400 1rem/1.4 'Interop', sans-serif;
  --color-typescale-body-medium: 400 0.8rem/1.4 'Interop', sans-serif;
  --color-typescale-body-small: 400 0.7rem/1.4 'Interop', sans-serif;
  
  /* Elevation */
  --color-elevation-level1: 0 2px 6px 0 rgba(0,0,0,0.24);
  --color-elevation-level2: 0 4px 8px 0 rgba(0,0,0,0.48);
  --color-shadow: rgba(0,0,0,0.08);
  --color-hover-filter: brightness(0.92);

  /* Light Theme */
  --color-color-primary: ${light.primary};
  --color-color-on-primary: ${light.onPrimary};
  --color-color-primary-container: ${light.primaryContainer};
  --color-color-on-primary-container: ${light.onPrimaryContainer};
  --color-color-secondary: ${light.secondary};
  --color-color-on-secondary: ${light.onSecondary};
  --color-color-secondary-container: ${light.secondaryContainer};
  --color-color-on-secondary-container: ${light.onSecondaryContainer};
  --color-color-tertiary: ${light.tertiary};
  --color-color-on-tertiary: ${light.onTertiary};
  --color-color-tertiary-container: ${light.tertiaryContainer};
  --color-color-on-tertiary-container: ${light.onTertiaryContainer};
  --color-color-error: ${light.error};
  --color-color-on-error: ${light.onError};
  --color-color-error-container: ${light.errorContainer};
  --color-color-on-error-container: ${light.onErrorContainer};
  --color-color-success: ${light.success};
  --color-color-on-success: ${light.onSuccess};
  --color-color-success-container: ${light.successContainer};
  --color-color-on-success-container: ${light.onSuccessContainer};
  --color-color-warning: ${light.warning};
  --color-color-on-warning: ${light.onWarning};
  --color-color-warning-container: ${light.warningContainer};
  --color-color-on-warning-container: ${light.onWarningContainer};
  --color-color-background: ${light.background};
  --color-color-on-background: ${light.onBackground};
  --color-color-surface: ${light.surface};
  --color-color-on-surface: ${light.onSurface};
  --color-color-surface-variant: ${light.surfaceVariant};
  --color-color-on-surface-variant: ${light.onSurfaceVariant};
  --color-color-outline: ${light.outline};
  --color-color-outline-variant: ${light.outlineVariant};
  --color-color-surface-container-lowest: ${light.surfaceContainerLowest};
  --color-color-surface-container-low: ${light.surfaceContainerLow};
  --color-color-surface-container: ${light.surfaceContainer};
  --color-color-surface-container-high: ${light.surfaceContainerHigh};
  --color-color-surface-container-highest: ${light.surfaceContainerHighest};

  /* Graph Line */
  --color-graph-grid-major: rgb(204 204 204);
  --color-graph-grid-minor: rgb(238 238 238);
  --color-graph-grid-text: rgb(72 72 72);
}

:root[data-theme='dark'] {
  --color-color-primary: ${dark.primary};
  --color-color-on-primary: ${dark.onPrimary};
  --color-color-primary-container: ${dark.primaryContainer};
  --color-color-on-primary-container: ${dark.onPrimaryContainer};
  --color-color-secondary: ${dark.secondary};
  --color-color-on-secondary: ${dark.onSecondary};
  --color-color-secondary-container: ${dark.secondaryContainer};
  --color-color-on-secondary-container: ${dark.onSecondaryContainer};
  --color-color-tertiary: ${dark.tertiary};
  --color-color-on-tertiary: ${dark.onTertiary};
  --color-color-tertiary-container: ${dark.tertiaryContainer};
  --color-color-on-tertiary-container: ${dark.onTertiaryContainer};
  --color-color-error: ${dark.error};
  --color-color-on-error: ${dark.onError};
  --color-color-error-container: ${dark.errorContainer};
  --color-color-on-error-container: ${dark.onErrorContainer};
  --color-color-success: ${dark.success};
  --color-color-on-success: ${dark.onSuccess};
  --color-color-success-container: ${dark.successContainer};
  --color-color-on-success-container: ${dark.onSuccessContainer};
  --color-color-warning: ${dark.warning};
  --color-color-on-warning: ${dark.onWarning};
  --color-color-warning-container: ${dark.warningContainer};
  --color-color-on-warning-container: ${dark.onWarningContainer};
  --color-color-background: ${dark.background};
  --color-color-on-background: ${dark.onBackground};
  --color-color-surface: ${dark.surface};
  --color-color-on-surface: ${dark.onSurface};
  --color-color-surface-variant: ${dark.surfaceVariant};
  --color-color-on-surface-variant: ${dark.onSurfaceVariant};
  --color-color-outline: ${dark.outline};
  --color-color-outline-variant: ${dark.outlineVariant};
  --color-color-surface-container-lowest: ${dark.surfaceContainerLowest};
  --color-color-surface-container-low: ${dark.surfaceContainerLow};
  --color-color-surface-container: ${dark.surfaceContainer};
  --color-color-surface-container-high: ${dark.surfaceContainerHigh};
  --color-color-surface-container-highest: ${dark.surfaceContainerHighest};

  /* Graph Line */
  --color-graph-grid-major: rgb(82 82 82);
  --color-graph-grid-minor: rgb(38 38 38);
  --color-graph-grid-text: rgb(204 204 204);
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