import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy'; // Assuming you still want to copy strings
import path from 'path';

export default {
  input: 'extensions/preference-bound/main.js',
  output: {
    file: 'dist/extensions/preference-bound/main.js',
    format: 'es', // ES module format
    sourcemap: true,
    inlineDynamicImports: true, // Bundle internal components (like eq-filter-list.js)
  },
  plugins: [
    resolve(), // Resolves node_modules imports if any
    terser({ // Minify the output
      format: { comments: false },
      mangle: { keep_classnames: true, keep_fnames: true }
    }),
    // Optional: Copy JSON strings if needed for this extension
    copy({
      targets: [
        {
          src: 'extensions/preference-bound/strings/*.json',
          dest: 'dist/extensions/preference-bound/strings',
        },
        {
          src: 'extensions/preference-bound/data/*.txt',
          dest: 'dist/extensions/preference-bound/data',
        },
        {
          src: 'extensions/preference-bound/README.md',
          dest: 'dist/extensions/preference-bound',
        }
      ],
      hook: 'writeBundle'
    })
  ],
  external: (id) => {
    return id.endsWith('core.min.js');
  },
  onwarn: (warning, warn) => {
    const ignoredWarnings = [{code: 'CIRCULAR_DEPENDENCY', file: 'node_modules/d3-'}];
    // Ignore warnings
    if (!ignoredWarnings.some(w => warning.code === w.code && warning.message.includes(w.file))) {
      warn(warning);
    }
  },
};