import React, { ReactNode } from "react";
import { type ThemePalette, withAlpha } from "@site/src/utils/oklch";
import styles from "./styles.module.css";

interface DummyGraphPageProps {
  colorMode: "light" | "dark";
  theme?: ThemePalette;
}

// Default palettes matching defaults/theme.css reference values
const defaultLight: ThemePalette = {
  base100: "oklch(98% 0.003 247.858)",
  base200: "oklch(96% 0.007 247.896)",
  base300: "oklch(92% 0.013 255.508)",
  baseContent: "oklch(20% 0.042 265.755)",
  primary: "oklch(59% 0.145 163.225)",
  primaryContent: "oklch(97% 0.021 166.113)",
  secondary: "oklch(60% 0.126 221.723)",
  secondaryContent: "oklch(98% 0.019 200.873)",
  accent: "oklch(44% 0.017 285.786)",
  accentContent: "oklch(98% 0 0)",
  neutral: "oklch(44% 0.043 257.281)",
  neutralContent: "oklch(98% 0.003 247.858)",
  info: "oklch(68% 0.169 237.323)",
  infoContent: "oklch(97% 0.013 236.62)",
  success: "oklch(76% 0.233 130.85)",
  successContent: "oklch(98% 0.031 120.757)",
  warning: "oklch(79% 0.184 86.047)",
  warningContent: "oklch(98% 0.026 102.212)",
  error: "oklch(64% 0.246 16.439)",
  errorContent: "oklch(96% 0.015 12.422)",
  graphBg: "transparent",
  graphWatermarkOpacity: "0.08",
  graphGridMajor: "rgba(0, 0, 0, 0.15)",
  graphGridMinor: "rgba(0, 0, 0, 0.06)",
  graphAxisLabel: "rgba(0, 0, 0, 0.6)",
  graphGridText: "rgba(0, 0, 0, 0.5)",
  graphBaseline: "rgba(0, 0, 0, 0.25)",
};

const defaultDark: ThemePalette = {
  base100: "oklch(30.857% 0.023 264.149)",
  base200: "oklch(28.036% 0.019 264.182)",
  base300: "oklch(26.346% 0.018 262.177)",
  baseContent: "oklch(82.901% 0.031 222.959)",
  primary: "oklch(86.133% 0.141 139.549)",
  primaryContent: "oklch(17.226% 0.028 139.549)",
  secondary: "oklch(73.375% 0.165 35.353)",
  secondaryContent: "oklch(14.675% 0.033 35.353)",
  accent: "oklch(74.229% 0.133 311.379)",
  accentContent: "oklch(14.845% 0.026 311.379)",
  neutral: "oklch(24.731% 0.02 264.094)",
  neutralContent: "oklch(82.901% 0.031 222.959)",
  info: "oklch(86.078% 0.142 206.182)",
  infoContent: "oklch(17.215% 0.028 206.182)",
  success: "oklch(76% 0.177 163.223)",
  successContent: "oklch(37% 0.077 168.94)",
  warning: "oklch(82% 0.189 84.429)",
  warningContent: "oklch(41% 0.112 45.904)",
  error: "oklch(71% 0.194 13.428)",
  errorContent: "oklch(27% 0.105 12.094)",
  graphBg: "transparent",
  graphWatermarkOpacity: "0.08",
  graphGridMajor: "rgba(255, 255, 255, 0.15)",
  graphGridMinor: "rgba(255, 255, 255, 0.06)",
  graphAxisLabel: "rgba(255, 255, 255, 0.6)",
  graphGridText: "rgba(255, 255, 255, 0.5)",
  graphBaseline: "rgba(255, 255, 255, 0.25)",
};

