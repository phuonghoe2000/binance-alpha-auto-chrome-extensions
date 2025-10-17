// =====================
// Kiểu phản hồi K-line của Binance

import type { StategySettingStateType } from '@extension/storage';

// =====================
export interface AlphaKlineResponse {
  code: string;
  message: string | null;
  messageDetail: string | null;
  success: boolean;
  data: string[][];
}

// =====================
// Kiểu kết quả ổn định thị trường
// =====================
export interface MarketStabilityResult {
  symbol: string;
  stable: boolean; // Có thể cày điểm hay không
  trend: 'Xu hướng tăng' | 'Xu hướng giảm' | 'Đi ngang';
  message: string; // Thông báo dễ đọc
}

// Lấy giá đóng cửa
export const extractClosePrices = (klines: string[][]) => klines.map(k => parseFloat(k[4]));

/**
 * Thuật toán 1: Kiểm tra độ dốc xu hướng tuyến tính (phiên bản đơn giản của hồi quy tuyến tính)
 * Độ dốc của 20 giá đóng cửa gần nhất > 0 thì coi là xu hướng tăng rõ rệt
 */
export const algo1_TrendSlope = (klines: string[][], toSlope = 0.000003): boolean => {
  const data = extractClosePrices(klines);
  if (data.length < 5) return false;
  const n = data.length;
  const avgX = (n - 1) / 2;
  const avgY = data.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - avgX) * (data[i] - avgY);
    den += Math.pow(i - avgX, 2);
  }
  const slope = num / den;
  console.log(slope);
  return slope > toSlope; // Độ dốc dương đại diện cho xu hướng tăng
};

/**
 * Thuật toán 2: Kiểm tra đà tăng liên tục
 * Nhiều nến có giá đóng cửa cao hơn nến trước đó → đà tăng
 */
export const algo2_Momentum = (klines: string[][], confirm = 3): boolean => {
  const data = extractClosePrices(klines);
  if (data.length < confirm + 1) return false;
  let count = 0;
  for (let i = data.length - confirm; i < data.length; i++) {
    if (data[i] > data[i - 1]) count++;
  }
  return count >= confirm; // Tăng liên tiếp confirm cây nến
};

/**
 * Thuật toán 3: So sánh hướng đường trung bình ngắn hạn và dài hạn
 * Chênh lệch hướng > ngưỡng thể hiện xu hướng tăng tốc
 */
export const algo3_ShortVsLong = (klines: string[][], short = 5, long = 20) => {
  const data = extractClosePrices(klines);
  if (data.length < long) return false;
  const ma = (arr: number[], n: number) => arr.slice(-n).reduce((a, b) => a + b, 0) / n;
  const shortNow = ma(data, short);
  const longNow = ma(data, long);
  const prevShort = ma(data.slice(0, -1), short);
  const prevLong = ma(data.slice(0, -1), long);
  const shortSlope = shortNow - prevShort;
  const longSlope = longNow - prevLong;
  return shortSlope > longSlope && shortSlope > 0;
};

/**
 * Thuật toán 4: Biến động hội tụ rồi bứt phá (sau giai đoạn biến động thấp)
 * Nếu biến động gần đây giảm và giá mới nhất vượt biên trên → tín hiệu mua
 */
export const algo4_VolatilityBreak = (klines: string[][], lookback = 20) => {
  const data = extractClosePrices(klines);
  if (data.length < lookback) return false;
  const recent = data.slice(-lookback);
  const avg = recent.reduce((a, b) => a + b, 0) / lookback;
  const vol = Math.sqrt(recent.map(p => (p - avg) ** 2).reduce((a, b) => a + b, 0) / lookback);
  const upper = avg + vol * 1.2;
  const curr = recent[recent.length - 1];
  return curr > upper;
};

/**
 * Thuật toán 5: Kiểm tra gia tốc tức thời
 * Tăng liên tục và biên độ tăng lớn dần → gia tốc đi lên
 */
export const algo5_Acceleration = (klines: string[][]) => {
  const data = extractClosePrices(klines);
  if (data.length < 4) return false;
  const a1 = data[data.length - 1] - data[data.length - 2];
  const a2 = data[data.length - 2] - data[data.length - 3];
  const a3 = data[data.length - 3] - data[data.length - 4];
  return a1 > a2 && a2 > a3 && a1 > 0;
};

/**
 * Trả về kết quả phân tích hợp nhất
 */
export const analyzeFast = (
  klines: string[][],
  toSlope = 0.000003,
  confirm = 3,
  short = 5,
  long = 20,
  lookback = 20,
) => ({
  TrendSlope: algo1_TrendSlope(klines, toSlope),
  Momentum: algo2_Momentum(klines, confirm),
  ShortVsLong: algo3_ShortVsLong(klines, short, long),
  VolatilityBreak: algo4_VolatilityBreak(klines, lookback),
  Acceleration: algo5_Acceleration(klines),
});

export const checkMarketStable = async (
  api: string,
  symbol: string, // ALPHA_175USDT
  options: StategySettingStateType,
): Promise<MarketStabilityResult> => {
  const limit = options.limit;
  api = api.lastIndexOf('/') === api.length - 1 ? api.slice(0, -1) : api;
  const url = `${api}/bapi/defi/v1/public/alpha-trade/klines?interval=${'1s'}&limit=${limit}&symbol=${symbol}`;
  const res = await fetch(url);
  const json: AlphaKlineResponse = await res.json();

  if (!json.success || !Array.isArray(json.data)) {
    throw new Error(`Không thể lấy dữ liệu thị trường ${symbol}`);
  }

  const data = json.data;

  const a = analyzeFast(data, options.toSlope, options.confirm, options.short, options.long, options.limit);
  // Đánh giá có thể cày điểm hay không
  const stable = a.TrendSlope || a.Momentum || a.ShortVsLong || a.VolatilityBreak || a.Acceleration;

  // Nếu có từ hai chỉ báo trở lên đúng thì coi là xu hướng tăng
  const trueCount = [a.TrendSlope, a.Momentum, a.ShortVsLong, a.VolatilityBreak, a.Acceleration].filter(
    (v: boolean) => v,
  ).length;

  const trend = trueCount >= options.upThreshold ? 'Xu hướng tăng' : 'Xu hướng giảm';

  const message = stable
    ? `✅ Có thể giao dịch (Kiểm tra độ dốc xu hướng tuyến tính: ${a.TrendSlope}; Kiểm tra đà tăng liên tục: ${a.Momentum}; Chênh lệch hướng MA ngắn hạn và dài hạn: ${a.ShortVsLong}; Đột phá sau hội tụ biến động: ${a.VolatilityBreak}; Kiểm tra gia tốc tức thời: ${a.Acceleration})`
    : `❌ Không thể giao dịch (Kiểm tra độ dốc xu hướng tuyến tính: ${a.TrendSlope}; Kiểm tra đà tăng liên tục: ${a.Momentum}; Chênh lệch hướng MA ngắn hạn và dài hạn: ${a.ShortVsLong}; Đột phá sau hội tụ biến động: ${a.VolatilityBreak}; Kiểm tra gia tốc tức thời: ${a.Acceleration})`;

  return {
    symbol,
    stable,
    trend,
    message,
  };
};
