const VERSION_CHECK_URL = 'https://raw.githubusercontent.com/keith-vo-macusa/check-web-extension/main/manifest.json';
const CHECK_INTERVAL = 1; // 1 minute

export async function checkForUpdates() {
  try {
    const response = await fetch(`${VERSION_CHECK_URL}?t=${Date.now()}`);
    if (!response.ok) throw new Error('Failed to fetch version');

    const data = await response.json();
    const latestVersion = data.version;
    const currentVersion = chrome.runtime.getManifest().version;

    const dataUpdated = {
      updateAvailable: isNewerVersion(latestVersion, currentVersion),
      latestVersion: latestVersion,
      updateUrl: data.updateUrl || 'https://github.com/keith-vo-macusa/check-web-extension/releases/latest',
    };
    await chrome.storage.local.set(dataUpdated);
    console.log(`Update available: ${latestVersion}`);
  } catch (error) {
    console.error('Error checking for updates:', error);
  }
}

export function setupUpdateCheck() {
  chrome.alarms.create('versionCheck', { periodInMinutes: CHECK_INTERVAL });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'versionCheck') {
      checkForUpdates();
    }
  });
}

function isNewerVersion(latest, current) {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);

  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;

    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }
  return false;
}