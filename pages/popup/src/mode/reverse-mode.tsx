import {
  stopLoopAuth,
  startLoopAuth,
  backSell,
  callSubmit,
  cancelOrder,
  checkUnknownModal,
  getBalance,
  getId,
  getPrice,
  isAuthModal,
  // jumpToBuy,
  openReverseOrder,
  setLimitTotal,
  setPrice,
  setReversePrice,
  waitBuyOrder,
  injectDependencies,
  waitSellOrder,
} from '../tool/tool_v1';
import { useStorage } from '@extension/shared';
import { settingStorage, StategySettingStorage, todayDealStorage, todayNoMulDealStorage } from '@extension/storage';
import { Button, cn, Input, Label, RadioGroup, RadioGroupItem } from '@extension/ui';
import { checkMarketStable } from '@src/tool/strategy';
import dayjs, { extend } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { floor } from 'lodash-es';
import { useRef } from 'react';
import type { IPanelProps } from '../props/type';

extend(utc);

export const ReverseMode = ({
  setCurrentBalance,
  setStartBalance,
  startBalance,
  runing,
  setRuning,
  appendLog,
  setNum,
  api,
}: IPanelProps) => {
  const stopRef = useRef(false);
  const setting = useStorage(settingStorage);

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
      dot: string;
      minSleep: string;
      maxSleep: string;
      minDiscount: string;
      maxDiscount: string;
      buyPriceIncrease: string;
    };

    if (!data.timeout || !data.count || !data.minDiscount || !data.maxDiscount) {
      throw new Error('Tham số không được để trống');
    }
    if (isNaN(Number(data.count)) || isNaN(Number(data.minDiscount)) || isNaN(Number(data.maxDiscount))) {
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

    if (Number(data.minDiscount) > Number(data.maxDiscount)) {
      throw new Error('Tỷ lệ chiết khấu tối thiểu không thể cao hơn tỷ lệ tối đa');
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

    const minSleep = options.maxSleep ? Number(options.minSleep) : 1;
    const maxSleep = options.maxSleep ? Number(options.maxSleep) : 5;

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

    const count = Number(options.count); // Cài đặt thận trọng

    let balance = await getBalance(tab);

    if (!balance) return console.error('Không thể lấy số dư');

    if (!startBalance) {
      setStartBalance(balance);
    }
    let index = 0;
    let BuyOk = false;
    for (let i = 0; i < runNum; i++) {
      index++;
      injectDependencies(tab);

      if (stopRef.current) {
        appendLog(`Kết thúc bất ngờ`, 'error');
        break;
      }
      appendLog(`Lượt hiện tại: ${i + 1}`, 'info');

      try {
        let sleepTime = Math.floor(Math.random() * (maxSleep - minSleep + 1) + minSleep) * 1000;

        // Kiểm tra xem có cửa sổ bật lên lạ hay không
        await checkUnknownModal(tab);
        // Kiểm tra xem có lệnh nào chưa hủy không
        await cancelOrder(tab);
        // 兜底卖出
        await backSell(tab, api, symbol, appendLog, timeout, BuyOk);

        BuyOk = false;

        // 刷新余额
        const balance = await getBalance(tab);

        if (!balance) throw new Error('Không thể lấy số dư');

        appendLog(`Làm mới số dư: ${balance}`, 'info');

        setCurrentBalance(balance);

        setNum(Date.now());

        sleepTime = Math.floor(Math.random() * (maxSleep - minSleep + 1) + minSleep) * 1000;

        await new Promise(resolve => setTimeout(resolve, sleepTime));

        const stable = await checkMarketStable(api, symbol, await StategySettingStorage.get());

        if (!stable.stable) {
          appendLog(stable.message, 'error');
          i--;
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        } else {
          appendLog(stable.message, 'success');
        }

        // Chỉ đặt lệnh khi uptrend hoặc sideway
        if (stable.trend !== 'uptrend') {
          appendLog('Không phải xu hướng tăng, không đặt lệnh', 'info');
          // Đợi 1 giây nhỏ trước khi next loop để tránh vòng lặp quá nhanh
          await new Promise(resolve => setTimeout(resolve, 1000));
          i--;
          continue;
        }

        // 开启反向订单
        await openReverseOrder(tab);
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

        // buyPrice = stable.trend === '上涨趋势' ? (Number(buyPrice) + Number(buyPrice) * 0.0001).toString() : buyPrice; // 调整买入价
        // const submitPrice =
        //   stable.trend === '上涨趋势'
        //     ? (Number(buyPrice) + Number(buyPrice) * 0.0001).toString()
        //     : (Number(buyPrice) + Number(buyPrice) * 0.00001).toString(); // 调整买入价

        // Với uptrend: đặt giá mua cao hơn theo tỷ lệ cấu hình, giá bán cũng cao hơn
        // Với sideways: không đặt lệnh để tránh rủi ro
        if (stable.trend !== 'uptrend') {
          appendLog('Không phải xu hướng tăng, không đặt lệnh', 'info');
          // Đợi 1 giây nhỏ trước khi next loop để tránh vòng lặp quá nhanh
          await new Promise(resolve => setTimeout(resolve, 1000));
          i--;
          continue;
        }

        // Uptrend: đặt giá mua cao hơn theo % được cấu hình
        const buyPriceIncrease = Number(options.buyPriceIncrease || '0.01'); // default 0.01%
        const submitPrice = (Number(buyPrice) * (1 + buyPriceIncrease / 100)).toString();

        // Ghi giá mua
        await setPrice(tab, submitPrice);
        // Tính tiền mua
        const amount =
          options.orderAmountMode === 'Fixed'
            ? options.amount
            : floor(
                (Number(options.maxAmount) - Number(options.minAmount)) * Math.random() + Number(options.minAmount),
                2,
              ).toString();
        // Thiết lập số tiền mua
        await setLimitTotal(tab, amount);

        const discount = floor(
          (Number(options.maxDiscount) - Number(options.minDiscount)) * Math.random() + Number(options.minDiscount),
          6,
        );

        // Giá bán theo trend (luôn là uptrend vì đã check ở trên)
        appendLog(`trend: ${stable.trend}`, 'info');
        // Bán cao hơn mua theo tỷ lệ discount
        const truncated = (Number(buyPrice) * (1 + discount / 100)).toString();

        // Thiết lập giá lệnh đảo chiều
        await setReversePrice(tab, truncated.toString());
        // Thao tác xác nhận mua
        await callSubmit(tab);
        // Kiểm tra có xuất hiện mã xác thực hay không
        const isAuth = await isAuthModal(tab);
        // Nếu xuất hiện hộp thoại xác thực thì refresh trang và chờ 1 tiếng
        if (isAuth) {
          appendLog('Xuất hiện mã xác thực, refresh trang và chờ 1 tiếng', 'info');
          if (tab.id) {
            await chrome.tabs.reload(tab.id);
          }
          await new Promise(resolve => setTimeout(resolve, 3600000)); // chờ 1 tiếng (3600000ms)
          if (tab.id) {
            await chrome.tabs.reload(tab.id);
          }
        }
        // 等待订单完成
        BuyOk = await waitBuyOrder(tab, timeout);

        BuyOk = !(await waitSellOrder(tab, timeout));

        appendLog(`Đặt lệnh thành công: Giá mua ${buyPrice} Giá bán: ${truncated} Số tiền: ${amount}`, 'success');

        const day = dayjs().utc().format('YYYY-MM-DD');

        todayNoMulDealStorage.setVal(day, amount);

        todayDealStorage.setVal(day, (Number(amount) * mul).toString());

        sleepTime = Math.floor(Math.random() * (maxSleep - minSleep + 1) + minSleep) * 1000;

        await new Promise(resolve => setTimeout(resolve, timeout * 1000));

        await cancelOrder(tab);

        // await backSell(tab, api, symbol, appendLog, timeout);

        const price = Number(await todayDealStorage.getVal(day));

        if (runType === 'price' && price >= runPrice) {
          break;
        }
      } catch (error: any) {
        appendLog(error.message, 'error');
        if (error.message.includes('\u5237\u65b0\u9875\u9762') || error.message.includes('Làm mới trang')) {
          if (tab.id) await chrome.tabs.reload(tab.id);
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else if (index % 10 === 0 || error.message.includes('不存在')) {
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
      {/* <div className="flex w-full max-w-sm items-center justify-between gap-3">
        <Label htmlFor="dot" className="w-28 flex-none">
          Giữ lại chữ số thập phân khi bán
        </Label>
        <Input
          type="text"
          name="dot"
          id="dot"
          disabled={runing}
          placeholder="Giữ lại chữ số thập phân khi bán"
          defaultValue={setting.dot ?? '3'}
          onChange={e => settingStorage.setVal({ dot: e.target.value ?? '' })}
        />
      </div> */}

      <div className="flex w-full max-w-sm items-center justify-between gap-3">
        <Label htmlFor="buyPriceIncrease" className="w-28 flex-none">
          Tăng giá mua khi uptrend (%)
        </Label>
        <Input
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          disabled={runing}
          spellCheck={false}
          type="text"
          name="buyPriceIncrease"
          id="buyPriceIncrease"
          placeholder="Tăng giá mua khi uptrend (%)"
          defaultValue={setting.buyPriceIncrease ?? '0.01'}
          onChange={e => settingStorage.setVal({ buyPriceIncrease: e.target.value ?? '' })}
        />
      </div>

      <div className="flex w-full max-w-sm items-center justify-between gap-3">
        <Label className="w-28 flex-none">Chiết khấu lệnh đảo chiều (%)</Label>
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              disabled={runing}
              spellCheck={false}
              type="text"
              name="minDiscount"
              id="minDiscount"
              placeholder={`Chiết khấu tối thiểu (%)`}
              defaultValue={setting.minDiscount ?? '0.3'}
              onChange={e => settingStorage.setVal({ minDiscount: e.target.value ?? '' })}
            />
            <div>-</div>
            <Input
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              type="text"
              name="maxDiscount"
              id="maxDiscount"
              disabled={runing}
              placeholder={`Chiết khấu tối đa (%)`}
              defaultValue={setting.maxDiscount ?? '0.5'}
              onChange={e => settingStorage.setVal({ maxDiscount: e.target.value ?? '' })}
            />
          </div>
        </div>
      </div>

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
          defaultValue={setting.count ?? '3'}
          onChange={e => settingStorage.setVal({ count: e.target.value ?? '' })}
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
          defaultValue={setting.timeout ?? '3'}
          onChange={e => settingStorage.setVal({ timeout: e.target.value ?? '' })}
        />
      </div>

      <div className="flex w-full max-w-sm items-center justify-between gap-3">
        <Label className="w-28 flex-none">Chế độ số tiền đặt lệnh</Label>
        <RadioGroup
          name="orderAmountMode"
          disabled={runing}
          defaultValue={setting.orderAmountMode ?? 'Fixed'}
          className="flex items-center gap-4"
          onValueChange={value => settingStorage.setVal({ orderAmountMode: value as 'Fixed' | 'Random' })}>
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
          setting.orderAmountMode === 'Random' ? 'hidden' : '',
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
          defaultValue={setting.amount ?? ''}
          onChange={e => settingStorage.setVal({ amount: e.target.value ?? '' })}
        />
      </div>

      <div
        className={cn(
          'flex w-full max-w-sm items-center justify-between gap-3',
          setting.orderAmountMode === 'Fixed' ? 'hidden' : '',
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
            defaultValue={setting.minAmount ?? '50'}
            onChange={e => settingStorage.setVal({ minAmount: e.target.value ?? '' })}
          />
          <div>-</div>
          <Input
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            type="text"
            name="maxAmount"
            id="maxAmount"
            disabled={runing}
            placeholder={`Số tiền tối đa`}
            defaultValue={setting.maxAmount ?? '100'}
            onChange={e => settingStorage.setVal({ maxAmount: e.target.value ?? '' })}
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
