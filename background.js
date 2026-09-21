// 背景服務工作者：把鍵盤快捷鍵轉成訊息送給目前分頁的 content script。
chrome.commands.onCommand.addListener(async (command) => {
  const dir = command === 'go-newer' ? 'newer' : command === 'go-older' ? 'older' : null;
  if (!dir) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !/^https:\/\/www\.youtube\.com\//.test(tab.url || '')) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'ytco-nav', dir });
  } catch (_) {
    // 分頁尚未載入 content script，忽略即可。
  }
});

// 讓 popup 可以開啟 chrome://extensions/shortcuts
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'ytco-open-shortcuts') {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  }
});
