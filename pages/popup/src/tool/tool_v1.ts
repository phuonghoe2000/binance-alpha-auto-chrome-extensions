declare global {
  interface Window {
    setInputValue: (selector: string, value: string) => void;
  }
}

export const injectDependencies = async (tab: chrome.tabs.Tab) => {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    world: 'MAIN',
    func: () => {
      window.setInputValue = (selector, value) => {
        const input = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!input) throw new Error('Không tìm thấy phần tử input');
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };

      Object.defineProperty(navigator, 'credentials', {
        value: {
          get: async () => {
            console.warn('[CEB] WebAuthn get disabled by extension');
            throw new DOMException('WebAuthn disabled by extension', 'NotAllowedError');
          },
          create: async () => {
            console.warn('[CEB] WebAuthn create disabled by extension');
            throw new DOMException('WebAuthn disabled by extension', 'NotAllowedError');
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
    world: 'MAIN',
    args: (args ?? []) as A,
  });

  if (!result?.result) {
    throw new Error('Thực thi script thất bại: không có kết quả trả về');
  }

  const { error, val } = result.result;

  if (error) {
    throw new Error(error);
  }

  return val;
};

// lấy id alpha
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
  T: number; // dấu thời gian
  p: string; // giá
  q: string; // khối lượng
  m: boolean; // bên bán chủ động hay không
}

// lấy giá
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
      if (!sellPanel) throw new Error('Không tìm thấy bảng bán, vui lòng kiểm tra trang có đúng hay không');
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
      if (!buyPanel) throw new Error('Không tìm thấy bảng mua, vui lòng kiểm tra trang có đúng hay không');
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
      // giá bán
      window.setInputValue('input#limitPrice', price);
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
      // đặt số lượng bán
      window.setInputValue('.flexlayout__tab[data-layout-path="/r1/ts0/t0"] input[type="range"]', value);
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
      // đặt số lượng bán
      window.setInputValue('.flexlayout__tab[data-layout-path="/r1/ts0/t0"] #limitTotal', value);
      await new Promise(resolve => setTimeout(resolve, 16));
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });
};

