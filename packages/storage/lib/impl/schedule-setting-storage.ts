import { createStorage, StorageEnum } from '../base/index.js';
import deepmerge from 'deepmerge';
import type { BaseStorageType } from '../base/index.js';

// eslint-disable-next-line import-x/exports-last
export type ScheduleSettingState = {
  // Bật/tắt schedule
  enabled: boolean;
  // Thời gian bắt đầu (format: "HH:mm", ví dụ: "07:00")
  startTime: string;
  // Thời gian kết thúc (format: "HH:mm" hoặc "" nếu không có)
  endTime: string;
};

// eslint-disable-next-line import-x/exports-last
export type ScheduleSettingType = BaseStorageType<ScheduleSettingState> & {
  setVal: (val: Partial<ScheduleSettingState>) => Promise<void>;
  isWithinSchedule: () => Promise<{ allowed: boolean; message: string }>;
};

const storage = createStorage<ScheduleSettingState>(
  'schedule-setting-storage-key',
  {
    enabled: false,
    startTime: '07:00',
    endTime: '',
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

/**
 * Kiểm tra xem thời gian hiện tại có nằm trong khoảng schedule không
 */
const isWithinSchedule = async (): Promise<{ allowed: boolean; message: string }> => {
  const state = await storage.get();

  // Nếu schedule không được bật, cho phép chạy
  if (!state.enabled) {
    return { allowed: true, message: 'Schedule không được bật' };
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;

  // Parse start time
  const [startHour, startMinute] = state.startTime.split(':').map(Number);
  const startTimeInMinutes = startHour * 60 + startMinute;

  // Nếu không có end time, chỉ cần kiểm tra sau start time
  if (!state.endTime) {
    if (currentTimeInMinutes >= startTimeInMinutes) {
      return {
        allowed: true,
        message: `Trong schedule (sau ${state.startTime})`,
      };
    } else {
      return {
        allowed: false,
        message: `Ngoài schedule. Chương trình sẽ chạy từ ${state.startTime}`,
      };
    }
  }

  // Parse end time
  const [endHour, endMinute] = state.endTime.split(':').map(Number);
  const endTimeInMinutes = endHour * 60 + endMinute;

  // Kiểm tra nếu start time < end time (cùng ngày)
  if (startTimeInMinutes <= endTimeInMinutes) {
    if (currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes) {
      return {
        allowed: true,
        message: `Trong schedule (${state.startTime} - ${state.endTime})`,
      };
    } else {
      return {
        allowed: false,
        message: `Ngoài schedule. Chương trình chạy từ ${state.startTime} đến ${state.endTime}`,
      };
    }
  } else {
    // Trường hợp qua đêm: ví dụ 23:00 - 07:00
    if (currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes <= endTimeInMinutes) {
      return {
        allowed: true,
        message: `Trong schedule (${state.startTime} - ${state.endTime})`,
      };
    } else {
      return {
        allowed: false,
        message: `Ngoài schedule. Chương trình chạy từ ${state.startTime} đến ${state.endTime}`,
      };
    }
  }
};

export const scheduleSettingStorage: ScheduleSettingType = {
  ...storage,
  setVal: async (val: Partial<ScheduleSettingState>) => {
    await storage.set(currentState => deepmerge(currentState, val));
  },
  isWithinSchedule,
};
