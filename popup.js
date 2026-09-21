// 依瀏覽器語言填入介面文字
document.querySelectorAll('[data-i18n]').forEach((el) => {
  el.textContent = chrome.i18n.getMessage(el.dataset.i18n) || el.dataset.i18n;
});
document.documentElement.lang = chrome.i18n.getUILanguage();

const DEFAULTS = { autoplay: true, direction: 'newer', includeShorts: false, delay: 0, showPanel: true };
const els = {
  autoplay: document.getElementById('autoplay'),
  direction: document.getElementById('direction'),
  delay: document.getElementById('delay'),
  includeShorts: document.getElementById('includeShorts'),
  showPanel: document.getElementById('showPanel'),
};

chrome.storage.sync.get(DEFAULTS, (v) => {
  els.autoplay.checked = v.autoplay;
  els.direction.value = v.direction;
  els.delay.value = v.delay;
  els.includeShorts.checked = v.includeShorts;
  els.showPanel.checked = v.showPanel;
});

els.autoplay.addEventListener('change', () => chrome.storage.sync.set({ autoplay: els.autoplay.checked }));
els.direction.addEventListener('change', () => chrome.storage.sync.set({ direction: els.direction.value }));
els.delay.addEventListener('change', () => {
  const n = Math.max(0, Math.min(30, parseInt(els.delay.value, 10) || 0));
  els.delay.value = n;
  chrome.storage.sync.set({ delay: n });
});
els.includeShorts.addEventListener('change', () => chrome.storage.sync.set({ includeShorts: els.includeShorts.checked }));
els.showPanel.addEventListener('change', () => chrome.storage.sync.set({ showPanel: els.showPanel.checked }));

document.getElementById('shortcuts').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'ytco-open-shortcuts' });
});
