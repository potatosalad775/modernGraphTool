import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy'; // Assuming you still want to copy strings
import path from 'path';

export default {
  input: 'extensions/equalizer/main.js',
  output: {
    file: 'dist/extensions/equalizer/main.js',
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
          src: 'extensions/equalizer/strings/*.json',
          dest: 'dist/extensions/equalizer/strings',
        }
      ],
      hook: 'writeBundle'
    })
  ],
  external: (id) => {
    return id.endsWith('core.min.js');
  }
};