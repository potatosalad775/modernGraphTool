import React, { type ReactNode } from 'react';
import Layout from '@theme/Layout';
import Translate from '@docusaurus/Translate';
import ConfigEditor from '@site/src/components/ConfigEditor/ConfigEditor';

export default function ConfigEditorPage(): ReactNode {
  return (
    <Layout title="Config Editor" description="Config Editor for modernGraphTool">
      <div style={{ padding: '1rem 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem' }}>
          <h1><Translate>Config Editor</Translate></h1>
          <p style={{ color: 'var(--ifm-color-content-secondary)', marginBottom: '1.5rem' }}>
            <Translate>
              Build or edit your modernGraphTool config.js with a visual editor. Import an existing config, adjust settings, and export the result.
            </Translate>
          </p>
        </div>
        <ConfigEditor />
      </div>
    </Layout>
  );
}
