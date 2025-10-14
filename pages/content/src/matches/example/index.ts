import { sampleFunction } from '@src/sample-function';

console.log('[CEB] Example content script loaded');

void sampleFunction();

// const s = document.createElement('script');
// s.src = chrome.runtime.getURL('popup/injected.js'); // đặt trong thư mục tiện ích
// console.log('[CEB] Injecting popup/injected.js', s);
// (document.head || document.documentElement).appendChild(s);