// gửi yêu cầu bán
export const callSubmit = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], async () => {
    try {
      // xác nhận bán
      const submitBtn = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] button.bn-button',
      ) as HTMLButtonElement;
      if (!submitBtn) throw new Error('Không tìm thấy nút xác nhận, vui lòng kiểm tra trang có đúng hay không');
      submitBtn.click();
      // đóng cửa sổ
      let count = 0;
      // 1000 / 30 mỗi giây 30 fps, tối đa đợi 1 giây
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
      return { error: 'Thao tác quá thời gian, hãy làm mới trang và thử lại', val: true };
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
        throw new Error('Không tìm thấy nút mua, hãy làm mới trang và kiểm tra trang có đúng hay không');
      }
      btn.click();
      // đóng cửa sổ
      let count = 0;
      // 1000 / 30 mỗi giây 30 fps, tối đa đợi 1 giây
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
      return { error: 'Thao tác quá thời gian, hãy làm mới trang và thử lại', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

// chờ lệnh hoàn tất
export const waitOrder = async (tab: chrome.tabs.Tab, timeout: number = 3) =>
  await callChromeJs(tab, [timeout], async timeout => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const start = Date.now();
      while (true) {
        // lấy danh sách lệnh
        const orderList = Array.from(document.querySelectorAll('#bn-tab-pane-orderOrder .bn-web-table-row'));
        if (orderList.length === 0) break;
        // nếu tồn tại, khi quá thời gian sẽ hủy và trả về timeout (đơn vị giây)
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
          return { error: 'Chờ lệnh quá thời gian, đợi và thử lại', val: true };
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

// kiểm tra có xuất hiện cửa sổ xác minh hay không
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

// kiểm tra có lệnh bán hay không
export const getIsSell = async (tab: chrome.tabs.Tab) => {
  await injectDependencies(tab);
  return await callChromeJs(tab, [], async () => {
    try {
      const sellPanel = document.querySelector('.bn-tab__buySell[aria-controls="bn-tab-pane-1"]') as HTMLButtonElement;
      if (!sellPanel) {
        throw new Error('Không tìm thấy bảng bán, hãy làm mới trang và kiểm tra trang có đúng hay không');
      }
      sellPanel.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      sellPanel.click();
      await new Promise(resolve => setTimeout(resolve, 300));

      const priceEl = document.querySelector(
        `.ReactVirtualized__List div[class='flex-1 cursor-pointer']`,
      ) as HTMLSpanElement;
      if (!priceEl) throw new Error('Không tìm thấy phần tử giá, hãy làm mới trang và kiểm tra trang có đúng hay không');
      const sellPrice = priceEl.textContent.trim();
      window.setInputValue('input#limitPrice', sellPrice);
      await new Promise(resolve => setTimeout(resolve, 16));
      window.setInputValue('.flexlayout__tab[data-layout-path="/r1/ts0/t0"] input[type="range"]', '100');
      await new Promise(resolve => setTimeout(resolve, 16));
      const error = document.querySelector('div.bn-textField__line.data-error')?.querySelector('#limitTotal');
      if (error) {
        return { error: '', val: true };
      }
      const input = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] #limitTotal',
      ) as HTMLInputElement;
      if (!input) throw new Error('Không tìm thấy ô nhập số lượng, hãy làm mới trang và kiểm tra trang có đúng hay không');
      if (Number(input.value) >= 1) return { error: '', val: true };
      return { error: '', val: false };
    } catch (error: any) {
      return { error: error.message, val: true };
    }
  });
};
// bán phòng thủ
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
      // await jumpToSell(tab); // chuyển sang bán
      const price = await getPrice(symbol, api); // lấy giá
      if (!price) throw new Error('Lấy giá thất bại');
      // const sellPrice = (Number(price) - Number(price) * 0.0001).toString();
      const sellPrice = (Number(price) - Number(price) * 0.00006).toString();
      await closeReverseOrder(tab); // đóng lệnh ngược
      // đặt giá bán
      await setPrice(tab, sellPrice);
      // đặt số lượng bán
      await setRangeValue(tab, '100');
      // thực hiện bán
      await callSubmit(tab);
      // kiểm tra có xuất hiện mã xác minh hay không
      const isAuth = await isAuthModal(tab);
      // nếu xuất hiện cửa sổ xác minh thì chờ
      if (isAuth) await new Promise(resolve => setTimeout(resolve, 3000));
      // chờ lệnh
      await waitOrder(tab, timeout);
      appendLog(`Bán thành công Giá: ${sellPrice}`, 'success');
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
  T: number; // ms timestamp
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

  // tìm chỉ số bắt đầu
  let startIdx = 0;
  if (typeof buyIndex === 'number') {
    startIdx = Math.max(0, Math.min(trades.length - 1, buyIndex));
  } else if (typeof buyTs === 'number') {
    startIdx = trades.findIndex(t => t.T >= buyTs);
    if (startIdx === -1) startIdx = trades.length - 1;
  } else if (typeof buyPrice === 'number') {
    // nếu chỉ cung cấp giá, mặc định bắt đầu từ vị trí đầu tiên >= buyPrice (hoặc từ 0)
    startIdx = 0;
  }

  // tính giá bắt đầu
  let startPrice: number;
  if (typeof buyPrice === 'number') {
    startPrice = buyPrice;
  } else {
    startPrice = parseFloat(trades[startIdx].p);
  }
  if (!isFinite(startPrice) || startPrice <= 0) throw new Error('invalid start price');

  // tính thời điểm kết thúc cửa sổ (dựa trên thời gian của startIdx)
  const startTs = trades[startIdx].T;
  const endTs = startTs + windowMs;

  // tìm giá thấp nhất trong cửa sổ và (tùy chọn) tổng khối lượng tại giá thấp
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
    // ghi lại khối lượng thấp hơn ngưỡng (ví dụ < startPrice * (1 - thresholdPct/100))
    const thresholdPrice = startPrice * (1 - thresholdPct / 100);
    if (price <= thresholdPrice) {
      lowPriceVolume += vol;
    }
  }

  const worstDropPct = ((startPrice - minPrice) / startPrice) * 100; // phần trăm
  const hasRisk = worstDropPct > thresholdPct;

  const res = {
    hasRisk,
    worstDropPct, // phần trăm, ví dụ 0.056 => 0.056%
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

// lấy số dư
export const getBalance = async (tab: chrome.tabs.Tab) => {
  await jumpToBuy(tab);
  return await callChromeJs(tab, [], async () => {
    try {
      const UsdtEle = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] .t-caption1 div[class~="text-PrimaryText"]',
      ) as HTMLSpanElement;
      if (!UsdtEle) throw new Error('Không lấy được số dư, vui lòng kiểm tra trang có đúng hay không');
      // trả về số dư (chuỗi)
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
      if (modal) throw new Error('Phát hiện cửa sổ lạ, hãy làm mới trang và kiểm tra trang có đúng hay không');
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

export const cancelOrder = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], async () => {
    // kiểm tra có đơn hàng hay không
    const cancelAll = document.querySelector(
      '#bn-tab-pane-orderOrder th[aria-colindex="9"] div[class="text-TextLink cursor-pointer"]',
    ) as HTMLButtonElement;
    // nếu không có thì nghĩa là không có đơn hàng
    if (cancelAll) {
      cancelAll.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      // cửa sổ xác nhận
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
      // nếu tồn tại và quá thời gian thì hủy thao tác và trả về timeout (đơn vị giây)
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
      // kiểm tra lệnh ngược
      const btn = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] .bn-checkbox',
      ) as HTMLButtonElement;
      if (btn) {
        const isChecked = btn.getAttribute('aria-checked') === 'true';
        // nhấn nút lệnh ngược
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
      // kiểm tra lệnh ngược
      const btn = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] .bn-checkbox',
      ) as HTMLButtonElement;
      if (btn) {
        const isChecked = btn.getAttribute('aria-checked') === 'true';
        // nhấn nút lệnh ngược
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
      if (!limitTotals.length || limitTotals.length < 2) throw new Error('Không tìm thấy phần tử giá lệnh ngược, vui lòng kiểm tra trang có đúng hay không');
      const limitTotal = limitTotals[1] as any;
      // giá bán
      window.setInputValue(limitTotal, price);
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
        // lấy danh sách lệnh
        const orderList = Array.from(
          document.querySelectorAll('#bn-tab-pane-orderOrder td div[style="color: var(--color-Buy);'),
        );
        if (orderList.length === 0) break;
        // nếu tồn tại và quá thời gian thì hủy thao tác và trả về timeout (đơn vị giây)
        if (Date.now() - start > timeout * 1000) {
          orderList.forEach(order => {
            const evt = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
            });
            order.parentNode?.parentNode?.querySelector('svg')?.dispatchEvent(evt);
          });
          console.log('Chờ lệnh quá thời gian, đợi và thử lại');
          await new Promise(resolve => setTimeout(resolve, 500));
          return { error: 'Chờ lệnh quá thời gian, đợi và thử lại', val: true };
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

// =====================
// Kiểu phản hồi dữ liệu nến Binance
// =====================
export interface AlphaKlineResponse {
  code: string;
  message: string | null;
  messageDetail: string | null;
  success: boolean;
  data: string[][];
}

// =====================
// Kiểu trả về độ ổn định thị trường
// =====================
export interface MarketStabilityResult {
  symbol: string;
  interval: string;
  volatility: string; // độ biến động trung bình
  slope: string; // độ dốc xu hướng
  varVol: string; // hệ số biến động khối lượng
  stable: boolean; // có thể cày điểm hay không
  trend: 'Xu hướng tăng' | 'Xu hướng giảm' | 'Đi ngang';
  message: string; // thông điệp dễ đọc
}

export const checkMarketStable = async (
  api: string,
  symbol: string, // ALPHA_175USDT
  interval = '1s',
  limit = 15,
): Promise<MarketStabilityResult> => {
  api = api.lastIndexOf('/') === api.length - 1 ? api.slice(0, -1) : api;
  const url = `${api}/bapi/defi/v1/public/alpha-trade/klines?interval=${interval}&limit=${limit}&symbol=${symbol}`;
  const res = await fetch(url);
  const json: AlphaKlineResponse = await res.json();

  if (!json.success || !Array.isArray(json.data)) {
    throw new Error(`Lấy dữ liệu thị trường ${symbol} thất bại`);
  }

  const data = json.data;
  const closes = data.map(k => parseFloat(k[4]));
  const highs = data.map(k => parseFloat(k[2]));
  const lows = data.map(k => parseFloat(k[3]));
  const opens = data.map(k => parseFloat(k[1]));
  const volumes = data.map(k => parseFloat(k[5]));

  // độ biến động trung bình
  const volatility = highs.reduce((sum, h, i) => sum + (h - lows[i]) / opens[i], 0) / highs.length;

  // hệ số biến động khối lượng
  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const varVol = Math.sqrt(volumes.map(v => (v - avgVol) ** 2).reduce((a, b) => a + b, 0) / volumes.length) / avgVol;

  // =====================
  // trung bình trượt + trọng số + xác nhận khối lượng
  // =====================
  const half = Math.floor(closes.length / 2);

  // nửa đầu trung bình thông thường
  const avgEarly = closes.slice(0, half).reduce((a, b) => a + b, 0) / half;

  // nửa sau trung bình có trọng số, nến mới nhất có trọng số lớn hơn
  const lateCloses = closes.slice(half);
  const lateWeights = lateCloses.map((_, i) => i + 1);
  const weightedLate =
    lateCloses.reduce((sum, price, i) => sum + price * lateWeights[i], 0) / lateWeights.reduce((a, b) => a + b, 0);

  // độ dốc giá trung bình
  const slope = (weightedLate - avgEarly) / avgEarly;

  // xác nhận khối lượng
  const volEarly = volumes.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const volLate = volumes.slice(half).reduce((a, b) => a + b, 0) / (closes.length - half);
  const volRatio = volLate / volEarly;

  // hướng xu hướng (ngưỡng lên và xuống tách biệt)
  let trend: MarketStabilityResult['trend'] = 'Đi ngang';
  const upThreshold = 0.0000025; // ngưỡng tăng
  const downThreshold = 0.000002; // ngưỡng giảm

  if (slope > upThreshold && volRatio > 0.8) trend = 'Xu hướng tăng';
  else if (slope < -downThreshold && volRatio > 0.8) trend = 'Xu hướng giảm';

  // đánh giá có thể cày điểm hay không
  let stable = false;
  if (trend === 'Xu hướng giảm') {
    stable = volatility <= 0.0001;
  } else {
    stable = true;
  }

  const message = stable
    ? `✅ Có thể cày điểm (${trend} / Biến động:${volatility.toFixed(6)})`
    : `⚠️ Tạm thời không khuyến nghị cày điểm (${trend} / Biến động:${volatility.toFixed(6)})`;

  return {
    symbol,
    interval,
    volatility: volatility.toFixed(5),
    slope: slope.toFixed(7), // giữ nhiều chữ số thập phân hơn
    varVol: varVol.toFixed(3),
    stable,
    trend,
    message,
  };
};

export let loop = false;

export const stopLoopAuth = async () => {
  loop = false;
};

const PASSKEY_TEXTS = ['Xác minh bằng khóa truy cập', 'Verify with passkey', '\u901a\u8fc7\u901a\u884c\u5bc6\u94a5\u9a8c\u8bc1'];
const IDENTITY_TEXTS = ['Xác minh danh tính', '\u8eab\u4efd\u9a8c\u8bc1'];
const AUTH_APP_TEXTS = ['Ứng dụng xác thực', 'Verification code', '\u8eab\u4efd\u9a8c\u8bc1\u5668App'];

export const startLoopAuth = async (tab: chrome.tabs.Tab, secret: string, callback: (stop: boolean) => void) => {
  loop = true;
  console.log('startLoopAuth');
  while (loop) {
    console.log('Đang kiểm tra mã xác minh lần hai...');
    await new Promise(resolve => setTimeout(resolve, 300));
    await checkAuthModal(tab, secret).catch((err: { message: string }) => {
      console.error('startLoopAuth', err.message);
      if (err.message.includes('\u505c\u6b62') || err.message.includes('tự động dừng')) {
        callback(true);
      }
    });
  }
};

export const getCode = (secret: string) => (window as any).otplib.authenticator.generate(secret);

// kiểm tra có xuất hiện cửa sổ xác minh hay không
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
    if (!secret) throw new Error('Xuất hiện mã xác minh nhưng chưa thiết lập, tự động dừng');
    const code = getCode(secret);
    if (!code) throw new Error('Xuất hiện mã xác minh nhưng lấy mã thất bại, tự động dừng');
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
            // xác định có phải xác minh sinh trắc hay không
            if (PASSKEY_TEXTS.includes(textContent || '')) {
              const btn = root.querySelector('.bidscls-btnLink2') as HTMLButtonElement;
              if (btn) {
                // chuyển đến xác minh lần hai
                btn.click();
              }
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            const steps = root.querySelectorAll('.bn-mfa-overview-step-title');
            const sfzapp = Array.from(steps).find(c =>
              IDENTITY_TEXTS.some(text => c.innerHTML.includes(text)),
            ) as HTMLButtonElement;
            if (sfzapp) {
              sfzapp.click();
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            // kiểm tra có phải trình xác thực hay không
            const checkText = root.querySelector('.bn-formItem-label')?.textContent?.trim();
            if (checkText && AUTH_APP_TEXTS.includes(checkText)) {
              // tìm input
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
