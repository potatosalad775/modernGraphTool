import { fromRollup } from '@web/dev-server-rollup';
import rollupReplace from '@rollup/plugin-replace';

const replace = fromRollup(rollupReplace);

export default {
  rootDir: 'dist',
  appIndex: 'dist/index.html',
  nodeResolve: true,
  preserveSymlinks: true,
  plugins: [
    replace({
      include: ['src/**/*.js'],
      __environment__: '"development"'
    })
  ],
  middleware: [
    function rewriteIndex(context, next) {
      if (context.url === '/') {
        context.url = '/dist/';
      }
      return next();
    }
  ],
  watch: true,
  open: true,
  // Handle source maps
  middleware: [
    function rewriteSourceMap(context, next) {
      if (context.url.endsWith('.map')) {
        context.url = `/src${context.url}`;
      }
      return next();
    }
  ]
};