// Background service worker for Website Testing Assistant

chrome.runtime.onInstalled.addListener(() => {
    console.log('Website Testing Assistant extension installed');
});

// Handle messages between popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Forward messages if needed
    if (request.action === 'errorAdded') {
        // Notify all tabs that an error was added
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, request).catch(() => {
                    // Ignore errors for tabs without content script
                });
            });
        });
    }
    
    return true; // Keep message channel open
});

// Handle tab updates to refresh error markers
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Inject content script if needed
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['lib/jquery.min.js', 'content.js']
        }).catch(() => {
            // Ignore errors for special pages
        });
    }
});

// Clean up old data periodically (optional)
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cleanup') {
        cleanupOldData();
    }
});

// Create cleanup alarm (runs daily)
chrome.alarms.create('cleanup', { delayInMinutes: 1440, periodInMinutes: 1440 });

function cleanupOldData() {
    chrome.storage.local.get(null, (data) => {
        const now = Date.now();
        const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000); // 1 week in milliseconds
        
        Object.keys(data).forEach(url => {
            if (Array.isArray(data[url])) {
                // Filter out errors older than 1 week
                const filteredErrors = data[url].filter(error => 
                    error.timestamp > oneWeekAgo
                );
                
                if (filteredErrors.length !== data[url].length) {
                    chrome.storage.local.set({ [url]: filteredErrors });
                }
            }
        });
    });
} 