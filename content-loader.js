(async () => {
    try {
        const contentModule = await import(chrome.runtime.getURL('content.js'));
        new contentModule.default();
        console.log('✅ content.js loaded via content-loader.js');
    } catch (error) {
        console.error('❌ Failed to load content.js as module:', error);
    }
})();
