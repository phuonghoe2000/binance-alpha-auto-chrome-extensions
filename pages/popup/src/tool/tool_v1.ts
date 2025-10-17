declare global {
  interface Window {
    setValue: (selector: string, value: string) => void;
  }
}

export const injectDependencies = async (tab: chrome.tabs.Tab) => {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    world: 'MAIN',
    func: () => {
      Object.defineProperty(navigator, 'credentials', {
        value: {
          get: async () => {
            throw new DOMException('NotAllowedError', 'NotAllowedError');
          },
          create: async () => {
            throw new DOMException('NotAllowedError', 'NotAllowedError');
          },
        },
        configurable: false,
      });
    },
  });
};

export const callChromeJs = async <T, A extends any[] = []>(
  tab: chrome.tabs.Tab,
  args: A,
  func: (...args: A) => { error: string; val: T } | Promise<{ error: string; val: T }>,
): Promise<T> => {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func,
    args: (args ?? []) as A,
  });

  if (!result?.result) {
    throw new Error('Chạy script thất bại: không có kết quả trả về');
  }

  const { error, val } = result.result;

  if (error) {
    throw new Error(error);
  }

  return val;
};

// Lấy ID giao diện alpha
export const getId = async (tab: chrome.tabs.Tab, api: string) => {
  const name = await callChromeJs(tab, [], () => {
    try {
      const dom = document.querySelector('.bg-BasicBg .text-PrimaryText');
      return { error: '', val: dom?.textContent.trim() };
    } catch (err: any) {
      return { error: err.message, val: '' };
    }
  });
  if (!name) return '';
  api = api.lastIndexOf('/') === api.length - 1 ? api.slice(0, -1) : api;
  const listRequest = await fetch(`${api}/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list`);
  const list = (await listRequest.json()).data as { alphaId: string; symbol: string; mulPoint: number }[];
  const cur = list.find(c => c.symbol === name);
  if (!cur) return '';
  return { symbol: `${cur.alphaId}USDT`, mul: cur.mulPoint };
};

export interface Trade {
  T: number; // Dấu thời gian
  p: string; // Giá
  q: string; // Khối lượng giao dịch
  m: boolean; // Bên bán chủ động hay không
}

// Lấy giá
export const getPrice = async (symbol: string, api: string) => {
  api = api.lastIndexOf('/') === api.length - 1 ? api.slice(0, -1) : api;
  const request = await fetch(`${api}/bapi/defi/v1/public/alpha-trade/agg-trades?symbol=${symbol}&limit=1`);
  const json = (await request.json()) as { data: Trade[] };
  const cur = json.data[json.data.length - 1];
  return cur.p;
};

export const getPriceList = async (symbol: string, api: string) => {
  api = api.lastIndexOf('/') === api.length - 1 ? api.slice(0, -1) : api;
  const request = await fetch(`${api}/bapi/defi/v1/public/alpha-trade/agg-trades?symbol=${symbol}&limit=15`);
  const json = (await request.json()) as { data: AggTrade[] };
  return json.data;
};