export default function DummyGraphPage({
  colorMode,
  theme,
}: DummyGraphPageProps): ReactNode {
  const d = colorMode === "dark" ? defaultDark : defaultLight;
  const t = theme ?? d;

  return (
    <section
      className={styles.dgpContainer}
      style={{ backgroundColor: t.base100, color: t.baseContent, border: `1px solid ${withAlpha(t.baseContent, 0.15)}` }}
    >
      {/* ── Top Nav Bar ─────────────────────────────────────────────────── */}
      <div
        className={styles.dgpHeader}
        style={{
          backgroundColor: t.base200,
          color: t.baseContent,
          borderBottom: `1px solid ${withAlpha(t.baseContent, 0.15)}`,
        }}
      >
        <h3>modernGraphTool ({colorMode})</h3>
        <span style={{ color: t.primary, fontSize: "14px", fontWeight: 600 }}>
          &#9788;
        </span>
      </div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className={styles.dgpContent}>
        {/* Graph area */}
        <div
          className={styles.dgpGraph}
          style={{ backgroundColor: t.base100, color: t.baseContent }}
        >
          <section className={styles.dgpToasts}>
            <div
              className={styles.dgpToast}
              style={{
                background: withAlpha(t.info, 0.12),
                color: t.info,
                borderLeft: `3px solid ${t.info}`,
              }}
            >
              Info toast sample
            </div>
            <div
              className={styles.dgpToast}
              style={{
                background: withAlpha(t.success, 0.12),
                color: t.success,
                borderLeft: `3px solid ${t.success}`,
              }}
            >
              Success toast sample
            </div>
            <div
              className={styles.dgpToast}
              style={{
                background: withAlpha(t.warning, 0.12),
                color: t.warning,
                borderLeft: `3px solid ${t.warning}`,
              }}
            >
              Warning toast sample
            </div>
            <div
              className={styles.dgpToast}
              style={{
                background: withAlpha(t.error, 0.12),
                color: t.error,
                borderLeft: `3px solid ${t.error}`,
              }}
            >
              Error toast sample
            </div>
          </section>
          <span style={{ opacity: 0.5 }}>
            Graph area
          </span>
        </div>

        {/* Divider */}
        <div
          className={styles.dgpDivider}
          style={{ backgroundColor: withAlpha(t.baseContent, 0.15) }}
        />

        {/* Controls panel */}
        <div
          className={styles.dgpTools}
          style={{ backgroundColor: t.base200, color: t.baseContent }}
        >
          <section className={styles.dgpToolsContent}>
            {/* ── Target selector ──────────────────────────────────────── */}
            <section className={styles.dgpTargetSelector}>
              <span
                style={{
                  color: withAlpha(t.baseContent, 0.4),
                  fontSize: "9px",
                  fontWeight: 500,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                }}
              >
                Target
              </span>
              <div
                style={{
                  backgroundColor: t.primary,
                  color: t.primaryContent,
                  borderRadius: "4px",
                  padding: "2px 10px",
                  fontSize: "11px",
                  fontWeight: 500,
                }}
              >
                5128 DF
              </div>
              <div
                style={{
                  border: `1px solid ${withAlpha(t.baseContent, 0.2)}`,
                  color: t.baseContent,
                  borderRadius: "4px",
                  padding: "2px 10px",
                  fontSize: "11px",
                }}
              >
                4128 DF
              </div>
              <div
                style={{
                  border: `1px solid ${withAlpha(t.baseContent, 0.2)}`,
                  color: t.baseContent,
                  borderRadius: "4px",
                  padding: "2px 10px",
                  fontSize: "11px",
                }}
              >
                6128 DF
              </div>
            </section>

            {/* ── Phone selector ───────────────────────────────────────── */}
            <section
              className={styles.dgpPhoneSelector}
              style={{
                backgroundColor: t.base100,
                border: `1px solid ${withAlpha(t.baseContent, 0.15)}`,
              }}
            >
              <div
                className={styles.dgpPhoneSelectorObjectSelected}
                style={{
                  backgroundColor: withAlpha(t.accent, 0.12),
                  color: t.accent,
                  borderLeft: `2px solid ${t.accent}`,
                }}
              >
                Stardrop Moonfield
              </div>
              <div
                className={styles.dgpPhoneSelectorObject}
                style={{
                  color: t.baseContent,
                }}
              >
                Fictionalear Hexa 2
              </div>
            </section>

            {/* ── Button row ───────────────────────────────────────────── */}
            <section className={styles.dgpButtonContainer}>
              <div
                style={{
                  backgroundColor: t.primary,
                  color: t.primaryContent,
                  fontWeight: 500,
                }}
              >
                Primary
              </div>
              <div
                style={{
                  backgroundColor: t.secondary,
                  color: t.secondaryContent,
                  fontWeight: 500,
                }}
              >
                Secondary
              </div>
              <div
                style={{
                  border: `1px solid ${withAlpha(t.baseContent, 0.2)}`,
                  color: t.baseContent,
                }}
              >
                Outline
              </div>
              <div
                style={{
                  backgroundColor: t.base300,
                  color: t.baseContent,
                }}
              >
                Muted
              </div>
              <div
                style={{
                  backgroundColor: t.error,
                  color: t.errorContent,
                  fontWeight: 500,
                }}
              >
                Destructive
              </div>
              <div
                style={{
                  color: t.baseContent,
                  backgroundColor: "transparent",
                }}
              >
                Ghost
              </div>
            </section>
          </section>

          {/* ── Menu Carousel ──────────────────────────────────────────── */}
          <section
            className={styles.dgpMenuCarousel}
            style={{
              backgroundColor: t.base200,
              borderTop: `1px solid ${withAlpha(t.baseContent, 0.15)}`,
            }}
          >
            <div
              className={styles.dgpMenuItem}
              style={{ color: withAlpha(t.baseContent, 0.25) }}
            >
              DEVICE
            </div>
            <div className={styles.dgpMenuItemActive}>
              <span style={{ color: t.accent }}>GRAPH</span>
              <div
                className={styles.dgpMenuIndicator}
                style={{ backgroundColor: t.accent }}
              />
            </div>
            <div
              className={styles.dgpMenuItem}
              style={{ color: withAlpha(t.baseContent, 0.6) }}
            >
              EQ
            </div>
            <div
              className={styles.dgpMenuItem}
              style={{ color: withAlpha(t.baseContent, 0.25) }}
            >
              MISC
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
