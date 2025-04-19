import { fromRollup } from '@web/dev-server-rollup';
import rollupReplace from '@rollup/plugin-replace';

const replace = fromRollup(rollupReplace);

export default {
  nodeResolve: true, // Keep this for module resolution
  preserveSymlinks: true,

  // Plugins can remain if needed, like environment replacement
  plugins: [
    replace({
      // Ensure this include path is correct relative to the project root
      // when web-dev-server runs
      include: ['**/src/**/*.js', '**/extensions/**/*.js'], // Adjusted to potentially catch extension files too
      preventAssignment: true, 
      values: { // Use 'values' property for replacements
        __environment__: '"development"'
      }
    })
  ],
};