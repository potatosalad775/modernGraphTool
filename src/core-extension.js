const CoreExtension = {
  activeExtensionList: [],

  async init() {
    await this.loadExtensionList();
  },

  async loadExtensionList() {
    this.activeExtensionList = EXTENSION_CONFIG.filter((extension) => extension.ENABLED);
    
    // Load all extensions sequentially
    for (const extension of this.activeExtensionList) {
      try {
        await import(`./extension/${extension.NAME}/main.js`);
        console.log(`modernGraphTool: extension loaded - ${extension.NAME}`);
      } catch (error) {
        console.error(`modernGraphTool: Failed to load extension: ${extension.NAME} -`, error);
      }
    }
  },
}

export default CoreExtension;