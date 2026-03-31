const statusList = document.getElementById('status-list');
const refreshBtn = document.getElementById('refresh-status');
const navElements = document.querySelectorAll('[data-nav]');
const scrollElements = document.querySelectorAll('[data-scroll]');

const STATUS_ENDPOINTS = {
  api: '/api/health',
  teacher: '/teacher/index.html',
  student: '/student/index.html'
};

navElements.forEach((el) => {
  el.addEventListener('click', () => {
    const target = el.dataset.nav;
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

scrollElements.forEach((el) => {
  el.addEventListener('click', () => {
    const selector = el.dataset.scroll;
    if (!selector) return;
    const block = document.querySelector(selector);
    block?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