export const jumpToSell = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], async () => {
    try {
      const sellPanel = document.querySelector('.bn-tab__buySell[aria-controls="bn-tab-pane-1"]') as HTMLButtonElement;
      if (!sellPanel) throw new Error('Không tìm thấy phần tử bảng bán, hãy kiểm tra trang có chính xác không');
      sellPanel.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      sellPanel.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

export const jumpToBuy = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], async () => {
    try {
      const buyPanel = document.querySelector('.bn-tab__buySell[aria-controls="bn-tab-pane-0"]') as HTMLButtonElement;
      if (!buyPanel) throw new Error('Không tìm thấy phần tử bảng mua, hãy kiểm tra trang có chính xác không');
      buyPanel.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      buyPanel.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

export const setPrice = async (tab: chrome.tabs.Tab, price: string) => {
  await injectDependencies(tab);
  return await callChromeJs(tab, [price], async price => {
    try {
      const setValue = (selector: string | HTMLInputElement, value: string) => {
        const input = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!input) throw new Error('Phần tử input không tồn tại');
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      // Giá bán
      setValue('input#limitPrice', price);
      await new Promise(resolve => setTimeout(resolve, 16));
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });
};

export const setRangeValue = async (tab: chrome.tabs.Tab, value: string) => {
  await injectDependencies(tab);
  return await callChromeJs(tab, [value], async value => {
    try {
      const setValue = (selector: string | HTMLInputElement, value: string) => {
        const input = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!input) throw new Error('Phần tử input không tồn tại');
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      // Thiết lập số lượng bán
      setValue('.flexlayout__tab[data-layout-path="/r1/ts0/t0"] input[type="range"]', value);
      await new Promise(resolve => setTimeout(resolve, 16));
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });
};

export const setLimitTotal = async (tab: chrome.tabs.Tab, value: string) => {
  await injectDependencies(tab);
  return await callChromeJs(tab, [value], async value => {
    try {
      const setValue = (selector: string | HTMLInputElement, value: string) => {
        const input = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!input) throw new Error('Phần tử input không tồn tại');
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      // Thiết lập số lượng bán
      setValue('.flexlayout__tab[data-layout-path="/r1/ts0/t0"] #limitTotal', value);
      await new Promise(resolve => setTimeout(resolve, 16));
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });
};

// Gửi lệnh bán
export const callSubmit = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], async () => {
    try {
      // Xác nhận bán
      const submitBtn = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] button.bn-button',
      ) as HTMLButtonElement;
      if (!submitBtn) throw new Error('Không tìm thấy nút gửi, hãy kiểm tra trang có chính xác không');
      submitBtn.click();
      let click = false;
      // Đóng hộp thoại
      let count = 0;
      // 1000 / 30: 30fps mỗi giây, tối đa chờ 1 giây
      while (count < 32) {
        await new Promise(resolve => setTimeout(resolve, 1000 / 30));
        // Chờ lần kiểm tra thứ hai đầy đủ để tránh nhiều hộp thoại rủi ro
        if (click) {
          await new Promise(resolve => setTimeout(resolve, 500));
          return { error: '', val: false };
        }
        const btn = document
          .querySelector(`div[role='dialog'][class='bn-modal-wrap data-size-small']`)
          ?.querySelector('.bn-button__primary') as HTMLButtonElement;

        // 等到第二次完整校验。避免多个风险弹窗
        if (click && !btn) {
          await new Promise(resolve => setTimeout(resolve, 500));
          return { error: '', val: false };
        }

        if (btn) {
          btn.click();
          click = true;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        count++;
      }
      return { error: 'Thao tác quá thời gian, hãy làm mới trang rồi thử lại', val: true };
    } catch (error: any) {
      return { error: error.message, val: true };
    }
  });

export const callBuySubmit = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], async () => {
    try {
      const btn = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] button[class="bn-button bn-button__buy data-size-middle w-full"]',
      ) as HTMLButtonElement;
      if (!btn) {
        throw new Error('Không tìm thấy nút mua, hãy làm mới trang và kiểm tra trang có chính xác không');
      }
      btn.click();
      // Đóng hộp thoại
      let count = 0;
      // 1000 / 30: 30fps mỗi giây, tối đa chờ 1 giây
      while (count < 32) {
        await new Promise(resolve => setTimeout(resolve, 1000 / 30));
        const btn = document
          .querySelector(`div[role='dialog'][class='bn-modal-wrap data-size-small']`)
          ?.querySelector('.bn-button__primary') as HTMLButtonElement;
        if (btn) {
          btn.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          return { error: '', val: false };
        }
        count++;
      }
      return { error: 'Thao tác quá thời gian, hãy làm mới trang rồi thử lại', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

// Chờ lệnh hoàn tất
export const waitOrder = async (tab: chrome.tabs.Tab, timeout: number = 3) =>
  await callChromeJs(tab, [timeout], async timeout => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const start = Date.now();
      while (true) {
        // Lấy danh sách lệnh
        const orderList = Array.from(document.querySelectorAll('#bn-tab-pane-orderOrder .bn-web-table-row'));
        if (orderList.length === 0) break;
        // Nếu tồn tại và quá thời gian thì hủy, đồng thời trả về trạng thái quá hạn (đơn vị timeout là giây)
        if (Date.now() - start > timeout * 1000) {
          orderList.forEach(order => {
            const evt = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
            });
            order.querySelector('td[aria-colindex="9"] svg')?.dispatchEvent(evt);
          });
          await new Promise(resolve => setTimeout(resolve, 500));
          return { error: 'Chờ lệnh quá thời gian, chờ và thử lại', val: true };
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

// Có xuất hiện hộp thoại xác thực hay không
export const isAuthModal = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], () => {
    try {
      const dialog = document.querySelector('#mfa-shadow-host');
      if (dialog) {
        return { error: '', val: true };
      }
      return { error: '', val: false };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

// Kiểm tra xem có lệnh bán hay không
export const getIsSell = async (tab: chrome.tabs.Tab) => {
  await injectDependencies(tab);
  return await callChromeJs(tab, [], async () => {
    try {
      const sellPanel = document.querySelector('.bn-tab__buySell[aria-controls="bn-tab-pane-1"]') as HTMLButtonElement;
      if (!sellPanel) {
        throw new Error('Không tìm thấy phần tử bảng bán, hãy làm mới trang và kiểm tra trang có chính xác không');
      }
      sellPanel.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      sellPanel.click();
      await new Promise(resolve => setTimeout(resolve, 300));

      const priceEl = document.querySelector(
        `.ReactVirtualized__List div[class='flex-1 cursor-pointer']`,
      ) as HTMLSpanElement;
      if (!priceEl) throw new Error('Không tìm thấy phần tử giá, hãy làm mới trang và kiểm tra trang có chính xác không');
      const sellPrice = priceEl.textContent.trim();
      const setValue = (selector: string | HTMLInputElement, value: string) => {
        const input = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!input) throw new Error('Phần tử input không tồn tại');
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setValue('input#limitPrice', sellPrice);
      await new Promise(resolve => setTimeout(resolve, 16));
      setValue('.flexlayout__tab[data-layout-path="/r1/ts0/t0"] input[type="range"]', '100');
      await new Promise(resolve => setTimeout(resolve, 16));
      const error = document.querySelector('div.bn-textField__line.data-error')?.querySelector('#limitTotal');
      if (error) {
        return { error: '', val: true };
      }
      const input = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] #limitTotal',
      ) as HTMLInputElement;
      if (!input) throw new Error('Không tìm thấy ô nhập số lượng, hãy làm mới trang và kiểm tra trang có chính xác không');
      if (Number(input.value) >= 1) return { error: '', val: true };
      return { error: '', val: false };
    } catch (error: any) {
      return { error: error.message, val: true };
    }
  });
};
// Bán dự phòng
export const backSell = async (
  tab: chrome.tabs.Tab,
  api: string,
  symbol: string,
  appendLog: (msg: string, type: 'success' | 'error' | 'info') => void,
  timeout: number = 3,
) => {
  while (true) {
    try {
      const isSell = await getIsSell(tab);
      if (!isSell) return;
      // await jumpToSell(tab); // Chuyển sang tab bán
      const price = await getPrice(symbol, api); // Lấy giá
      if (!price) throw new Error('Không thể lấy giá');
      // const sellPrice = (Number(price) - Number(price) * 0.0001).toString();
      const sellPrice = (Number(price) - Number(price) * 0.00006).toString();
      await closeReverseOrder(tab); // Đóng lệnh đảo chiều
      // Thiết lập giá bán
      await setPrice(tab, sellPrice);
      // Thiết lập số lượng bán
      await setRangeValue(tab, '100');
      // Thực hiện bán
      await callSubmit(tab);
      // Kiểm tra có xuất hiện mã xác thực hay không
      const isAuth = await isAuthModal(tab);
      // Nếu có hộp thoại xác thực thì chờ
      if (isAuth) await new Promise(resolve => setTimeout(resolve, 3000));
      // Chờ lệnh hoàn tất
      await waitOrder(tab, timeout);
      appendLog(`Bán thành công: Giá ${sellPrice}`, 'success');
    } catch (error: any) {
      console.error(error);
      appendLog(error.message, 'error');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};

export type AggTrade = {
  a: number;
  p: string; // price as string
  q: string; // qty as string
  f: number;
  l: number;
  T: number; // Dấu thời gian (ms)
  m?: boolean;
};

/**
 * Kiểm tra từ buyPrice/buyIndex/buyTs đến trong cửa sổ có xuất hiện mức giảm vượt quá thresholdPct hay không
 */
export const detectDropRisk = (
  trades: AggTrade[],
  options?: {
    buyPrice?: number;
    buyIndex?: number;
    buyTs?: number;
    windowMs?: number;
    thresholdPct?: number;
    volumeWeighted?: boolean;
  },
) => {
  const { buyPrice, buyIndex, buyTs, windowMs = 5000, thresholdPct = 0.1, volumeWeighted = false } = options ?? {};

  if (!Array.isArray(trades) || trades.length === 0) {
    throw new Error('invalid trades');
  }

  // Tìm chỉ số bắt đầu
  let startIdx = 0;
  if (typeof buyIndex === 'number') {
    startIdx = Math.max(0, Math.min(trades.length - 1, buyIndex));
  } else if (typeof buyTs === 'number') {
    startIdx = trades.findIndex(t => t.T >= buyTs);
    if (startIdx === -1) startIdx = trades.length - 1;
  } else if (typeof buyPrice === 'number') {
    // Nếu chỉ có giá, mặc định bắt đầu từ vị trí đầu tiên >= buyPrice (hoặc từ 0)
    startIdx = 0;
  }

  // Tính giá bắt đầu
  let startPrice: number;
  if (typeof buyPrice === 'number') {
    startPrice = buyPrice;
  } else {
    startPrice = parseFloat(trades[startIdx].p);
  }
  if (!isFinite(startPrice) || startPrice <= 0) throw new Error('invalid start price');

  // Tính thời điểm kết thúc cửa sổ (dựa trên thời gian của startIdx)
  const startTs = trades[startIdx].T;
  const endTs = startTs + windowMs;

  // Tìm giá thấp nhất trong cửa sổ và (tùy chọn) tổng khối lượng ở mức giá thấp
  let minPrice = startPrice;
  let minTrade: AggTrade | null = null;
  let lowPriceVolume = 0;
  let totalVolume = 0;

  for (let i = startIdx; i < trades.length; i++) {
    const t = trades[i];
    if (t.T > endTs) break;
    const price = parseFloat(t.p);
    const vol = parseFloat(t.q) || 0;
    totalVolume += vol;

    if (price < minPrice) {
      minPrice = price;
      minTrade = t;
    }
    // Ghi lại khối lượng thấp hơn ngưỡng (ví dụ thấp hơn startPrice * (1 - thresholdPct/100))
    const thresholdPrice = startPrice * (1 - thresholdPct / 100);
    if (price <= thresholdPrice) {
      lowPriceVolume += vol;
    }
  }

  const worstDropPct = ((startPrice - minPrice) / startPrice) * 100; // Phần trăm
  const hasRisk = worstDropPct > thresholdPct;

  const res = {
    hasRisk,
    worstDropPct, // Phần trăm, ví dụ 0.056 => 0.056%
    buyPrice: startPrice,
    minPrice,
    minTrade,
    checkedStartTs: startTs,
    checkedEndTs: endTs,
    thresholdPct,
    lowPriceVolume,
    totalVolume,
    lowPriceVolumeRatio: 0,
  };

  if (volumeWeighted) {
    res.lowPriceVolume = lowPriceVolume;
    res.totalVolume = totalVolume;
    res.lowPriceVolumeRatio = totalVolume > 0 ? lowPriceVolume / totalVolume : 0;
  }

  return res;
};

// Lấy số dư
export const getBalance = async (tab: chrome.tabs.Tab) => {
  await jumpToBuy(tab);
  return await callChromeJs(tab, [], async () => {
    try {
      const UsdtEle = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] .t-caption1 div[class~="text-PrimaryText"]',
      ) as HTMLSpanElement;
      if (!UsdtEle) throw new Error('Không lấy được số dư, hãy kiểm tra trang có chính xác không');
      // Trả về số dư (chuỗi)
      return { error: '', val: UsdtEle.textContent.replace(' USDT', '') };
    } catch (error: any) {
      return { error: error.message, val: '' };
    }
  });
};

export const checkUnknownModal = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], () => {
    try {
      const modal = document.querySelector(`div[role='dialog'][class='bn-modal-wrap data-size-small']`);
      if (modal) throw new Error('Phát hiện hộp thoại lạ, hãy làm mới trang và kiểm tra trang có chính xác không');
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

export const cancelOrder = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], async () => {
    // Kiểm tra xem có đơn đặt lệnh hay không
    const cancelAll = document.querySelector(
      '#bn-tab-pane-orderOrder th[aria-colindex="9"] div[class="text-TextLink cursor-pointer"]',
    ) as HTMLButtonElement;
    // Nếu không có nghĩa là chưa có lệnh
    if (cancelAll) {
      cancelAll.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      // Hộp thoại xác nhận
      const btn = document.querySelector(
        '.bn-modal-confirm .bn-modal-confirm-actions .bn-button__primary',
      ) as HTMLButtonElement;
      if (btn) btn.click();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const orderList = Array.from(
      document.querySelectorAll('#bn-tab-pane-orderOrder td div[style="color: var(--color-Buy);'),
    );
    if (orderList.length) {
      // Nếu tồn tại, quá thời gian thì hủy và trả về trạng thái quá hạn (đơn vị timeout là giây)
      orderList.forEach(order => {
        const evt = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
        });
        order.querySelector('td[aria-colindex="9"] svg')?.dispatchEvent(evt);
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return { error: '', val: true };
  });

export const closeReverseOrder = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], () => {
    try {
      // Kiểm tra lệnh đảo chiều
      const btn = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] .bn-checkbox',
      ) as HTMLButtonElement;
      if (btn) {
        const isChecked = btn.getAttribute('aria-checked') === 'true';
        // Nhấn nút đảo chiều
        if (isChecked) btn.click();
      }
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

export const openReverseOrder = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], () => {
    try {
      // Kiểm tra lệnh đảo chiều
      const btn = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] .bn-checkbox',
      ) as HTMLButtonElement;
      if (btn) {
        const isChecked = btn.getAttribute('aria-checked') === 'true';
        // Nhấn nút đảo chiều
        if (!isChecked) btn.click();
      }
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });
export const setReversePrice = async (tab: chrome.tabs.Tab, price: string) => {
  await injectDependencies(tab);
  return await callChromeJs(tab, [price], async price => {
    try {
      const limitTotals = document.querySelectorAll('input#limitTotal');
      if (!limitTotals.length || limitTotals.length < 2) throw new Error('Không tìm thấy phần tử giá đảo chiều, hãy kiểm tra trang có chính xác không');
      const limitTotal = limitTotals[1] as any;
      const setValue = (selector: string | HTMLInputElement, value: string) => {
        const input = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!input) throw new Error('Phần tử input không tồn tại');
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      // Giá
      setValue(limitTotal, price);
      await new Promise(resolve => setTimeout(resolve, 16));
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });
};

export const waitBuyOrder = async (tab: chrome.tabs.Tab, timeout: number = 3) =>
  await callChromeJs(tab, [timeout], async timeout => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const start = Date.now();
      while (true) {
        // Lấy danh sách lệnh
        const orderList = Array.from(
          document.querySelectorAll('#bn-tab-pane-orderOrder td div[style="color: var(--color-Buy);'),
        );
        if (orderList.length === 0) break;
        // Nếu tồn tại, quá thời gian thì hủy và trả về trạng thái quá hạn (đơn vị timeout là giây)
        if (Date.now() - start > timeout * 1000) {
          orderList.forEach(order => {
            const evt = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
            });
            order.parentNode?.parentNode?.querySelector('svg')?.dispatchEvent(evt);
          });
          console.log('Chờ lệnh quá thời gian, chờ và thử lại');
          await new Promise(resolve => setTimeout(resolve, 500));
          return { error: 'Chờ lệnh quá thời gian, chờ và thử lại', val: true };
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

export let loop = false;

export const stopLoopAuth = async () => {
  loop = false;
};

export const startLoopAuth = async (tab: chrome.tabs.Tab, secret: string, callback: (stop: boolean) => void) => {
  loop = true;
  console.log('startLoopAuth');
  while (loop) {
    console.log('Đang kiểm tra mã xác thực lần hai...');
    await new Promise(resolve => setTimeout(resolve, 300));
    await checkAuthModal(tab, secret).catch((err: { message: string }) => {
      console.error('startLoopAuth', err.message);
      if (err.message.includes('\u505c\u6b62') || err.message.includes('dừng')) {
        callback(true);
      }
    });
  }
};

export const getCode = (secret: string) => (window as any).otplib.authenticator.generate(secret);

// Kiểm tra có xuất hiện hộp thoại xác thực hay không
export const checkAuthModal = async (tab: chrome.tabs.Tab, secret: string) => {
  const isModal = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: () => {
      const dialog = document.querySelector('#mfa-shadow-host');
      if (dialog) {
        return true;
      }
      return false;
    },
  });
  const [{ result }] = isModal;
  if (result) {
    if (!secret) throw new Error('Phát hiện mã xác thực nhưng chưa cấu hình, tự động dừng');
    const code = getCode(secret);
    if (!code) throw new Error('Phát hiện mã xác thực nhưng lấy mã thất bại, tự động dừng');
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      args: [code],
      func: async (code: string) => {
        try {
          const dialog = document.querySelector('#mfa-shadow-host');
          if (dialog) {
            const root = dialog.shadowRoot;
            if (!root) throw new Error('Xác minh thất bại, tự động dừng');
            const textContent = root.querySelector('.mfa-security-page-title')?.textContent;
            // Kiểm tra có phải xác thực sinh trắc hay không
            if (textContent === 'Xác minh bằng khóa thông hành' || textContent === 'Verify with passkey') {
              const btn = root.querySelector('.bidscls-btnLink2') as HTMLButtonElement;
              if (btn) {
                // Chuyển sang xác thực lần hai
                btn.click();
              }
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            const steps = root.querySelectorAll('.bn-mfa-overview-step-title');
            const sfzapp = Array.from(steps).find(c => c.innerHTML.includes('xác minh danh tính')) as HTMLButtonElement;
            if (sfzapp) {
              sfzapp.click();
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            // Kiểm tra có phải ứng dụng xác minh danh tính hay không
            const checkText = root.querySelector('.bn-formItem-label')?.textContent?.trim();
            if (checkText === 'Ứng dụng xác minh danh tính' || checkText === 'Verification code') {
              // Tìm input
              const input = root.querySelector('.bn-textField-input') as any;
              const value = code;

              const nativeInputValueSetter = (Object as any).getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
              ).set;

              nativeInputValueSetter.call(input, value);

              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              await new Promise(resolve => setTimeout(resolve, 5000));
              const dialog = document.querySelector('#mfa-shadow-host');
              if (dialog) {
                window.location.reload();
              }
            }
          }
          return { error: '' };
        } catch (error) {
          return { error: String(error) };
        }
      },
    });
    const [{ result: result2 }] = results;
    if (result2?.error) {
      throw new Error(result2?.error);
    }
    return true;
  }
  return false;
};
