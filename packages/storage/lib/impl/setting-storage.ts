import { createStorage, StorageEnum } from '../base/index.js';
import deepmerge from 'deepmerge';
import type { BaseStorageType } from '../base/index.js';

// eslint-disable-next-line import-x/exports-last
export type SettingState = {
  amount: string;
  timeout: string;
  // cách đặt giới hạn
  runType: 'sum' | 'price';
  runNum: string;
  runPrice: string;
  count: string;
  dot: string;
  type: 'Buy' | 'Sell';
  mode: 'Reverse' | 'Order';
  // số lần quá thời gian bán (vượt quá sẽ bán cắt lỗ theo giá tốt nhất)
  timeoutCount: string;
  // chế độ số tiền đặt lệnh: cố định hoặc ngẫu nhiên
  orderAmountMode: 'Fixed' | 'Random';
  // số tiền ngẫu nhiên tối đa
  maxAmount: string;
  // số tiền ngẫu nhiên tối thiểu
  minAmount: string;
  // xác minh lần hai (secret)
  secret: string;
  // địa chỉ API
  api: string;
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
