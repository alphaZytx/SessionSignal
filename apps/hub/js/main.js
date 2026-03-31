const cards = document.querySelectorAll('.card[data-target]');
const statusList = document.getElementById('status-list');
const refreshBtn = document.getElementById('refresh-status');

const STATUS_ENDPOINTS = {
  api: '/api/health',
  teacher: '/teacher/index.html',
  student: '/student/index.html'
};

cards.forEach((card) => {
  card.addEventListener('click', () => {
    const target = card.dataset.target;
    if (!target) {
      return;
    }
    if (target.startsWith('http')) {
      window.open(target, '_blank');
      return;
    }
    window.location.href = target;
  });
});

async function checkEndpoint(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    return response.ok;
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function refreshStatus() {
  const entries = Array.from(statusList.querySelectorAll('li'));
  await Promise.all(
    entries.map(async (entry) => {
      const app = entry.dataset.app;
      const pill = entry.querySelector('.status-pill');
      pill.textContent = 'checking...';
      pill.classList.remove('ready');
      pill.classList.add('pending');
      const ok = await checkEndpoint(STATUS_ENDPOINTS[app]);
      pill.textContent = ok ? 'ready' : 'offline';
      pill.classList.toggle('ready', ok);
      pill.classList.toggle('pending', !ok);
    })
  );
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', refreshStatus);
}

refreshStatus();
