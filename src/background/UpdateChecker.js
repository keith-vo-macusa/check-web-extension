const VERSION_CHECK_URL =
    'https://raw.githubusercontent.com/keith-vo-macusa/check-web-extension/main/manifest.json';
const CHECK_INTERVAL = 1;

/**
 * Fetch latest manifest and update extension version metadata in storage.
 */
export async function checkForUpdates() {
    try {
        const response = await fetch(`${VERSION_CHECK_URL}?t=${Date.now()}`);
        if (!response.ok) throw new Error('Failed to fetch version');

        const manifestData = await response.json();
        const latestVersion = manifestData.version;
        const updateData = {
            updateAvailable: isNewerVersion(latestVersion, chrome.runtime.getManifest().version),
            latestVersion,
            updateUrl:
                manifestData.updateUrl ||
                'https://github.com/keith-vo-macusa/check-web-extension/releases/latest',
        };

        await chrome.storage.local.set(updateData);
        console.log(`Update available: ${latestVersion}`);
    } catch (error) {
        console.error('Error checking for updates:', error);
    }
}

/**
 * Configure periodic version checks via Chrome alarms.
 */
export function setupUpdateCheck() {
    chrome.alarms.create('versionCheck', { periodInMinutes: CHECK_INTERVAL });
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'versionCheck') checkForUpdates();
    });
}

/**
 * Compare semantic-like versions.
 */
function isNewerVersion(latestVersion, currentVersion) {
    const latestParts = latestVersion.split('.').map(Number);
    const currentParts = currentVersion.split('.').map(Number);

    for (let index = 0; index < Math.max(latestParts.length, currentParts.length); index++) {
        const latestPart = latestParts[index] || 0;
        const currentPart = currentParts[index] || 0;
        if (latestPart > currentPart) return true;
        if (latestPart < currentPart) return false;
    }

    return false;
}
