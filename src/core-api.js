import CoreEvent from './core-event.js';
import CoreExtension from './core-extension.js';
import DataProvider from './model/data-provider.js';
import MenuState from './model/menu-state.js';
import MetadataParser from './model/util/metadata-parser.js';
import StringLoader from './model/util/string-loader.js';
import FRParser from './model/util/fr-parser.js';
import FRNormalizer from './model/util/fr-normalizer.js';
import FRSmoother from './model/util/fr-smoother.js';
import URLProvider from "./model/url-provider.js";
import GraphEngine from './features/graph/graph-engine.js';
import { GtToast } from './shared/atoms/gt-toast.js';

// Create namespace object
const CoreAPI = {
  // Version information
  VERSION: '1.0.1',
  API_LEVEL: 1,
  RELEASE_DATE: '2025-12-04',
  
  // Core modules
  CoreEvent,
  CoreExtension,
  DataProvider,
  MenuState,
  GraphEngine,
  MetadataParser,
  StringLoader,
  FRParser,
  FRNormalizer,
  FRSmoother,
  URLProvider,
  GtToast,
};

// Export both namespace and individual exports
export {
  CoreEvent,
  CoreExtension,
  DataProvider,
  MenuState,
  GraphEngine,
  MetadataParser,
  StringLoader,
  FRParser,
  FRNormalizer,
  FRSmoother,
  URLProvider,
  GtToast,
};

// Log Core API load
console.log(`modernGraphTool: core loaded - v${CoreAPI.VERSION} (API Level ${CoreAPI.API_LEVEL})`);

// Export namespace as default
export default CoreAPI;