const message = document.getElementById('message');

document.getElementById('openPanel').addEventListener('click', () => {
  // In Chrome 116+, chrome.sidePanel.open must be invoked directly in the user gesture
  // context of the click handler, without cross-worker messaging hops.
  chrome.windows.getCurrent((windowInfo) => {
    const windowId = windowInfo?.id;
    if (!windowId) {
      chrome.tabs.create({ url: chrome.runtime.getURL('student.html?mode=sidepanel') })
        .then(() => window.close())
        .catch((err) => { message.textContent = err?.message || 'Could not open Side Panel.'; });
      return;
    }

    if (chrome.sidePanel?.open) {
      chrome.sidePanel.open({ windowId })
        .then(() => window.close())
        .catch((error) => {
          // If sidePanel.open fails (e.g. side panel disabled or window type unsupported),
          // fallback to opening as a tab gracefully
          chrome.tabs.create({ url: chrome.runtime.getURL('student.html?mode=tab') })
            .then(() => window.close())
            .catch((tabErr) => {
              message.textContent = error?.message || tabErr?.message || 'Chrome could not open the Side Panel.';
            });
        });
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('student.html?mode=tab') })
        .then(() => window.close());
    }
  });
});

document.getElementById('openTab').addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('student.html?mode=tab') });
    window.close();
  } catch (error) {
    message.textContent = error.message || 'Chrome could not open the participant dashboard.';
  }
});
