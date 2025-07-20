import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import css from 'rollup-plugin-import-css';

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
      moduleDirectories: ['src', 'node_modules']
    }),
    css(),
    terser({
      format: { comments: false },
      mangle: { keep_classnames: true, keep_fnames: true }
    })
  ],
  // Preserve modules that should be loaded dynamically
  external: (id) => {
    // Keep these paths as external modules
    return id.includes('/extensions/') ||
           id.includes('/assets/') ||
           id.includes('/data/') ||
           id.includes('config.js') ||
           id.includes('theme.css');
  },
  onwarn: (warning, warn) => {
    const ignoredWarnings = [{code: 'CIRCULAR_DEPENDENCY', file: 'node_modules/d3-'}];
    // Ignore warnings
    if (!ignoredWarnings.some(w => warning.code === w.code && warning.message.includes(w.file))) {
      warn(warning);
    }
  },
};