import '@src/style/Popup.css';
import { OrderMode } from './mode/order-mode';
import { ReverseMode } from './mode/reverse-mode';
import { base32Encode, parseMigrationQRCode } from './tool/protobuf';
import { getBalance, injectDependencies } from './tool/tool_v1';
import { isNewerVersion } from './tool/version';
import { useLogger } from './useLogger';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { settingStorage, StategySettingStorage, todayDealStorage, todayNoMulDealStorage } from '@extension/storage';
import {
  Button,
  ChevronsUpDown,
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
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
  const [isOpen, setIsOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState({ update: false, version: '', url: '' });
  const [num, setNum] = useState(0);
  const setting = useStorage(settingStorage);
  const strategy = useStorage(StategySettingStorage);
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
  // Số dư ban đầu
  const [startBalance, setStartBalance] = useState('');
  // Số dư hiện tại
  const [currentBalance, setCurrentBalance] = useState('');
  // Nhật ký
  const { render, appendLog, clearLogger } = useLogger();

  // Dòng tiền
  const op = useMemo(() => {
    const b1 = currentBalance.replace(/,/g, '');
    const b2 = startBalance.replace(/,/g, '');
    console.log(b1, b2);
    return Number(b1) - Number(b2);
  }, [currentBalance, startBalance]);

  const handleScan = useCallback(() => {
    // Lấy tệp
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
            throw new Error('Vui lòng nhập mã QR chính xác, đừng nhập nhiều mục');
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
    // Kiểm tra xem phiên bản hiện tại có cần cập nhật không
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
        await injectDependencies(tab);
        const balance = await getBalance(tab);
        setStartBalance(balance);
        setCurrentBalance(balance);
        appendLog(`Lấy số dư thành công: ${balance}`, 'success');
      } catch (error) {
        if (error instanceof Error) {
          appendLog(error.message, 'error');
        }
        appendLog(`Không thể lấy số dư, hãy chắc chắn bạn đang ở đúng trang trước khi thao tác`, 'error');
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
                Khối lượng giao dịch tính điểm trong ngày:
                <b className={cn('ml-2 text-sm text-green-500')}> {todayDeal}</b>
              </div>
              <div>
                Khối lượng giao dịch trong ngày:<b className={cn('ml-2 text-sm text-green-500')}> {todayNoMulDeal}</b>
              </div>
            </div>
            <div>
              Tổn hao thao tác:<b className={cn('ml-2 text-sm', op > 0 ? 'text-green-500' : 'text-red-500')}> {op}</b>
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
              Xác thực lần hai (secret)
            </Label>
            <div className="relative w-full">
              <Input
                type="password"
                name="secret"
                id="secret"
                className="pr-8"
                placeholder="Tự động vượt captcha, cần bật xác thực lần hai"
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
              placeholder="Nếu truy cập được thì đừng thay đổi"
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
                <Label htmlFor="price">Chạy theo khối lượng tính điểm</Label>
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
                Số tiền thao tác (USDT)
              </Label>
              <Input
                disabled={runing}
                key="runPrice"
                type="text"
                name="runPrice"
                id="runPrice"
                placeholder={`Số tiền thao tác`}
                defaultValue={setting.runPrice ?? '65536'}
                onChange={e => settingStorage.setVal({ runPrice: e.target.value ?? '' })}
              />
            </div>
          )}

          <div className="mb-4 flex w-full max-w-sm items-center justify-between gap-3">
            <Label htmlFor="runNum" className="w-28 flex-none">
              Độ trễ ngẫu nhiên (s)
            </Label>
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
                placeholder={`Thời gian tối thiểu (s)`}
                defaultValue={setting.minSleep ?? '1'}
                onChange={e => settingStorage.setVal({ minSleep: e.target.value ?? '' })}
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
                placeholder={`Thời gian tối đa (s)`}
                defaultValue={setting.maxSleep ?? '5'}
                onChange={e => settingStorage.setVal({ maxSleep: e.target.value ?? '' })}
              />
            </div>
          </div>

          <div className="mb-4 flex w-full max-w-sm items-center justify-between gap-3">
            <Label htmlFor="priceRatio" className="w-28 flex-none">
              溢价率(%)
            </Label>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                disabled={runing}
                spellCheck={false}
                type="text"
                name="priceRatio"
                id="priceRatio"
                placeholder={`最小时间(s)`}
                defaultValue={setting.priceRatio ?? '0.5'}
                onChange={e => settingStorage.setVal({ priceRatio: e.target.value ?? '' })}
              />
            </div>
          </div>

          <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4 flex w-full flex-col">
            <div className="justify-beween flex items-center gap-4">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <h4 className="text-sm font-semibold">Cài đặt nâng cao</h4>
                  <ChevronsUpDown />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className={cn('flex flex-col gap-2', isOpen && 'mt-4')}>
              <div className="mb-2 flex flex-col gap-2">
                <div className="flex w-full max-w-sm items-center justify-between gap-3">
                  <Label className="w-28 flex-none">Chế độ Strategy</Label>
                  <RadioGroup
                    disabled={runing}
                    className="flex items-center gap-3"
                    defaultValue={strategy.strategyMode || 'balanced'}
                    onValueChange={value =>
                      StategySettingStorage.setVal({
                        strategyMode: value as 'conservative' | 'balanced' | 'aggressive',
                      })
                    }>
                    <div className="flex items-center gap-1">
                      <RadioGroupItem value="conservative" id="conservative" />
                      <Label htmlFor="conservative" className="text-xs text-green-600">
                        An toàn
                      </Label>
                    </div>
                    <div className="flex items-center gap-1">
                      <RadioGroupItem value="balanced" id="balanced" />
                      <Label htmlFor="balanced" className="text-xs text-yellow-600">
                        Cân bằng
                      </Label>
                    </div>
                    <div className="flex items-center gap-1">
                      <RadioGroupItem value="aggressive" id="aggressive" />
                      <Label htmlFor="aggressive" className="text-xs text-red-600">
                        Tấn công
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="text-xs">
                  💹 An toàn: ≥3 algo + không downtrend | Cân bằng: ≥2 algo + không downtrend | Tấn công: ≥1 algo
                </div>
              </div>
              <div className="mb-2 flex flex-col gap-2">
                <div className="flex w-full max-w-sm items-center justify-between gap-3">
                  <Label htmlFor="upThreshold" className="w-28 flex-none">
                    Ngưỡng xác nhận xu hướng tăng
                  </Label>
                  <Input
                    name="upThreshold"
                    id="upThreshold"
                    disabled={runing}
                    defaultValue={strategy.upThreshold ?? 2}
                    onChange={e => StategySettingStorage.setVal({ upThreshold: Number(e.target.value ?? '0') })}
                  />
                </div>
                <div className="text-xs">💹: Khi có (n) chỉ báo đạt ngưỡng thì xem là xu hướng tăng</div>
              </div>
              <div className="mb-2 flex flex-col gap-2">
                <div className="flex w-full max-w-sm items-center justify-between gap-3">
                  <Label htmlFor="limit" className="w-28 flex-none">
                    Số lượng nến K-line
                  </Label>
                  <Input
                    name="limit"
                    id="limit"
                    disabled={runing}
                    defaultValue={strategy.limit ?? 15}
                    onChange={e => StategySettingStorage.setVal({ limit: Number(e.target.value ?? '0') })}
                  />
                </div>
                <div className="text-xs">💹: Số nến K-line dùng để đánh giá</div>
              </div>
              <div className="mb-2 flex flex-col gap-2">
                <div className="flex w-full max-w-sm items-center justify-between gap-3">
                  <Label htmlFor="toSlope" className="w-28 flex-none">
                    Độ dốc xu hướng tuyến tính
                  </Label>
                  <Input
                    name="toSlope"
                    id="toSlope"
                    disabled={runing}
                    defaultValue={strategy.toSlope ?? 0.000001}
                    onChange={e => StategySettingStorage.setVal({ toSlope: Number(e.target.value ?? '0') })}
                  />
                </div>
                <div className="text-xs">
                  💹: Độ dốc xu hướng tuyến tính; đặt 0 nghĩa là vẫn giao dịch khi sideways. Đây là độ cong, thường chỉ
                  cần chỉnh chữ số thập phân cuối, ví dụ 0.000003 để đánh giá xu hướng tăng chặt chẽ hơn
                </div>
              </div>

              <div className="mb-2 flex flex-col gap-2">
                <div className="flex w-full max-w-sm items-center justify-between gap-3">
                  <Label htmlFor="toSlope" className="w-28 flex-none">
                    Kiểm tra đà tăng liên tục
                  </Label>
                  <Input
                    name="confirm"
                    id="confirm"
                    disabled={runing}
                    defaultValue={strategy.confirm ?? 3}
                    onChange={e => StategySettingStorage.setVal({ confirm: Number(e.target.value ?? '0') })}
                  />
                </div>
                <div className="text-xs">💹: Số lần kiểm tra đà tăng</div>
              </div>

              <div className="mb-2 flex flex-col gap-2">
                <div className="flex w-full max-w-sm items-center justify-between gap-3">
                  <Label htmlFor="short" className="w-28 flex-none">
                    Chênh lệch hướng MA ngắn hạn và dài hạn
                  </Label>
                  <div className="flex w-full items-center gap-2">
                    <Input
                      name="short"
                      id="short"
                      placeholder="short"
                      disabled={runing}
                      defaultValue={strategy.short ?? 5}
                      onChange={e => StategySettingStorage.setVal({ short: Number(e.target.value ?? '0') })}
                    />
                    <Input
                      name="long"
                      id="long"
                      placeholder="long"
                      disabled={runing}
                      defaultValue={strategy.long ?? 20}
                      onChange={e => StategySettingStorage.setVal({ long: Number(e.target.value ?? '0') })}
                    />
                  </div>
                </div>
                <div className="text-xs">
                  💹: Tham số 1: chu kỳ MA ngắn hạn phản ánh biến động giá gần đây; tham số 2: chu kỳ MA dài hạn phản
                  ánh xu hướng tổng thể
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div>
            <div>
              <Tabs
                defaultValue={setting.mode ?? 'Reverse'}
                className="w-full"
                onValueChange={value => settingStorage.setVal({ mode: value as 'Reverse' | 'Order' })}>
                <TabsList>
                  <TabsTrigger disabled={runing} value="Reverse">
                    Lệnh đảo chiều
                  </TabsTrigger>
                  <TabsTrigger disabled={runing} value="Order">
                    Lệnh giới hạn
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
