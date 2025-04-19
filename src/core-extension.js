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

      // Load and initialize the extension
      const module = await import(`./extensions/${extension.NAME}/main.js`);
      const instance = new module.default(extension.CONFIG);
      
      // Store the instance
      this.extensionInstances.set(extension.NAME, instance);
      
      // Initialize the extension
      await instance.init?.();
      
      console.log(`modernGraphTool: extension loaded - ${extension.NAME}`);
    } catch (error) {
      console.error(`modernGraphTool: Failed to load extension: ${extension.NAME} -`, error);
    }
  },

  validateExtensionConfig(extension) {
    return extension.NAME && typeof extension.NAME === 'string';
  },

  async unloadExtension(extensionName) {
    const instance = this.extensionInstances.get(extensionName);
    if (instance) {
      await instance.destroy?.();
      this.extensionInstances.delete(extensionName);
    }
  },

  getExtension(extensionName) {
    return this.extensionInstances.get(extensionName);
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