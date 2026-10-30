const headerTarget = document.querySelector('[data-site-header]');
const footerTarget = document.querySelector('[data-site-footer]');

const nav = [
  ['/features', 'Features'], ['/how-it-works', 'How it works'],
  ['/facilitators', 'Facilitators'], ['/participants', 'Participants'], ['/privacy', 'Privacy']
];

if (headerTarget) {
  headerTarget.innerHTML = `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <header class="site-header">
      <a class="brand" href="/" aria-label="SessionSignal home"><span class="brand-mark" aria-hidden="true">SS</span><span>SessionSignal</span></a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="Open navigation"><span></span><span></span></button>
      <nav id="primary-nav" class="primary-nav" aria-label="Primary navigation">
        ${nav.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}
        <a class="button button-small button-quiet" href="/facilitators/login">Facilitator sign in</a>
        <a class="button button-small" href="/participants/install">Get the extension</a>
      </nav>
    </header>`;
  const toggle = headerTarget.querySelector('.nav-toggle');
  const primary = headerTarget.querySelector('.primary-nav');
  const closeMenu = () => {
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', 'Open navigation');
    primary?.classList.remove('open');
  };
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    primary.classList.toggle('open', open);
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
  primary?.addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });

  const currentPath = location.pathname.replace(/\/$/, '') || '/';
  primary?.querySelectorAll('a[href]').forEach((link) => {
    if (link.getAttribute('href') === currentPath) link.setAttribute('aria-current', 'page');
  });
}

if (footerTarget) {
  const support = import.meta.env.VITE_SUPPORT_EMAIL;
  footerTarget.innerHTML = `
    <footer class="site-footer">
      <div><a class="brand brand-footer" href="/"><span class="brand-mark">SS</span><span>SessionSignal</span></a><p>Local-first participation indicators for live sessions.</p></div>
      <div><h2>Product</h2><a href="/features">Features</a><a href="/how-it-works">How it works</a><a href="/facilitators">For facilitators</a><a href="/participants">For participants</a></div>
      <div><h2>Resources</h2><a href="/participants/install">Beta installation</a><a href="/privacy">Privacy</a><a href="/contact">Contact</a><a href="/facilitators/login">Facilitator portal</a></div>
      <div><h2>Important</h2><p>SessionSignal provides camera-based estimates. It does not measure learning, intent, emotion, or mental state and must not drive high-stakes decisions.</p>${support ? `<a href="mailto:${support}">${support}</a>` : ''}</div>
      <p class="footer-bottom">© ${new Date().getFullYear()} SessionSignal. Controlled beta software.</p>
    </footer>`;
}

document.querySelectorAll('[data-faq-button]').forEach((button, index) => {
  const answer = button.nextElementSibling;
  const answerId = answer?.id || `faq-answer-${index + 1}`;
  if (answer) { answer.id = answerId; answer.hidden = true; }
  button.setAttribute('aria-controls', answerId);
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    button.closest('.faq-item')?.classList.toggle('open', !expanded);
    if (answer) answer.hidden = expanded;
  });
});

if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.12 });
  document.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
} else document.querySelectorAll('[data-reveal]').forEach((element) => element.classList.add('revealed'));
