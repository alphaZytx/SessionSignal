chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ path: 'student.html?mode=sidepanel', enabled: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'OPEN_SIDE_PANEL') return false;
  if (chrome.sidePanel?.open) {
    chrome.windows.getCurrent().then((windowInfo) => chrome.sidePanel.open({ windowId: windowInfo.id }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  sendResponse({ ok: false, message: 'Side panel API not available' });
  return false;
});
