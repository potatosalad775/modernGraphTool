import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy'; // Assuming you still want to copy strings
import path from 'path';

export default {
  input: 'extensions/graph-color-wheel/main.js',
  output: {
    file: 'dist/extensions/graph-color-wheel/main.js',
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
          src: 'extensions/graph-color-wheel/strings/*.json',
          dest: 'dist/extensions/graph-color-wheel/strings',
        },
        {
          src: 'extensions/graph-color-wheel/README.md',
          dest: 'dist/extensions/graph-color-wheel',
        }
      ],
      hook: 'writeBundle'
    })
  ],
  external: (id) => {
    return id.endsWith('core.min.js');
  }
};