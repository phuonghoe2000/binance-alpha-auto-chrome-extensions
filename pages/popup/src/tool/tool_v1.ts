declare global {
  interface Window {
    setValue: (selector: string, value: string) => void;
    dispatchMouseEvent: (selector: string | Element) => Promise<void>;
    randomClickPoint: (selector: string | Element) => { clientX: number; clientY: number };
    humanType: (input: HTMLInputElement, text: string, minDelay?: number, maxDelay?: number) => Promise<void>;
    startIdle: () => void;
    stopIdle: () => void;
    idleHumanSimulator: any;
  }
}

export const injectDependencies = async (tab: chrome.tabs.Tab) => {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    world: 'MAIN',
    func: () => {
      window.dispatchMouseEvent = async (el: string | Element) => {
        const types = ['mousemove', 'mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'];
        for (const type of types) {
          const event = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            ...window.randomClickPoint(el),
          });
          if (el instanceof Element) {
            el.dispatchEvent(event);
          } else {
            document.querySelector(el)?.dispatchEvent(event);
          }
          await new Promise(r => setTimeout(r, 33));
        }
      };

      window.randomClickPoint = (el: string | Element) => {
        const rect =
          el instanceof Element ? el.getBoundingClientRect() : document.querySelector(el)!.getBoundingClientRect();
        return {
          clientX: rect.left + rect.width * (0.2 + Math.random() * 0.6), // 避免点击到边缘
          clientY: rect.top + rect.height * (0.2 + Math.random() * 0.6),
        };
      };

      window.humanType = async (input: HTMLInputElement, text: string, minDelay = 3, maxDelay = 8) => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

        input.focus();

        for (const char of text) {
          // keydown
          input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));

          // beforeinput
          input.dispatchEvent(
            new InputEvent('beforeinput', {
              data: char,
              inputType: 'insertText',
              bubbles: true,
            }),
          );

          // 原生 setter 写入字符
          nativeInputValueSetter.call(input, input.value + char);

          // input
          input.dispatchEvent(new Event('input', { bubbles: true }));

          // keyup
          input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

          // 随机停顿（拟人化）
          await new Promise(r => setTimeout(r, minDelay + Math.random() * (maxDelay - minDelay)));
        }
      };

      if (!window.idleHumanSimulator) {
        window.idleHumanSimulator = {
          mouseTimer: null as number | null,
          scrollTimer: null as number | null,
          active: false,

          start() {
            if (this.active) return;
            this.active = true;
            this.simulateMouseMovement();
            this.simulateScroll();
          },

          stop() {
            this.active = false;
            if (this.mouseTimer) {
              clearTimeout(this.mouseTimer);
              this.mouseTimer = null;
            }
            if (this.scrollTimer) {
              clearTimeout(this.scrollTimer);
              this.scrollTimer = null;
            }
          },

          simulateMouseMovement() {
            if (!this.active) return;

            const w = window.innerWidth;
            const h = window.innerHeight;

            const x = Math.random() * w;
            const y = Math.random() * h;

            const evt = new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true });
            document.documentElement.dispatchEvent(evt);

            const nextMove = 300 + Math.random() * 1700;
            this.mouseTimer = window.setTimeout(() => this.simulateMouseMovement(), nextMove);
          },

          simulateScroll() {
            if (!this.active) return;

            const direction = Math.random() > 0.5 ? 1 : -1;
            const distance = 50 + Math.random() * 200;

            window.scrollBy({ top: direction * distance, behavior: 'smooth' });

            const nextScroll = 2000 + Math.random() * 8000;
            this.scrollTimer = window.setTimeout(() => this.simulateScroll(), nextScroll);
          },
        };
      }

      // 启动模拟
      window.startIdle = () => window.idleHumanSimulator.start();

      // 随时停止
      window.stopIdle = () => window.idleHumanSimulator.stop();

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
    world: 'MAIN',
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
  const request = await fetch(
    `${api}/bapi/defi/v1/public/alpha-trade/agg-trades?symbol=${symbol}&limit=1&endTime=${Date.now()}000`,
  );
  const json = (await request.json()) as { data: Trade[] };
  const cur = json.data[json.data.length - 1];
  return cur.p;
};

