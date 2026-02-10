import { createStorage, StorageEnum } from '../base/index.js';
import deepmerge from 'deepmerge';
import type { BaseStorageType } from '../base/index.js';

// eslint-disable-next-line import-x/exports-last
export type BicycleSettingState = {
  amount: string;
  runNum: string;
  count: string;
  // Chế độ số tiền đặt lệnh: cố định hoặc ngẫu nhiên
  orderAmountMode: 'Fixed' | 'Random';
  // Số tiền ngẫu nhiên tối đa
  maxAmount: string;
  // Số tiền ngẫu nhiên tối thiểu
  minAmount: string;
  // Thời gian kiểm tra giá
  checkPriceTime: string;
  // Số lần kiểm tra
  checkPriceCount: string;
};

// eslint-disable-next-line import-x/exports-last
export type BicycleSettingType = BaseStorageType<BicycleSettingState> & {
  setVal: (val: Partial<BicycleSettingState>) => Promise<void>;
};

const storage = createStorage<BicycleSettingState>(
  'bicycle-setting-storage-key',
  {
    amount: '',
    runNum: '3',
    count: '3',
    orderAmountMode: 'Fixed',
    maxAmount: '100',
    minAmount: '50',
    checkPriceTime: '1',
    checkPriceCount: '60',
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const bicycleSettingStorage: BicycleSettingType = {
  ...storage,
  setVal: async (val: Partial<BicycleSettingState>) => {
    await storage.set(currentState => deepmerge(currentState, val));
  },
};
