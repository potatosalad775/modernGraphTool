import CoreEvent from './core-event.js';
import CoreExtension from './core-extension.js';
import DataProvider from './model/data-provider.js';
import MenuState from './model/menu-state.js';
import RenderEngine from './ui/visualization/render-engine.js';
import MetadataParser from './model/util/metadata-parser.js';
import StringLoader from './model/util/string-loader.js';
import FRParser from './model/util/fr-parser.js';
import FRNormalizer from './model/util/fr-normalizer.js';
import FRSmoother from './model/util/fr-smoother.js';
import URLProvider from "./model/url-provider.js";

// Create namespace object
const CoreAPI = {
  CoreEvent,
  CoreExtension,
  DataProvider,
  MenuState,
  RenderEngine,
  MetadataParser,
  StringLoader,
  FRParser,
  FRNormalizer,
  FRSmoother,
  URLProvider,
};

// Export both namespace and individual exports
export {
  CoreEvent,
  CoreExtension,
  DataProvider,
  MenuState,
  RenderEngine,
  MetadataParser,
  StringLoader,
  FRParser,
  FRNormalizer,
  FRSmoother,
  URLProvider,
};

// Export namespace as default
export default CoreAPI;