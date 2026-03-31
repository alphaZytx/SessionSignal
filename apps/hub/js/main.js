const statusList = document.getElementById('status-list');
const refreshBtn = document.getElementById('refresh-status');
const navElements = document.querySelectorAll('[data-nav]');
const scrollElements = document.querySelectorAll('[data-scroll]');
const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('.site-nav');
const joinForm = document.getElementById('student-join-form');
const adminLoginForm = document.querySelector('.login-form');
const marketingCounters = document.querySelectorAll('.shell [data-count]');
const adminCounters = document.querySelectorAll('.admin-shell [data-count]');

const STATUS_ENDPOINTS = {
  api: '/api/health',
  teacher: '/teacher/index.html',
  student: '/student/index.html'
};

navToggle?.addEventListener('click', () => {
  siteNav?.classList.toggle('open');
});

navElements.forEach((el) => {
  el.addEventListener('click', () => {
    const target = el.dataset.nav;
    if (!target) return;
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

joinForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(joinForm);
  const name = (formData.get('studentName') || '').toString().trim();
  const session = (formData.get('sessionCode') || '').toString().trim().toUpperCase();
  if (!name || !session) {
    alert('Please enter your name and the session code provided by your teacher.');
    return;
  }
  try {
    localStorage.setItem('classpulseStudentName', name);
    localStorage.setItem('classpulseSessionCode', session);
  } catch (error) {
    console.warn('Unable to persist student info', error);
  }
  window.location.href = '/student';
});

adminLoginForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  alert('Demo login only. Connect Supabase Auth to enable real admin access.');
});

function animateCount(el, overrideTarget) {
  const suffix = el.dataset.suffix || '';
  const target = typeof overrideTarget === 'number' ? overrideTarget : Number(el.dataset.count) || 0;
  const duration = 1200;
  const start = performance.now();

  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const value = Math.floor(progress * target);
    el.textContent = `${value}${suffix}`;
    if (progress < 1) {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

function initCounters(list) {
  if (!list.length) return;
  list.forEach((el, idx) => {
    setTimeout(() => animateCount(el), idx * 120);
  });
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reduceMotion) {
  initCounters(marketingCounters);
  initCounters(adminCounters);
} else {
  [...marketingCounters, ...adminCounters].forEach((el) => {
    const suffix = el.dataset.suffix || '';
    el.textContent = `${el.dataset.count || ''}${suffix}`;
  });
}

if (adminCounters.length && !reduceMotion) {
  setInterval(() => {
    adminCounters.forEach((el) => {
      const base = Number(el.dataset.count) || 0;
      const delta = Math.max(0, base + Math.round(Math.random() * 4 - 2));
      animateCount(el, delta);
      el.dataset.count = String(delta);
    });
  }, 6500);
}

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
  if (!statusList) return;
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

refreshBtn?.addEventListener('click', refreshStatus);
refreshStatus();
