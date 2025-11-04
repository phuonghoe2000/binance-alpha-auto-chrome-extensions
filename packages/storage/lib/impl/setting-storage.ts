import { createStorage, StorageEnum } from '../base/index.js';
import deepmerge from 'deepmerge';
import type { BaseStorageType } from '../base/index.js';

// eslint-disable-next-line import-x/exports-last
export type SettingState = {
  amount: string;
  timeout: string;
  // Cách đặt giới hạn
  runType: 'sum' | 'price';
  runNum: string;
  runPrice: string;
  count: string;
  dot: string;
  type: 'Buy' | 'Sell';
  mode: 'Reverse' | 'Order';
  // Số lần quá hạn bán ra (vượt quá sẽ bán cắt lỗ ở giá tốt nhất)
  timeoutCount: string;
  // Chế độ số tiền đặt lệnh: cố định hoặc ngẫu nhiên
  orderAmountMode: 'Fixed' | 'Random';
  // Số tiền ngẫu nhiên tối đa
  maxAmount: string;
  // Số tiền ngẫu nhiên tối thiểu
  minAmount: string;
  // Xác thực lần hai (secret)
  secret: string;
  // Địa chỉ API
  api: string;

  // Thời gian trễ tối thiểu
  minSleep: string;
  // Khoảng thời gian tối đa
  maxSleep: string;

  minDiscount: string;
  maxDiscount: string;
};

// eslint-disable-next-line import-x/exports-last
export type SettingType = BaseStorageType<SettingState> & {
  setVal: (val: Partial<SettingState>) => Promise<void>;
};

const storage = createStorage<SettingState>(
  'setting-storage-key',
  {
    amount: '',
    timeout: '2',
    runNum: '3',
    runPrice: '65536',
    count: '1',
    dot: '3',
    type: 'Buy',
    mode: 'Reverse',
    timeoutCount: '3',
    orderAmountMode: 'Fixed',
    maxAmount: '100',
    minAmount: '50',
    secret: '',
    api: 'https://www.binance.com',
    runType: 'sum',
    minSleep: '1',
    maxSleep: '5',

    minDiscount: '0.2',
    maxDiscount: '0.5',
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const settingStorage: SettingType = {
  ...storage,
  setVal: async (val: Partial<SettingState>) => {
    await storage.set(currentState => deepmerge(currentState, val));
  },
};
