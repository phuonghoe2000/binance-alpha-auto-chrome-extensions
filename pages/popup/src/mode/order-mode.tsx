import {
  startLoopAuth,
  stopLoopAuth,
  backSell,
  callSubmit,
  cancelOrder,
  checkUnknownModal,
  closeReverseOrder,
  getBalance,
  getId,
  getPrice,
  injectDependencies,
  isAuthModal,
  // jumpToBuy,
  setLimitTotal,
  setPrice,
  waitOrder,
} from '../tool/tool_v1';
import { useStorage } from '@extension/shared';
import {
  orderSettingStorage,
  settingStorage,
  StategySettingStorage,
  todayDealStorage,
  todayNoMulDealStorage,
} from '@extension/storage';
import { Button, cn, Input, Label, RadioGroup, RadioGroupItem } from '@extension/ui';
import { checkMarketStable } from '@src/tool/strategy';
import dayjs, { extend } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { floor } from 'lodash-es';
import { useRef } from 'react';
import type { IPanelProps } from '../props/type';

extend(utc);

export const OrderMode = ({
  setCurrentBalance,
  setStartBalance,
  startBalance,
  runing,
  setRuning,
  appendLog,
  setNum,
  api,
}: IPanelProps) => {
  const orderSetting = useStorage(orderSettingStorage);
  const stopRef = useRef(false);

  const getOptions = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const setting = await settingStorage.get();

    const data = Object.fromEntries(formData.entries()) as {
      amount: string;
      count: string;
      runNum: string;
      runPrice: string;
      runType: (typeof setting)['runType'];
      timeout: string;
      orderAmountMode: 'Fixed' | 'Random';
      maxAmount: string;
      minAmount: string;
      minSleep: string;
      maxSleep: string;
    };

    if (!data.timeout || !data.count) {
      throw new Error('Tham số không được để trống');
    }
    if (isNaN(Number(data.count))) {
      throw new Error('Tham số phải là số');
    }
    // Kiểm tra số tiền đặt lệnh
    if (data.orderAmountMode === 'Fixed') {
      if (!data.amount) {
        throw new Error('Số tiền đặt lệnh không được để trống');
      }
      if (isNaN(Number(data.amount))) {
        throw new Error('Số tiền đặt lệnh phải là số');
      }
    } else if (data.orderAmountMode === 'Random') {
      if (!data.maxAmount || !data.minAmount) {
        throw new Error('Khoảng giá trị đặt lệnh không được để trống');
      }
      if (isNaN(Number(data.maxAmount)) || isNaN(Number(data.minAmount))) {
        throw new Error('Khoảng giá trị đặt lệnh phải là số');
      }
      if (Number(data.maxAmount) < Number(data.minAmount)) {
        throw new Error('Khoảng giá trị đặt lệnh không hợp lệ');
      }
    } else {
      throw new Error('Chế độ số tiền đặt lệnh không hợp lệ');
    }

    const runNum = setting['runNum'];
    const runPrice = setting['runPrice'];
    const runType = setting['runType'];

    data['runNum'] = runNum;
    data['runPrice'] = runPrice;
    data['runType'] = runType;

    data['minSleep'] = setting['minSleep'] || '1';
    data['maxSleep'] = setting['maxSleep'] || '5';

    if (Number(data['maxSleep']) <= Number(data['minSleep'])) {
      throw new Error('Thời gian trễ tối đa không thể nhỏ hơn thời gian trễ tối thiểu');
    }

    if (data['runType'] === 'sum' && !data['runNum']) {
      throw new Error('Vui lòng nhập số lần chạy');
    } else if (data['runType'] === 'price' && !data['runPrice']) {
      throw new Error('Vui lòng nhập mức giao dịch');
    }

    return data;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    if (runing) {
      stopRef.current = true;
      appendLog('Đang dừng, vui lòng chờ vòng thực thi hiện tại hoàn tất', 'info');
      e.preventDefault();
      return;
    }

    const options = await getOptions(e).catch(error => {
      appendLog(error.message, 'error');
      throw new Error(error.message);
    });

    stopRef.current = false;

    setRuning(true);

    const [tab] = await chrome.tabs.query({ currentWindow: true, active: true });

    const id = await getId(tab, api).catch(() => null); // Lấy ID đồng tiền

    if (!id || !id.symbol) {
      appendLog('Không thể lấy ID đồng tiền', 'error');
      setRuning(false);
      return;
    }

    const { symbol, mul } = id;

    appendLog(`Đã lấy ID đồng tiền: ${symbol} Hệ số điểm: ${mul}`, 'info');

    if (!symbol) {
      appendLog('Không thể lấy ID đồng tiền', 'error');
      setRuning(false);
      return;
    }

    const secret = (await settingStorage.get()).secret;
    if (secret) {
      startLoopAuth(tab, secret, () => {
        stopRef.current = true;
        appendLog('Xuất hiện lỗi xác minh mã, tự động dừng', 'error');
      });
    }

    const runType = options.runType;

    let runNum = options.runNum ? Number(options.runNum) : 1; // Số lần chạy

    const runPrice = options.runPrice ? Number(options.runPrice) : 1; // Số tiền chạy

    if (runType === 'price') {
      runNum = Number.MAX_VALUE;
    }

    const timeout = options.timeout ? Number(options.timeout) : 1; // Thời gian hết hạn đặt lệnh

    const minSleep = options.maxSleep ? Number(options.minSleep) : 1;
    const maxSleep = options.maxSleep ? Number(options.maxSleep) : 5;

    const count = Number(options.count); // Cài đặt thận trọng

    let balance = await getBalance(tab);

    if (!balance) return console.error('Không thể lấy số dư');

    if (!startBalance) {
      setStartBalance(balance);
    }
    let index = 0;
    for (let i = 0; i < runNum; i++) {
      let sleepTime = Math.floor(Math.random() * (maxSleep - minSleep + 1) + minSleep) * 1000;
      appendLog(`Lượt hiện tại: ${i + 1}`, 'info');
      index++;
      injectDependencies(tab);

      if (stopRef.current) {
        appendLog(`Kết thúc bất ngờ`, 'error');
        break;
      }

      let BuyOk = false;

      try {
        // Chờ 1 giây
        await new Promise(resolve => setTimeout(resolve, sleepTime));
        // Kiểm tra xem có cửa sổ bật lên lạ hay không
        await checkUnknownModal(tab);
        // Kiểm tra xem có lệnh nào chưa hủy không
        await cancelOrder(tab);
        // 兜底卖出
        await backSell(tab, api, symbol, appendLog, timeout, BuyOk);

        BuyOk = false;

        // Làm mới số dư
        const balance = await getBalance(tab);

        if (!balance) throw new Error('Không thể lấy số dư');

        appendLog(`Làm mới số dư: ${balance}`, 'info');

        setCurrentBalance(balance);

        // Quay lại bảng mua
        // await jumpToBuy(tab);

        // Kiểm tra K-line
        const stable = await checkMarketStable(api, symbol, await StategySettingStorage.get());

        if (!stable.stable) {
          appendLog(stable.message, 'error');
          i--;
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        } else {
          appendLog(stable.message, 'success');
        }

        let buyPrice = await getPrice(symbol, api);
        appendLog(`Số lần kiểm tra thận trọng: ${count}`, 'info');
        for (let j = 0; j < count; j++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          // Lấy giá mua
          const curPrice = await getPrice(symbol, api); // Lấy giá
          appendLog(`Giá hiện tại: ${curPrice}`, 'info');
          if (Number(curPrice) < Number(buyPrice)) {
            buyPrice = curPrice;
            appendLog(`Giá giảm, điều chỉnh giá mua thành ${buyPrice}`, 'info');
          }
        }
        if (!buyPrice) throw new Error('Không thể lấy giá');

        appendLog(`Đã lấy giá mua: ${buyPrice}`, 'info');

        buyPrice = stable.trend === 'uptrend' ? (Number(buyPrice) + Number(buyPrice) * 0.001).toString() : buyPrice; // Điều chỉnh giá mua
        // buyPrice = stable.trend === 'uptrend' ? (Number(buyPrice) + Number(buyPrice) * 0.0001).toString() : buyPrice; // Điều chỉnh giá mua
        // Đóng lệnh đảo chiều
        await closeReverseOrder(tab);
        // Điền giá mua
        await setPrice(tab, buyPrice);
        // Tính số tiền mua
        const amount =
          options.orderAmountMode === 'Fixed'
            ? options.amount
            : floor(
                (Number(options.maxAmount) - Number(options.minAmount)) * Math.random() + Number(options.minAmount),
                2,
              ).toString();
        // Thiết lập số tiền mua
        await setLimitTotal(tab, amount);

        // Thao tác xác nhận mua
        await callSubmit(tab);
        // Kiểm tra có xuất hiện mã xác thực hay không
        const isAuth = await isAuthModal(tab);
        // Nếu xuất hiện hộp thoại xác thực thì chờ
        if (isAuth) {
          appendLog('Xuất hiện mã xác thực, chờ xác minh', 'info');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        // 等待订单完成
        BuyOk = await waitOrder(tab, timeout);

        appendLog(`Đặt lệnh thành công: Giá: ${buyPrice} Số tiền: ${amount}`, 'success');

        const day = dayjs().utc().format('YYYY-MM-DD');

        todayNoMulDealStorage.setVal(day, amount);

        todayDealStorage.setVal(day, (Number(amount) * mul).toString());

        sleepTime = Math.floor(Math.random() * (maxSleep - minSleep + 1) + minSleep) * 1000;

        await new Promise(resolve => setTimeout(resolve, sleepTime));

        await backSell(tab, api, symbol, appendLog, timeout, BuyOk);

        sleepTime = Math.floor(Math.random() * (maxSleep - minSleep + 1) + minSleep) * 1000;

        // Chờ 2 giây
        await new Promise(resolve => setTimeout(resolve, sleepTime));

        setNum(Date.now());

        const price = Number(await todayDealStorage.getVal(day));

        console.log(runPrice, price);

        if (runType === 'price' && price >= runPrice) {
          break;
        }
      } catch (error: any) {
        appendLog(error.message, 'error');
        if (error.message.includes('\u5237\u65b0\u9875\u9762') || error.message.includes('Làm mới trang')) {
          if (tab.id) await chrome.tabs.reload(tab.id);
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else if (index % 10 === 0) {
          if (tab.id) await chrome.tabs.reload(tab.id);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        i--;
      }
    }

    // Chờ 1 giây
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Kiểm tra xem có cửa sổ bật lên lạ hay không
    await checkUnknownModal(tab);
    // Kiểm tra xem có lệnh nào chưa hủy không
    await cancelOrder(tab);
    // Bán dự phòng
    await backSell(tab, api, symbol, appendLog, timeout);

    balance = await getBalance(tab);

    if (!balance) throw new Error('Không thể lấy số dư');

    appendLog(`Làm mới số dư: ${balance}`, 'info');

    setCurrentBalance(balance);

    setNum(Date.now());

    appendLog('Hoàn tất thực thi', 'success');

    if (secret) stopLoopAuth();

    setRuning(false);
  };

  return (
    <form className="mt-4 flex w-full flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex w-full max-w-sm items-center justify-between gap-3">
        <Label htmlFor="count" className="w-28 flex-none">
          Thiết lập thận trọng (số lần kiểm tra biến động giá)
        </Label>
        <Input
          type="text"
          name="count"
          id="count"
          disabled={runing}
          placeholder="Thiết lập thận trọng (số lần kiểm tra biến động giá)"
          defaultValue={orderSetting.count ?? '3'}
          onChange={e => orderSettingStorage.setVal({ count: e.target.value ?? '' })}
        />
      </div>

      <div className="flex w-full max-w-sm items-center justify-between gap-3">
        <Label htmlFor="timeout" className="w-28 flex-none">
          Hết hạn đặt lệnh (giây)
        </Label>
        <Input
          type="text"
          name="timeout"
          id="timeout"
          disabled={runing}
          placeholder={`Hết hạn đặt lệnh`}
          defaultValue={orderSetting.timeout ?? '3'}
          onChange={e => orderSettingStorage.setVal({ timeout: e.target.value ?? '' })}
        />
      </div>

      <div className="flex w-full max-w-sm items-center justify-between gap-3">
        <Label className="w-28 flex-none">Chế độ số tiền đặt lệnh</Label>
        <RadioGroup
          name="orderAmountMode"
          disabled={runing}
          defaultValue={orderSetting.orderAmountMode ?? 'Fixed'}
          className="flex items-center gap-4"
          onValueChange={value => orderSettingStorage.setVal({ orderAmountMode: value as 'Fixed' | 'Random' })}>
          <div className="flex items-center">
            <RadioGroupItem value="Fixed" id="Fixed" />
            <Label htmlFor="Fixed" className="pl-2 text-xs">
              Cố định
            </Label>
          </div>
          <div className="flex items-center">
            <RadioGroupItem value="Random" id="Random" />
            <Label htmlFor="Random" className="pl-2 text-xs text-red-500">
              Ngẫu nhiên
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div
        className={cn(
          'flex w-full max-w-sm items-center justify-between gap-3',
          orderSetting.orderAmountMode === 'Random' ? 'hidden' : '',
        )}>
        <Label htmlFor="amount" className="w-28 flex-none">
          Số tiền đặt lệnh (mỗi lần thao tác{' (USDT)'})
        </Label>
        <Input
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          disabled={runing}
          spellCheck={false}
          type="text"
          name="amount"
          id="amount"
          placeholder={`Số tiền đặt lệnh (mỗi lần thao tác (USDT))`}
          defaultValue={orderSetting.amount ?? ''}
          onChange={e => orderSettingStorage.setVal({ amount: e.target.value ?? '' })}
        />
      </div>

      <div
        className={cn(
          'flex w-full max-w-sm items-center justify-between gap-3',
          orderSetting.orderAmountMode === 'Fixed' ? 'hidden' : '',
        )}>
        <Label className="w-28 flex-none">Số tiền đặt lệnh (mỗi lần thao tác{' (USDT)'})</Label>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            disabled={runing}
            spellCheck={false}
            type="text"
            name="minAmount"
            id="minAmount"
            placeholder={`Số tiền tối thiểu`}
            defaultValue={orderSetting.minAmount ?? '50'}
            onChange={e => orderSettingStorage.setVal({ minAmount: e.target.value ?? '' })}
          />
          <div>-</div>
          <Input
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            disabled={runing}
            spellCheck={false}
            type="text"
            name="maxAmount"
            id="maxAmount"
            placeholder={`Số tiền tối đa`}
            defaultValue={orderSetting.maxAmount ?? '100'}
            onChange={e => orderSettingStorage.setVal({ maxAmount: e.target.value ?? '' })}
          />
        </div>
      </div>

      <div>
        <Button className="w-full" type="submit" disabled={!startBalance}>
          {runing ? 'Dừng' : 'Thực thi'}
        </Button>
      </div>
    </form>
  );
};
