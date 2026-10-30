const KEY = 'sessionsignal.monitoringLease';
const TTL_MS = 15_000;

export class MonitoringLease {
  constructor() {
    this.ownerId = crypto.randomUUID();
    this.timer = null;
    this.releaseLock = null;
    this.lockRequest = null;
  }

  async acquire(sessionId) {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      let resolveDecision;
      const decision = new Promise((resolve) => { resolveDecision = resolve; });
      this.lockRequest = navigator.locks.request(KEY, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) { resolveDecision(false); return; }
        await chrome.storage.local.set({ [KEY]: {
          ownerId: this.ownerId, sessionId, expiresAt: Date.now() + TTL_MS, mechanism: 'web-lock'
        } });
        resolveDecision(true);
        await new Promise((resolve) => { this.releaseLock = resolve; });
      });
      this.lockRequest.catch(() => resolveDecision(false));
      return decision;
    }

    const stored = await chrome.storage.local.get(KEY);
    const lease = stored[KEY];
    if (lease && lease.expiresAt > Date.now() && lease.ownerId !== this.ownerId) return false;
    const candidate = { ownerId: this.ownerId, sessionId, expiresAt: Date.now() + TTL_MS };
    await chrome.storage.local.set({ [KEY]: candidate });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const confirmed = (await chrome.storage.local.get(KEY))[KEY];
    if (confirmed?.ownerId !== this.ownerId) return false;
    this.timer = setInterval(() => this.renew(sessionId), TTL_MS / 3);
    return true;
  }

  async renew(sessionId) {
    if (this.releaseLock) {
      await chrome.storage.local.set({ [KEY]: {
        ownerId: this.ownerId, sessionId, expiresAt: Date.now() + TTL_MS, mechanism: 'web-lock'
      } });
      return true;
    }
    const lease = (await chrome.storage.local.get(KEY))[KEY];
    if (lease?.ownerId !== this.ownerId) return false;
    await chrome.storage.local.set({ [KEY]: { ownerId: this.ownerId, sessionId, expiresAt: Date.now() + TTL_MS } });
    return true;
  }

  async release() {
    clearInterval(this.timer);
    this.timer = null;
    this.releaseLock?.();
    this.releaseLock = null;
    const lease = (await chrome.storage.local.get(KEY))[KEY];
    if (lease?.ownerId === this.ownerId) await chrome.storage.local.remove(KEY);
    await this.lockRequest?.catch(() => {});
    this.lockRequest = null;
  }
}
