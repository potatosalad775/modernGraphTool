import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import css from 'rollup-plugin-import-css';
import rollupReplace from '@rollup/plugin-replace';
import { fromRollup } from '@web/dev-server-rollup';

const replace = fromRollup(rollupReplace);

export default {
  input: 'src/core-ui.js',
  output: {
    file: 'dist/core.min.js',
    format: 'es',
    sourcemap: true,
    inlineDynamicImports: true, // Inline dynamic imports for extensions
  },
  plugins: [
    resolve({
      // Ensure all local modules are bundled
      moduleDirectories: ['src'],
      rootDir: 'src',
      moduleDirectories: ['src', 'node_modules']
    }),
    css(),
    terser({
      format: {
        comments: false
      },
      mangle: {
        keep_classnames: true,
        keep_fnames: true
      }
    })
  ],
  // Preserve modules that should be loaded dynamically
  external: (id) => {
    // Keep these paths as external modules
    return id.includes('/extension/') ||
           id.includes('/assets/') ||
           id.includes('/data/') ||
           id.includes('config.js') ||
           id.includes('theme.css');
  }
};