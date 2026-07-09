function isEditorIframe() {
    if (document.body?.classList.contains('mce-content-body')) {
        return true;
    }

    if (window === window.top) {
        return false;
    }

    const frame = window.frameElement;
    if (!frame) {
        return false;
    }

    const identifiers = [
        frame.id,
        frame.name,
        typeof frame.className === 'string' ? frame.className : '',
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return ['tinymce', 'wp-editor-area', 'elementor-wp-editor'].some((marker) =>
        identifiers.includes(marker),
    );
}

(async () => {
    if (isEditorIframe()) {
        return;
    }

    try {
        const contentModule = await import(chrome.runtime.getURL('content.js'));
        new contentModule.default();
        console.log('✅ content.js loaded via content-loader.js');
    } catch (error) {
        console.error('❌ Failed to load content.js as module:', error);
    }
})();