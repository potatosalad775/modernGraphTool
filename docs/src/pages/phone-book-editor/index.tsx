import React, { type ReactNode } from 'react';
import Layout from '@theme/Layout';
import Translate from '@docusaurus/Translate';
import PhoneBookEditor from '@site/src/components/PhoneBookEditor/PhoneBookEditor';

export default function PhoneBookEditorPage(): ReactNode {
  return (
    <Layout
      title="phone_book.json Editor"
      description="phone_book.json Editor for modernGraphTool"
    >
      <div style={{ padding: '1rem 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem' }}>
          <h1>
            <Translate>phone_book.json Editor</Translate>
          </h1>
          <p
            style={{
              color: 'var(--ifm-color-content-secondary)',
              marginBottom: '1.5rem',
            }}
          >
            <Translate>
              Build or edit your modernGraphTool phone_book.json with a visual editor. Import an existing file, adjust brands and phones, and export the result.
            </Translate>
          </p>
        </div>
        <PhoneBookEditor />
      </div>
    </Layout>
  );
}
