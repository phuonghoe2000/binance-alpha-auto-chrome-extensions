import 'webextension-polyfill';

chrome.action.onClicked.addListener(async tab => {
  // Gắn bảng phụ với thẻ hiện tại và hiển thị
  await chrome.sidePanel.open({ tabId: tab.id! });
});
