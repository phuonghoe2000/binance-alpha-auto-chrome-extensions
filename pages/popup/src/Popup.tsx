import '@src/style/Popup.css';
import { BicycleMode } from './mode/bicycle-mode';
import { OrderMode } from './mode/order-mode';
import { ReverseMode } from './mode/reverse-mode';
import { base32Encode, parseMigrationQRCode } from './tool/protobuf';
import { getBalance } from './tool/tool_v1';
import { isNewerVersion } from './tool/version';
import { useLogger } from './useLogger';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { settingStorage, todayDealStorage, todayNoMulDealStorage } from '@extension/storage';
import {
  Button,
  cn,
  ErrorDisplay,
  Input,
  Label,
  LoadingSpinner,
  RadioGroup,
  RadioGroupItem,
  Scan,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@extension/ui';
import dayjs, { extend } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import jsqr from 'jsqr';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';

extend(utc);

const Popup = () => {
  const [updateInfo, setUpdateInfo] = useState({ update: false, version: '', url: '' });
  const [num, setNum] = useState(0);
  const setting = useStorage(settingStorage);
  const deal = useStorage(todayDealStorage);
  const noMulDeal = useStorage(todayNoMulDealStorage);

  const todayDeal = useMemo(() => {
    const day = dayjs().utc().format('YYYY-MM-DD');
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    typeof num;
    return deal[day] ?? '0';
  }, [deal, num]);

  const todayNoMulDeal = useMemo(() => {
    const day = dayjs().utc().format('YYYY-MM-DD');
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    typeof num;
    return noMulDeal[day] ?? '0';
  }, [noMulDeal, num]);

  const [runing, setRuning] = useState(false);
  // số dư ban đầu
  const [startBalance, setStartBalance] = useState('');
  // số dư hiện tại
  const [currentBalance, setCurrentBalance] = useState('');
  // nhật ký
  const { render, appendLog, clearLogger } = useLogger();

  // chênh lệch dòng tiền
  const op = useMemo(() => {
    const b1 = currentBalance.replace(/,/g, '');
    const b2 = startBalance.replace(/,/g, '');
    console.log(b1, b2);
    return Number(b1) - Number(b2);
  }, [currentBalance, startBalance]);

  const handleScan = useCallback(() => {
    // lấy tệp
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.png,.jpg,.jpeg,.gif';
    file.onchange = async e => {
      const target = e.target as HTMLInputElement;
      const input = target.files;
      if (!input?.length) return alert('Vui lòng chọn tệp hình ảnh');
      const inputFile = input[0];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return alert('Vui lòng mở bằng trình duyệt Chrome');
      const img = new Image();
      img.src = URL.createObjectURL(inputFile);
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        try {
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          const data = jsqr(imageData.data, imageData.width, imageData.height);
          if (!data?.data) throw new Error('Nội dung mã QR không hợp lệ, vui lòng quét lại');
          const results = parseMigrationQRCode(data.data);
          if (!results.length || results.length > 1)
            throw new Error('Vui lòng nhập đúng mã QR và không nhập nhiều dòng');
          const { secretBytes } = results[0];
          if (!secretBytes) throw new Error('Nội dung mã QR không hợp lệ, vui lòng quét lại');
          const secret = base32Encode(secretBytes);
          settingStorage.setVal({ secret });
          alert('Nhập thành công');
        } catch (error: any) {
          alert(error.message);
        }
      };

      file.remove();
    };
    file.click();
  }, []);

  const getNewVersion = async () => {
    const response = await fetch(
      'https://api.github.com/repos/tetap/binance-alpha-auto-chrome-extensions/releases/latest',
    );
    const json = await response.json();
    const tag_name = json.tag_name;
    const html_url = json.html_url;
    // kiểm tra xem phiên bản hiện tại có cần cập nhật hay không
    const currentVersion = chrome.runtime.getManifest().version;
    setUpdateInfo({
      version: tag_name,
      url: html_url,
      update: isNewerVersion(tag_name, currentVersion),
    });
  };

  useLayoutEffect(() => {
    getNewVersion();
    (async (setStartBalance, setCurrentBalance, appendLog) => {
      try {
        const [tab] = await chrome.tabs.query({ currentWindow: true, active: true });
        const balance = await getBalance(tab);
        setStartBalance(balance);
        setCurrentBalance(balance);
        appendLog(`Lấy số dư thành công: ${balance}`, 'success');
      } catch (error) {
        if (error instanceof Error) {
          appendLog(error.message, 'error');
        }
        appendLog(`Lấy số dư thất bại, vui lòng kiểm tra đã vào đúng trang trước khi bắt đầu`, 'error');
      }
    })(setStartBalance, setCurrentBalance, appendLog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn('bg-slate-50', 'App p-4 pb-0')}>
      <div className="flex min-h-0 flex-col gap-4">
        <div className="w-full">
          <div className="mb-2 flex flex-none items-center justify-between">
            <a
              target="_blank"
              href="https://github.com/tetap/binance-alpha-auto-chrome-extensions"
              className="text-purple-600 hover:text-purple-800">
              Phiên bản hiện tại: v{chrome.runtime.getManifest().version}
            </a>

            {updateInfo.update && (
              <a target="_blank" href={updateInfo.url} className="text-purple-600 hover:text-purple-800">
                Phát hiện phiên bản mới: {updateInfo.version}
              </a>
            )}
          </div>

          <div className="mb-2 text-xs">
            <div>
              <div>
                Khối lượng giao dịch tích điểm trong ngày:<b className={cn('ml-2 text-sm text-green-500')}> {todayDeal}</b>
              </div>
              <div>
                Khối lượng giao dịch trong ngày:<b className={cn('ml-2 text-sm text-green-500')}> {todayNoMulDeal}</b>
              </div>
            </div>
            <div>
              Hao hụt thao tác:<b className={cn('ml-2 text-sm', op > 0 ? 'text-green-500' : 'text-red-500')}> {op}</b>
            </div>
          </div>

          <div className="bg-background mb-4 flex flex-col gap-2 rounded-md p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="w-1/2 text-xs">
                Số dư ban đầu: <b className="text-sm">{startBalance}</b>
              </div>
              <div className="w-1/2 text-xs">
                Số dư hiện tại: <b className="text-sm">{currentBalance}</b>
              </div>
            </div>
          </div>

          <div className="mb-4 flex w-full max-w-sm items-center justify-between gap-3">
            <Label htmlFor="secret" className="w-28 flex-none">
              Xác minh lần hai (secret)
            </Label>
            <div className="relative w-full">
              <Input
                type="password"
                name="secret"
                id="secret"
                className="pr-8"
                placeholder="Tự động vượt qua mã xác minh cần bật xác minh lần hai"
                defaultValue={setting.secret ?? ''}
                disabled={runing}
                onChange={e => settingStorage.setVal({ secret: e.target.value ?? '' })}
              />
              <Button
                variant={'ghost'}
                disabled={runing}
                size={'icon'}
                className="absolute bottom-0 right-0 top-0 z-10 my-auto"
                onClick={() => handleScan()}>
                <Scan size={14} />
              </Button>
            </div>
          </div>

          <div className="mb-4 flex w-full max-w-sm items-center justify-between gap-3">
            <Label htmlFor="api" className="w-28 flex-none">
              Địa chỉ API
            </Label>
            <Input
              name="api"
              id="api"
              placeholder="Nếu truy cập được thì không cần thay đổi"
              disabled={runing}
              defaultValue={setting.api ?? 'https://www.binance.com'}
              onChange={e => settingStorage.setVal({ api: e.target.value ?? '' })}
            />
          </div>

          <div className="mb-4 flex w-full max-w-sm items-center justify-between gap-3">
            <Label htmlFor="runNum" className="w-28 flex-none">
              Cách đặt giới hạn
            </Label>
            <RadioGroup
              disabled={runing}
              className="flex items-center gap-3"
              defaultValue={setting.runType || 'sum'}
              onValueChange={value => settingStorage.setVal({ runType: value as 'sum' | 'price' })}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="sum" id="sum" />
                <Label htmlFor="sum">Chạy theo số lần</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="price" id="price" />
                <Label htmlFor="price">Chạy theo khối lượng tích điểm</Label>
              </div>
            </RadioGroup>
          </div>

          {setting.runType === 'sum' ? (
            <div className="mb-4 flex w-full max-w-sm items-center justify-between gap-3">
              <Label htmlFor="runNum" className="w-28 flex-none">
                Số lần thao tác
              </Label>
              <Input
                disabled={runing}
                key="runNum"
                type="text"
                name="runNum"
                id="runNum"
                placeholder={`Số lần thao tác`}
                defaultValue={setting.runNum ?? '1'}
                onChange={e => settingStorage.setVal({ runNum: e.target.value ?? '' })}
              />
            </div>
          ) : (
            <div className="mb-4 flex w-full max-w-sm items-center justify-between gap-3">
              <Label htmlFor="runPrice" className="w-28 flex-none">
                Tổng giá trị thao tác (USDT)
              </Label>
              <Input
                disabled={runing}
                key="runPrice"
                type="text"
                name="runPrice"
                id="runPrice"
                placeholder={`Tổng giá trị thao tác`}
                defaultValue={setting.runPrice ?? '65536'}
                onChange={e => settingStorage.setVal({ runPrice: e.target.value ?? '' })}
              />
            </div>
          )}

          <div>
            <div>
              <Tabs
                defaultValue={setting.mode ?? 'Reverse'}
                className="w-full"
                onValueChange={value => settingStorage.setVal({ mode: value as 'Reverse' | 'Order' })}>
                <TabsList>
                  <TabsTrigger disabled={runing} value="Reverse">
                    Lệnh ngược
                  </TabsTrigger>
                  <TabsTrigger disabled={runing} value="Order">
                    Lệnh giới hạn
                  </TabsTrigger>
                  <TabsTrigger disabled={runing} value="Bicycle">
                    Đổi mô-tô thành xe đạp
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="Reverse">
                  <ReverseMode
                    setCurrentBalance={setCurrentBalance}
                    setRuning={setRuning}
                    setStartBalance={setStartBalance}
                    startBalance={startBalance}
                    runing={runing}
                    appendLog={appendLog}
                    setNum={setNum}
                    api={setting.api || 'https://www.binance.com'}
                  />
                </TabsContent>
                <TabsContent value="Order">
                  <OrderMode
                    setCurrentBalance={setCurrentBalance}
                    setRuning={setRuning}
                    setStartBalance={setStartBalance}
                    startBalance={startBalance}
                    runing={runing}
                    appendLog={appendLog}
                    setNum={setNum}
                    api={setting.api || 'https://www.binance.com'}
                  />
                </TabsContent>
                <TabsContent value="Bicycle">
                  <BicycleMode
                    setCurrentBalance={setCurrentBalance}
                    setRuning={setRuning}
                    setStartBalance={setStartBalance}
                    startBalance={startBalance}
                    runing={runing}
                    appendLog={appendLog}
                    setNum={setNum}
                    api={setting.api || 'https://www.binance.com'}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>

        <div className="flex h-96 w-full flex-col gap-2 pb-4">
          <div className="flex flex-none items-center justify-between text-sm font-bold">
            <div>Xuất nhật ký</div>
            <Button variant={'outline'} onClick={clearLogger}>
              Xóa nhật ký
            </Button>
          </div>
          {render}
        </div>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
