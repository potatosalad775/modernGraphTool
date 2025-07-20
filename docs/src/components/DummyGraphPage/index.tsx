import React, { ReactNode } from "react";
import styles from "./styles.module.css";

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
  success: string;
  onSuccess: string;
  successContainer: string;
  onSuccessContainer: string;
  warning: string;
  onWarning: string;
  warningContainer: string;
  onWarningContainer: string;
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

interface DummyGraphPageProps {
  colorMode: "light" | "dark";
  theme?: CorePalette;
}

export default function DummyGraphPage({
  colorMode,
  theme,
}: DummyGraphPageProps): ReactNode {
  // Define default fallbacks for when theme is not yet loaded or a color is missing
  const defaultLightColors = {
    primary: "#4f378a",
    onPrimary: "#ffffff",
    primaryContainer: "#6750a4",
    onPrimaryContainer: "#e0d2ff",
    secondary: "#63597c",
    onSecondary: "#ffffff",
    secondaryContainer: "#e1d4fd",
    onSecondaryContainer: "#645a7d",
    tertiary: "#762a5b",
    onTertiary: "#ffffff",
    tertiaryContainer: "#924274",
    onTertiaryContainer: "#ffcae5",
    success: "#006d3d",
    onSuccess: "#ffffff",
    successContainer: "#a0f9c6",
    onSuccessContainer: "#00391a",
    warning: "#7f4d00",
    onWarning: "#ffffff",
    warningContainer: "#ffdea0",
    onWarningContainer: "#3f2a00",
    error: "#ba1a1a",
    onError: "#ffffff",
    errorContainer: "#ffdad6",
    onErrorContainer: "#93000a",
    background: "#fdf7ff",
    onBackground: "#1d1b20",
    surface: "#fdf7ff",
    onSurface: "#1d1b20",
    surfaceVariant: "#e7e0ee",
    onSurfaceVariant: "#494551",
    outline: "#7a7582",
    outlineVariant: "#cbc4d2",
    surfaceContainerLowest: "#ffffff",
    surfaceContainerLow: "#f8f2fa",
    surfaceContainer: "#f2ecf4",
    surfaceContainerHigh: "#ece6ee",
    surfaceContainerHighest: "#e6e0e9",
  };

  const defaultDarkColors = {
    primary: "#cfbcff",
    onPrimary: "#381e72",
    primaryContainer: "#6750a4",
    onPrimaryContainer: "#e0d2ff",
    secondary: "#cdc0e9",
    onSecondary: "#342b4b",
    secondaryContainer: "#4d4465",
    onSecondaryContainer: "#bfb2da",
    tertiary: "#ffaedb",
    onTertiary: "#5a1243",
    tertiaryContainer: "#924274",
    onTertiaryContainer: "#ffcae5",
    success: "#a0f9c6",
    onSuccess: "#00391a",
    successContainer: "#006d3d",
    onSuccessContainer: "#a0f9c6",
    warning: "#ffdea0",
    onWarning: "#3f2a00",
    warningContainer: "#7f4d00",
    onWarningContainer: "#ffdea0",
    error: "#ffb4ab",
    onError: "#690005",
    errorContainer: "#93000a",
    onErrorContainer: "#ffdad6",
    background: "#141218",
    onBackground: "#e6e0e9",
    surface: "#141218",
    onSurface: "#e6e0e9",
    surfaceVariant: "#494551",
    onSurfaceVariant: "#cbc4d2",
    outline: "#948e9c",
    outlineVariant: "#494551",
    surfaceContainerLowest: "#0f0d13",
    surfaceContainerLow: "#1d1b20",
    surfaceContainer: "#211f24",
    surfaceContainerHigh: "#2b292f",
    surfaceContainerHighest: "#36343a",
  };

  const currentDefaults =
    colorMode === "dark" ? defaultDarkColors : defaultLightColors;

  const containerStyle = {
    backgroundColor: theme?.surfaceContainerLowest || currentDefaults.surfaceContainerLowest,
    color: theme?.onSurface || currentDefaults.onSurface,
    border: `1px solid ${theme?.outline || currentDefaults.outline}`,
  };

  const headerStyle = {
    backgroundColor:
      theme?.surfaceContainer || currentDefaults.surfaceContainer,
    color: theme?.onSurface || currentDefaults.onSurface,
    borderBottom: `1px solid ${
      theme?.outlineVariant || currentDefaults.outlineVariant
    }`,
  };

  const buttonStyle = {
    color: theme?.onSurfaceVariant || currentDefaults.onSurfaceVariant,
  };

  const graphStyle = {
    backgroundColor: theme?.surfaceContainerLowest || currentDefaults.surfaceContainerLowest,
    color: theme?.onSurface || currentDefaults.onSurface,
  };

  const toastSuccessStyle = {
    background: theme?.successContainer || currentDefaults.successContainer,
    color: theme?.onSuccessContainer || currentDefaults.onSuccessContainer,
    borderLeft: `4px solid ${theme?.success || currentDefaults.success}`,
  };

  const toastWarningStyle = {
    background: theme?.warningContainer || currentDefaults.warningContainer,
    color: theme?.onWarningContainer || currentDefaults.onWarningContainer,
    borderLeft: `4px solid ${theme?.warning || currentDefaults.warning}`,
  };

  const toastErrorStyle = {
    background: theme?.errorContainer || currentDefaults.errorContainer,
    color: theme?.onErrorContainer || currentDefaults.onErrorContainer,
    borderLeft: `4px solid ${theme?.error || currentDefaults.error}`,
  };

  const dividerStyle = {
    backgroundColor: theme?.outlineVariant || currentDefaults.outlineVariant,
  };

  const toolStyle = {
    backgroundColor: theme?.surface || currentDefaults.surface,
    color: theme?.onSurface || currentDefaults.onSurface,
  };

  const tutorialButtonStyle = {
    backgroundColor: theme?.tertiaryContainer || currentDefaults.tertiaryContainer,
    color: theme?.onTertiaryContainer || currentDefaults.onTertiaryContainer,
  };

  const tutorialButtonSelectedStyle = {
    backgroundColor: theme?.tertiary || currentDefaults.tertiary,
    color: theme?.onTertiary || currentDefaults.onTertiary,
  };
  
  const targetSelectorStyle = {
    backgroundColor: theme?.surfaceContainerHigh || currentDefaults.surfaceContainerHigh,
    color: theme?.onSurface || currentDefaults.onSurface,
  };

  const targetSelectorLabelStyle = {
    color: theme?.primary || currentDefaults.primary,
  };

  const targetSelectorButtonLineStyle = {
    color: theme?.primary || currentDefaults.primary,
    border: `1px solid ${theme?.outline || currentDefaults.outline}`,
  };

  const targetSelectorButtonSolidStyle = {
    color: theme?.onPrimary || currentDefaults.onPrimary,
    backgroundColor: theme?.primary || currentDefaults.primary,
    border: `1px solid ${theme?.primary || currentDefaults.primary}`,
  };

  const phoneSelectorStyle = {
    backgroundColor: theme?.surfaceContainerHighest || currentDefaults.surfaceContainerHighest,
    color: theme?.onSurface || currentDefaults.onSurface,
  };

  const phoneSelectorObjectStyle = {
    backgroundColor: theme?.surface || currentDefaults.surface,
    color: theme?.onSurface || currentDefaults.onSurface,
  };

  const buttonObjectLinedStyle = {
    border: `1px solid ${theme?.primary || currentDefaults.primary}`,
    color: theme?.primary || currentDefaults.primary,
  };

  const buttonObjectSolidStyle = {
    backgroundColor: theme?.primaryContainer || currentDefaults.primaryContainer,
    color: theme?.onPrimaryContainer || currentDefaults.onPrimaryContainer,
  };

  const menuCarouselStyle = {
    backgroundColor: theme?.surfaceContainer || currentDefaults.surfaceContainer,
    color: theme?.onSurface || currentDefaults.onSurface,
  };

  const menuItemStyle = {
    fontSize: "10px"
  };

  const menuItemSelectedStyle = {
    color: theme?.onPrimary || currentDefaults.onPrimary,
    backgroundColor: theme?.primary || currentDefaults.primary,
  };

  return (
    <section className={styles.dgpContainer} style={containerStyle}>
      <div className={styles.dgpHeader} style={headerStyle}>
        <h3>modernGraphTool ({colorMode})</h3>
        <span style={buttonStyle}>Button</span>
      </div>
      <div className={styles.dgpContent}>
        <div className={styles.dgpGraph} style={graphStyle}>
          <section className={styles.dgpToasts}>
            <div className={styles.dgpToast} style={toastSuccessStyle}>Success Toast Sample</div>
            <div className={styles.dgpToast} style={toastWarningStyle}>Warning Toast Sample</div>
            <div className={styles.dgpToast} style={toastErrorStyle}>Error Toast Sample</div>
          </section>
          <span>Use your imagination and pretend the graph is displayed over here lol</span>
        </div>
        <div className={styles.dgpDivider} style={dividerStyle}></div>
        <div className={styles.dgpTools} style={toolStyle}>
          <section className={styles.dgpToolsContent}>
            <section className={styles.dgpTutorial}>
              <div style={tutorialButtonStyle}>Bass</div>
              <div style={tutorialButtonSelectedStyle}>Midrange</div>
              <div style={tutorialButtonStyle}>Treble</div>
            </section>
            <section className={styles.dgpTargetSelector} style={targetSelectorStyle}>
              <span style={targetSelectorLabelStyle}>Target</span>
              <div style={targetSelectorButtonLineStyle}>4128 DF</div>
              <div style={targetSelectorButtonSolidStyle}>5128 DF</div>
              <div style={targetSelectorButtonLineStyle}>6128 DF</div>
            </section>
            <section className={styles.dgpPhoneSelector} style={phoneSelectorStyle}>
              <div className={styles.dgpPhoneSelectorObject} style={phoneSelectorObjectStyle}>
                Stardrop Moonfield
              </div>
              <div className={styles.dgpPhoneSelectorObject} style={phoneSelectorObjectStyle}>
                Fictionalear Hexa 2 eta wen
              </div>
            </section>
            <section className={styles.dgpButtonContainer}>
              <div style={buttonObjectSolidStyle}>Pref.</div>
              <div style={buttonObjectLinedStyle}>Normalization</div>
              <div style={buttonObjectLinedStyle}>Smoothing</div>
              <div style={buttonObjectLinedStyle}>Y-axis Scale</div>
              <div style={buttonObjectSolidStyle}>Screenshot</div>
              <div style={buttonObjectSolidStyle}>Share</div>
            </section>
          </section>
          <section className={styles.dgpMenuCarousel} style={menuCarouselStyle}>
            <div style={menuItemStyle}>DEVICE</div>
            <div style={menuItemSelectedStyle}>GRAPH</div>
            <div style={menuItemStyle}>MISC</div>
          </section>
        </div>
      </div>
    </section>
  );
}
