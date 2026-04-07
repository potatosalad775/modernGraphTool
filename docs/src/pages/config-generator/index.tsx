import React, { useState, type ReactNode } from 'react';
import Layout from '@theme/Layout';
import Translate from '@docusaurus/Translate';
import {
  parseV1Config,
  parseV1Extensions,
  parseCrinGraphConfig,
  convertV1ToV2,
  convertCrinGraphToV2,
  type ConversionResult,
} from '@site/src/utils/configConverter';
import styles from './index.module.css';

type TabKey = 'v1' | 'crin';

export default function ConfigGenerator(): ReactNode {
  const [activeTab, setActiveTab] = useState<TabKey>('v1');

  // v1 tab state
  const [v1ConfigInput, setV1ConfigInput] = useState('');
  const [v1ExtensionsInput, setV1ExtensionsInput] = useState('');
  const [v1Output, setV1Output] = useState('');
  const [v1Warnings, setV1Warnings] = useState<string[]>([]);
  const [v1Error, setV1Error] = useState<string | null>(null);

  // CrinGraph tab state
  const [crinInput, setCrinInput] = useState('');
  const [crinOutput, setCrinOutput] = useState('');
  const [crinWarnings, setCrinWarnings] = useState<string[]>([]);
  const [crinError, setCrinError] = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleV1Convert = () => {
    setV1Error(null);
    setV1Warnings([]);
    setV1Output('');

    if (!v1ConfigInput.trim()) {
      setV1Error('Please paste your v1 config.js content.');
      return;
    }

    try {
      const config = parseV1Config(v1ConfigInput);
      let extensions: any[] | null = null;

      if (v1ExtensionsInput.trim()) {
        extensions = parseV1Extensions(v1ExtensionsInput);
      }

      const result: ConversionResult = convertV1ToV2(config, extensions);
      setV1Output(result.output);
      setV1Warnings(result.warnings);
    } catch (e) {
      setV1Error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCrinConvert = () => {
    setCrinError(null);
    setCrinWarnings([]);
    setCrinOutput('');

    if (!crinInput.trim()) {
      setCrinError('Please paste your CrinGraph config.js content.');
      return;
    }

    try {
      const config = parseCrinGraphConfig(crinInput);
      const result: ConversionResult = convertCrinGraphToV2(config);
      setCrinOutput(result.output);
      setCrinWarnings(result.warnings);
    } catch (e) {
      setCrinError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDownload = (content: string) => {
    const blob = new Blob([content], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout title="Config Generator" description="Config Generator for modernGraphTool">
      <div className={styles.cgContainer}>
        <h1><Translate>Config Generator</Translate></h1>
        <p className={styles.cgDescription}>
          <Translate>
            Convert your existing config.js to the v2 format. Paste your config file contents below and click Convert.
          </Translate>
        </p>

        {/* Tabs */}
        <div className={styles.cgTabs}>
          <button
            type="button"
            className={`${styles.cgTab} ${activeTab === 'v1' ? styles.cgTabActive : ''}`}
            onClick={() => setActiveTab('v1')}
          >
            <Translate>v1 to v2</Translate>
          </button>
          <button
            type="button"
            className={`${styles.cgTab} ${activeTab === 'crin' ? styles.cgTabActive : ''}`}
            onClick={() => setActiveTab('crin')}
          >
            <Translate>CrinGraph to v2</Translate>
          </button>
        </div>

        {/* v1 Tab */}
        {activeTab === 'v1' && (
          <div className={styles.cgPanel}>
            <div className={styles.cgInputSection}>
              <label className={styles.cgLabel}>
                <Translate>config.js</Translate>
              </label>
              <textarea
                className={styles.cgTextarea}
                placeholder="Paste your v1 config.js content here..."
                value={v1ConfigInput}
                onChange={(e) => setV1ConfigInput(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className={styles.cgInputSection}>
              <label className={styles.cgLabel}>
                <Translate>extensions.config.js (optional)</Translate>
              </label>
              <textarea
                className={`${styles.cgTextarea} ${styles.cgTextareaSmall}`}
                placeholder="Paste your v1 extensions.config.js content here (optional)..."
                value={v1ExtensionsInput}
                onChange={(e) => setV1ExtensionsInput(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className={styles.cgButtonRow}>
              <button
                type="button"
                className={styles.cgConvertButton}
                onClick={handleV1Convert}
              >
                <Translate>Convert</Translate>
              </button>
              <button
                type="button"
                className={styles.cgDownloadButton}
                disabled={!v1Output}
                onClick={() => handleDownload(v1Output)}
              >
                <Translate>Download config.js</Translate>
              </button>
            </div>

            {v1Error && <div className={styles.cgError}>{v1Error}</div>}

            {v1Warnings.length > 0 && (
              <div className={styles.cgWarnings}>
                <strong><Translate>Warnings:</Translate></strong>
                <ul>
                  {v1Warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {v1Output && (
              <div className={styles.cgOutputSection}>
                <label className={styles.cgLabel}>
                  <Translate>Output</Translate>
                </label>
                <textarea
                  className={styles.cgOutputTextarea}
                  value={v1Output}
                  readOnly
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        )}

        {/* CrinGraph Tab */}
        {activeTab === 'crin' && (
          <div className={styles.cgPanel}>
            <div className={styles.cgInputSection}>
              <label className={styles.cgLabel}>
                <Translate>CrinGraph config.js</Translate>
              </label>
              <textarea
                className={styles.cgTextarea}
                placeholder="Paste your CrinGraph config.js content here..."
                value={crinInput}
                onChange={(e) => setCrinInput(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className={styles.cgButtonRow}>
              <button
                type="button"
                className={styles.cgConvertButton}
                onClick={handleCrinConvert}
              >
                <Translate>Convert</Translate>
              </button>
              <button
                type="button"
                className={styles.cgDownloadButton}
                disabled={!crinOutput}
                onClick={() => handleDownload(crinOutput)}
              >
                <Translate>Download config.js</Translate>
              </button>
            </div>

            {crinError && <div className={styles.cgError}>{crinError}</div>}

            {crinWarnings.length > 0 && (
              <div className={styles.cgWarnings}>
                <strong><Translate>Warnings:</Translate></strong>
                <ul>
                  {crinWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {crinOutput && (
              <div className={styles.cgOutputSection}>
                <label className={styles.cgLabel}>
                  <Translate>Output</Translate>
                </label>
                <textarea
                  className={styles.cgOutputTextarea}
                  value={crinOutput}
                  readOnly
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
