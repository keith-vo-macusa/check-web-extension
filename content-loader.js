// File này chỉ để load ES module
(async () => {
    try {
        const module = await import(chrome.runtime.getURL('content.js'));
        const AppClass = module.default;
        const appInstance = new AppClass();
        console.log('✅ content.js loaded via content-loader.js');
    } catch (err) {
        console.error('❌ Failed to load content.js as module:', err);
    }
})();
