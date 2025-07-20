import { GtToast } from './ui/common/gt-toast.js';

const CoreExtension = {
  activeExtensionList: [],
  extensionInstances: new Map(),

  async init() {
    await this.loadExtensionList();
  },

  async loadExtensionList() {
    // Load configuration from a more appropriate location
    const config = await this.loadConfiguration();
    this.activeExtensionList = config.filter((extension) => extension.ENABLED);
    
    // Load all extensions sequentially
    for (const extension of this.activeExtensionList) {
      await this.loadExtension(extension);
    }
  },

  async loadExtension(extension) {
    try {
      // Validate extension configuration
      if (!this.validateExtensionConfig(extension)) {
        throw new Error(`Invalid extension configuration for ${extension.NAME}`);
      }

      // Load the extension module
      const module = await import(`./extensions/${extension.NAME}/main.js`);
      
      // Check for version metadata in the module
      const versionInfo = module.EXTENSION_METADATA || {};
      const compatibility = this.checkVersionCompatibility(extension.NAME, versionInfo);
      
      if (!compatibility.compatible) {
        console.warn(`modernGraphTool: Skipping extension ${extension.NAME} - ${compatibility.error}`);
        GtToast.warning(
          'Incompatible Extension Warning', 
          `Extension '${extension.NAME}' is incompatible with the current core version. Loading extension anyway.`,
          { duration: 10000 }
        );
        //return;
      }

      // Create instance and initialize the extension
      const instance = new module.default(extension.CONFIG);
      
      // Store the instance with version info
      this.extensionInstances.set(extension.NAME, {
        instance,
        metadata: versionInfo
      });
      
      // Initialize the extension
      await instance.init?.();
      
      const versionStr = versionInfo.version ? ` v${versionInfo.version}` : '';
      console.log(`modernGraphTool: extension loaded - ${extension.NAME}${versionStr}`);
    } catch (error) {
      console.error(`modernGraphTool: Failed to load extension: ${extension.NAME} -`, error);
    }
  },

  checkVersionCompatibility(extensionName, metadata) {
    // If no version metadata provided, allow with warning
    if (!metadata.version || !metadata.apiLevel) {
      console.warn(`modernGraphTool: Extension ${extensionName} missing version metadata`);
      return { compatible: true };
    }

    const coreVersion = this.getCoreVersion();
    const coreApiLevel = this.getCoreApiLevel();

    // Check API level compatibility (most important)
    if (metadata.apiLevel !== coreApiLevel) {
      return {
        compatible: false,
        error: `API level mismatch: Extension requires API level ${metadata.apiLevel}, Core provides ${coreApiLevel}`
      };
    }

    // Check minimum version requirement
    if (metadata.coreMinVersion && !this.satisfiesMinVersion(coreVersion, metadata.coreMinVersion)) {
      return {
        compatible: false,
        error: `Core version too old: Extension requires >= ${metadata.coreMinVersion}, found ${coreVersion}`
      };
    }

    // Check maximum version requirement  
    if (metadata.coreMaxVersion && !this.satisfiesMaxVersion(coreVersion, metadata.coreMaxVersion)) {
      return {
        compatible: false,
        error: `Core version too new: Extension supports <= ${metadata.coreMaxVersion}, found ${coreVersion}`
      };
    }

    return { compatible: true };
  },

  getCoreVersion() {
    // Access version from the global CoreAPI or fallback
    return globalThis.CoreAPI?.VERSION || '1.0.0';
  },

  getCoreApiLevel() {
    return globalThis.CoreAPI?.API_LEVEL || 1;
  },

  satisfiesMinVersion(current, minimum) {
    return this.compareVersions(current, minimum) >= 0;
  },

  satisfiesMaxVersion(current, maximum) {
    // Handle wildcards like "1.9.x"
    if (maximum.includes('x')) {
      const maxBase = maximum.replace(/\.x$/, '');
      const currentBase = current.substring(0, maxBase.length);
      return currentBase === maxBase;
    }
    return this.compareVersions(current, maximum) <= 0;
  },

  compareVersions(a, b) {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      
      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }
    return 0;
  },

  validateExtensionConfig(extension) {
    return extension.NAME && typeof extension.NAME === 'string';
  },

  async unloadExtension(extensionName) {
    const extensionData = this.extensionInstances.get(extensionName);
    if (extensionData) {
      await extensionData.instance.destroy?.();
      this.extensionInstances.delete(extensionName);
    }
  },

  getExtension(extensionName) {
    const extensionData = this.extensionInstances.get(extensionName);
    return extensionData?.instance;
  },

  getExtensionMetadata(extensionName) {
    const extensionData = this.extensionInstances.get(extensionName);
    return extensionData?.metadata;
  },

  getExtensionList() {
    return this.activeExtensionList;
  },

  async loadConfiguration() {
    try {
      const { EXTENSION_CONFIG } = await import(import.meta.resolve('./extensions/extensions.config.js'));
      return EXTENSION_CONFIG;
    } catch (error) {
      console.error('modernGraphTool: Failed to load extension configuration -', error);
      return [];
    }
  }
}

export default CoreExtension;