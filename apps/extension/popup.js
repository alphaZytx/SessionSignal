const message = document.getElementById('message');
document.getElementById('openPanel').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
  if (response?.ok) window.close();
  else message.textContent = response?.message || 'Chrome could not open the Side Panel.';
});
document.getElementById('openTab').addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('student.html?mode=tab') });
    window.close();
  } catch (error) {
    message.textContent = error.message || 'Chrome could not open the participant dashboard.';
  }
});
