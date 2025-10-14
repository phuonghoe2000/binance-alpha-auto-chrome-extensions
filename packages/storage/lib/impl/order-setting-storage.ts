import { createStorage, StorageEnum } from '../base/index.js';
import deepmerge from 'deepmerge';
import type { BaseStorageType } from '../base/index.js';

// eslint-disable-next-line import-x/exports-last
export type OrderSettingState = {
  amount: string;
  timeout: string;
  runNum: string;
  count: string;
  // số lần quá thời gian bán (vượt quá sẽ bán cắt lỗ theo giá tốt nhất)
  timeoutCount: string;
  // chế độ số tiền đặt lệnh: cố định hoặc ngẫu nhiên
  orderAmountMode: 'Fixed' | 'Random';
  // số tiền ngẫu nhiên tối đa
  maxAmount: string;
  // số tiền ngẫu nhiên tối thiểu
  minAmount: string;
};

// eslint-disable-next-line import-x/exports-last
export type OrderSettingType = BaseStorageType<OrderSettingState> & {
  setVal: (val: Partial<OrderSettingState>) => Promise<void>;
};

const storage = createStorage<OrderSettingState>(
  'order-setting-storage-key',
  {
    amount: '',
    timeout: '2',
    runNum: '3',
    count: '1',
    timeoutCount: '1',
    orderAmountMode: 'Fixed',
    maxAmount: '100',
    minAmount: '50',
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const orderSettingStorage: OrderSettingType = {
  ...storage,
  setVal: async (val: Partial<OrderSettingState>) => {
    await storage.set(currentState => deepmerge(currentState, val));
  },
};