export const getPriceList = async (symbol: string, api: string) => {
  api = api.lastIndexOf('/') === api.length - 1 ? api.slice(0, -1) : api;
  const request = await fetch(
    `${api}/bapi/defi/v1/public/alpha-trade/agg-trades?symbol=${symbol}&limit=15&endTime=${Date.now()}000`,
  );
  const json = (await request.json()) as { data: AggTrade[] };
  return json.data;
};

export const jumpToSell = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], async () => {
    try {
      const sellPanel = document.querySelector('.bn-tab__buySell[aria-controls="bn-tab-pane-1"]') as HTMLButtonElement;
      if (!sellPanel) throw new Error('卖出面板元素不存在, 请确认页面是否正确');

      await window.dispatchMouseEvent(sellPanel);

      await new Promise(resolve => setTimeout(resolve, 300));

      await window.dispatchMouseEvent(sellPanel);

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
      if (!buyPanel) throw new Error('买入面板元素不存在, 请确认页面是否正确');

      await window.dispatchMouseEvent(buyPanel);

      await new Promise(resolve => setTimeout(resolve, 300));
      await window.dispatchMouseEvent(buyPanel);

      await new Promise(resolve => setTimeout(resolve, 300));
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

export const setPrice = async (tab: chrome.tabs.Tab, price: string) => {
  await injectDependencies(tab);
  price = price.replace('.', ',');
  return await callChromeJs(tab, [price], async price => {
    try {
      const setValue = async (selector: string | HTMLInputElement, value: string) => {
        const input = (typeof selector === 'string' ? document.querySelector(selector) : selector) as HTMLInputElement;
        if (!input) throw new Error('input元素不存在');
        await window.dispatchMouseEvent(input);
        await window.humanType(input, value);
      };
      // 卖出价格
      await setValue('input#limitPrice', price);
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
      const setValue = async (selector: string | HTMLInputElement, value: string) => {
        const input = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!input) throw new Error('input元素不存在');
        await window.humanType(input as HTMLInputElement, value);
      };
      // 设置卖出数量
      await setValue('.flexlayout__tab[data-layout-path="/r1/ts0/t0"] input[type="range"]', value);
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
      const setValue = async (selector: string | HTMLInputElement, value: string) => {
        const input = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!input) throw new Error('input元素不存在');
        await window.humanType(input as HTMLInputElement, value);
      };
      // 设置卖出数量
      await setValue('.flexlayout__tab[data-layout-path="/r1/ts0/t0"] #limitTotal', value);
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
      if (!submitBtn) throw new Error('提交按钮不存在, 请确认页面是否正确');
      await window.dispatchMouseEvent(submitBtn);

      let click = false;
      // Đóng hộp thoại
      let count = 0;
      // 1000 / 30 每秒30fps 最多等待1秒
      while (count < 10) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const btn = document
          .querySelector(`div[role='dialog'][class='bn-modal-wrap data-size-small']`)
          ?.querySelector('.bn-button__primary') as HTMLButtonElement;

        // 等到第二次完整校验。避免多个风险弹窗
        if (click && !btn) {
          await new Promise(resolve => setTimeout(resolve, 500));
          return { error: '', val: false };
        }

        if (btn) {
          await window.dispatchMouseEvent(btn);
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
      await window.dispatchMouseEvent(btn);
      // 关闭弹窗
      let count = 0;
      // 1000 / 30: 30fps mỗi giây, tối đa chờ 1 giây
      while (count < 32) {
        await new Promise(resolve => setTimeout(resolve, 1000 / 30));
        const btn = document
          .querySelector(`div[role='dialog'][class='bn-modal-wrap data-size-small']`)
          ?.querySelector('.bn-button__primary') as HTMLButtonElement;
        if (btn) {
          await window.dispatchMouseEvent(btn);

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
          orderList.forEach(async order => {
            const el = order.querySelector('td[aria-colindex="10"] svg')!;
            await window.dispatchMouseEvent(el);
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

// 检测是否有卖单
export const getIsSell = async (tab: chrome.tabs.Tab, checkPrice: string) => {
  await injectDependencies(tab);
  return await callChromeJs(tab, [checkPrice], async (checkPrice: string) => {
    try {
      const sellPanel = document.querySelector('.bn-tab__buySell[aria-controls="bn-tab-pane-1"]') as HTMLButtonElement;
      if (!sellPanel) {
        throw new Error('Không tìm thấy phần tử bảng bán, hãy làm mới trang và kiểm tra trang có chính xác không');
      }
      await window.dispatchMouseEvent(sellPanel);

      await new Promise(resolve => setTimeout(resolve, 300));
      await window.dispatchMouseEvent(sellPanel);

      await new Promise(resolve => setTimeout(resolve, 300));

      // const priceEl = document.querySelector(
      //   `.ReactVirtualized__Grid__innerScrollContainer div.cursor-pointer`,
      // ) as HTMLSpanElement;
      // if (!priceEl) throw new Error('价格元素不存在, 刷新页面, 请确认页面是否正确');
      // const sellPrice = priceEl.textContent.trim();
      const setValue = async (selector: string | HTMLInputElement, value: string) => {
        const input = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!input) throw new Error('Phần tử input không tồn tại');
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setValue('input#limitPrice', checkPrice.replace('.', ','));
      await new Promise(resolve => setTimeout(resolve, 16));
      await setValue('.flexlayout__tab[data-layout-path="/r1/ts0/t0"] input[type="range"]', '100');
      await new Promise(resolve => setTimeout(resolve, 16));
      const input = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] #limitTotal',
      ) as HTMLInputElement;
      if (!input)
        throw new Error('Không tìm thấy ô nhập số lượng, hãy làm mới trang và kiểm tra trang có chính xác không');

      const parseLocaleNumber = (s: string) => {
        if (s == null) return NaN;
        let v = String(s).trim();
        // If both dot and comma present, assume dot is thousand separator and comma is decimal
        if (v.indexOf('.') !== -1 && v.indexOf(',') !== -1) {
          v = v.replace(/\./g, '').replace(',', '.');
        } else if (v.indexOf(',') !== -1) {
          // Only comma present -> treat comma as decimal separator
          v = v.replace(',', '.');
        }
        // Remove any non numeric characters except decimal point, sign and exponent
        v = v.replace(/[^0-9.\-+eE]/g, '');
        const n = Number(v);
        return isFinite(n) ? n : NaN;
      };

      const numeric = parseLocaleNumber(input.value);
      if (!isFinite(numeric)) return { error: '', val: false };
      if (numeric >= 1) return { error: '', val: true };
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
  safe: boolean = false,
) => {
  while (true) {
    try {
      const checkPrice = await getPrice(symbol, api); // 获取价格
      const isSell = await getIsSell(tab, checkPrice);
      if (!isSell && safe) {
        appendLog('没有发现卖单数据，强制刷新', 'error');
        await closeReverseOrder(tab); // Đóng lệnh đảo chiều
        await new Promise(resolve => setTimeout(resolve, 3000));
        await chrome.tabs.reload(tab.id!);
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Inject lại dependencies sau khi reload
        await injectDependencies(tab);
        // Hủy tất cả order còn lại
        await cancelOrder(tab);
        safe = false;
        continue;
      }
      if (!isSell) return;
      // await jumpToSell(tab); // Chuyển sang tab bán
      const price = await getPrice(symbol, api); // Lấy giá
      if (!price) throw new Error('Không thể lấy giá');
      // const sellPrice = (Number(price) - Number(price) * 0.0001).toString();
      const sellPrice = (Number(price) - Number(price) * 0.00006).toString();
      console.log('Đóng lệnh đảo chiều');
      await closeReverseOrder(tab); // Đóng lệnh đảo chiều
      // Thiết lập giá bán
      console.log('Thiết lập giá bán');
      await setPrice(tab, sellPrice);
      // Thiết lập số lượng bán
      console.log('Thiết lập số lượng bán');
      await setRangeValue(tab, '100');
      // Thực hiện bán
      await callSubmit(tab);
      // Kiểm tra có xuất hiện mã xác thực hay không
      const isAuth = await isAuthModal(tab);
      // Nếu có hộp thoại xác thực thì chờ
      if (isAuth) await new Promise(resolve => setTimeout(resolve, 30000));
      // Chờ lệnh hoàn tất
      await waitOrder(tab, timeout);
      safe = false;
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
      // Tìm element chứa số dư USDT bằng cách tìm text content
      const allElements = document.querySelectorAll('#__APP div');
      let UsdtEle: HTMLElement | null = null;

      for (const el of allElements) {
        const text = el.textContent || '';
        // Tìm element có text match pattern số + USDT và là leaf node (không có child element chứa USDT)
        if (/^\d+(\.\d+)?\s*USDT$/.test(text.trim())) {
          UsdtEle = el as HTMLElement;
          break;
        }
      }

      if (!UsdtEle) throw new Error('Không lấy được số dư, hãy kiểm tra trang có chính xác không');
      // Trả về số dư (chuỗi)
      return { error: '', val: UsdtEle.textContent!.replace(/\s*USDT\s*/, '').trim() };
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

export const cancelOrder = async (tab: chrome.tabs.Tab, maxRetries = 3) => {
  for (let retry = 0; retry < maxRetries; retry++) {
    const result = await callChromeJs(tab, [], async () => {
      try {
        // Kiểm tra xem có đơn đặt lệnh hay không - thử nhiều selector
        const cancelAllSelectors = [
          '#bn-tab-pane-orderOrder th[aria-colindex="10"] div[class="text-TextLink cursor-pointer"]',
          '#bn-tab-pane-orderOrder th div[class*="text-TextLink"][class*="cursor-pointer"]',
          '#bn-tab-pane-orderOrder .text-TextLink.cursor-pointer',
        ];

        let cancelAll: HTMLElement | null = null;
        for (const selector of cancelAllSelectors) {
          cancelAll = document.querySelector(selector) as HTMLElement;
          if (cancelAll) break;
        }

        // Nếu không có nghĩa là chưa có lệnh
        if (cancelAll) {
          await window.dispatchMouseEvent(cancelAll);
          await new Promise(resolve => setTimeout(resolve, 500));

          // Hộp thoại xác nhận - thử nhiều selector
          const confirmSelectors = [
            '.bn-modal-confirm .bn-modal-confirm-actions .bn-button__primary',
            '.bn-modal-confirm button[class*="primary"]',
            'div[role="dialog"] button[class*="primary"]',
          ];

          for (const selector of confirmSelectors) {
            const btn = document.querySelector(selector) as HTMLButtonElement;
            if (btn) {
              await window.dispatchMouseEvent(btn);
              break;
            }
          }
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

        // Kiểm tra từng order riêng lẻ - sửa selector bị thiếu dấu "
        const orderSelectors = [
          '#bn-tab-pane-orderOrder td div[style*="color: var(--color-Buy)"]',
          '#bn-tab-pane-orderOrder tr[data-row-key] td:last-child svg',
          '#bn-tab-pane-orderOrder td[aria-colindex="10"] svg',
        ];

        for (const selector of orderSelectors) {
          const orderList = Array.from(document.querySelectorAll(selector));
          if (orderList.length) {
            // Dùng for...of thay vì forEach để đợi async
            for (const order of orderList) {
              await window.dispatchMouseEvent(order);
              await new Promise(resolve => setTimeout(resolve, 300));

              // Click confirm nếu có
              for (const confirmSelector of [
                '.bn-modal-confirm .bn-modal-confirm-actions .bn-button__primary',
                'div[role="dialog"] button[class*="primary"]',
              ]) {
                const confirmBtn = document.querySelector(confirmSelector) as HTMLButtonElement;
                if (confirmBtn) {
                  await window.dispatchMouseEvent(confirmBtn);
                  await new Promise(resolve => setTimeout(resolve, 500));
                  break;
                }
              }
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        // Kiểm tra còn order không
        await new Promise(resolve => setTimeout(resolve, 500));
        const remainingOrders = document.querySelectorAll('#bn-tab-pane-orderOrder tr[data-row-key]');
        const hasOrders = remainingOrders.length > 0;

        return { error: '', val: true, hasOrders };
      } catch (error: any) {
        return { error: error.message, val: false, hasOrders: true };
      }
    });

    // Nếu không còn order hoặc không có lỗi thì return
    if (result && !result.hasOrders) {
      return result;
    }

    // Nếu còn order, đợi và thử lại
    if (retry < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return { error: '', val: true };
};

export const closeReverseOrder = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], async () => {
    try {
      // Kiểm tra lệnh đảo chiều
      const btn = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] .bn-checkbox',
      ) as HTMLButtonElement;
      if (btn) {
        const isChecked = btn.getAttribute('aria-checked') === 'true';
        // 点击反向按钮
        if (isChecked) {
          await window.dispatchMouseEvent(btn);
        }
      }
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

export const openReverseOrder = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], async () => {
    try {
      // Kiểm tra lệnh đảo chiều
      const btn = document.querySelector(
        '.flexlayout__tab[data-layout-path="/r1/ts0/t0"] .bn-checkbox',
      ) as HTMLButtonElement;
      if (btn) {
        const isChecked = btn.getAttribute('aria-checked') === 'true';
        // 点击反向按钮
        if (!isChecked) {
          await window.dispatchMouseEvent(btn);
        }
      }
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });
export const setReversePrice = async (tab: chrome.tabs.Tab, price: string) => {
  await injectDependencies(tab);
  price = price.replace('.', ',');

  const trySetPrice = async () =>
    await callChromeJs(tab, [price], async price => {
      try {
        const limitTotals = document.querySelectorAll('input#limitTotal');
        if (!limitTotals.length || limitTotals.length < 2) {
          console.log('[setReversePrice] missing-limit-total, cần refresh trang');
          return { error: '', val: false }; // Return false để trigger reload
        }

        const limitTotal = limitTotals[1] as any;
        const setValue = async (selector: string | HTMLInputElement, value: string) => {
          const input = typeof selector === 'string' ? document.querySelector(selector) : selector;
          if (!input) throw new Error('input元素不存在');
          await window.humanType(input as HTMLInputElement, value);
        };
        await setValue(limitTotal, price);
        await new Promise(resolve => setTimeout(resolve, 16));
        return { error: '', val: true };
      } catch (error: any) {
        return { error: error.message, val: false };
      }
    });

  // Thử lần đầu
  if (await trySetPrice()) return true;

  // Không tìm thấy -> refresh trang và thử lại 1 lần
  console.log('[setReversePrice] Không tìm thấy phần tử, đang refresh trang...');
  await chrome.tabs.reload(tab.id!);
  await new Promise(resolve => setTimeout(resolve, 5000));
  await injectDependencies(tab);

  if (await trySetPrice()) return true;

  throw new Error('Không tìm thấy phần tử giá đảo chiều sau khi thử làm mới trang');
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
          orderList.forEach(async order => {
            const btn = order.parentNode!.parentNode!.querySelector('svg')!;
            await window.dispatchMouseEvent(btn);
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

export const waitSellOrder = async (tab: chrome.tabs.Tab, timeout: number = 3) =>
  await callChromeJs(tab, [timeout], async timeout => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const start = Date.now();
      while (true) {
        // 获取订单
        const orderList = Array.from(
          document.querySelectorAll('#bn-tab-pane-orderOrder td div[style="color: var(--color-Sell);'),
        );
        if (orderList.length === 0) break;
        // 如果存在 且超时操作取消 并且返回超时 timeout 单位（s）
        if (Date.now() - start > timeout * 1000) {
          orderList.forEach(async order => {
            const btn = order.parentNode!.parentNode!.querySelector('svg')!;
            await window.dispatchMouseEvent(btn);
          });
          console.log('等待订单超时，等待重试');
          await closeReverseOrder(tab); // Đóng lệnh đảo chiều
          await new Promise(resolve => setTimeout(resolve, 500));
          return { error: '等待订单超时，等待重试', val: true };
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
    world: 'MAIN',
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
    if (!secret) throw new Error('出现验证码，但是未设置，自动停止');
    await new Promise(resolve => setTimeout(resolve, 3000));
    const code = getCode(secret);
    if (!code) throw new Error('Phát hiện mã xác thực nhưng lấy mã thất bại, tự động dừng');
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      args: [code],
      world: 'MAIN',
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
                // 跳转二次验证
                await window.dispatchMouseEvent(btn);
              }
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            const steps = root.querySelectorAll('.bn-mfa-overview-step-title');
            const sfzapp = Array.from(steps).find(c => c.innerHTML.includes('xác minh danh tính')) as HTMLButtonElement;
            if (sfzapp) {
              await window.dispatchMouseEvent(sfzapp);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            // Kiểm tra có phải ứng dụng xác minh danh tính hay không
            const checkText = root.querySelector('.bn-formItem-label')?.textContent?.trim();
            if (checkText === 'Ứng dụng xác minh danh tính' || checkText === 'Verification code') {
              // Tìm input
              const input = root.querySelector('.bn-textField-input') as any;
              const value = code;

              await window.humanType(input, value);

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

// 启动随机模拟
export const startRandom = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], async () => {
    try {
      window.startIdle();
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });

// 停止随机模拟
export const stopRandom = async (tab: chrome.tabs.Tab) =>
  await callChromeJs(tab, [], async () => {
    try {
      window.stopIdle();
      return { error: '', val: true };
    } catch (error: any) {
      return { error: error.message, val: false };
    }
  });
