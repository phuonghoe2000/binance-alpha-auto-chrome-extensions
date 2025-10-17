(function () {
  console.log('content script - Đã tiêm');

  window.setValue = (selector, value) => {
    const input = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!input) throw new Error('Phần tử input không tồn tại');
    // eslint-disable-next-line no-undef
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(input, value);
    // eslint-disable-next-line no-undef
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // eslint-disable-next-line no-undef
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // Ghi đè API WebAuthn
  Object.defineProperty(navigator, 'credentials', {
    value: {
      get: async () => {
        console.warn('WebAuthn đã bị tiện ích vô hiệu hóa');
        throw new DOMException('WebAuthn disabled by extension', 'NotAllowedError');
      },
      create: async () => {
        console.warn('Đăng ký WebAuthn đã bị tiện ích vô hiệu hóa');
        throw new DOMException('WebAuthn disabled by extension', 'NotAllowedError');
      },
    },
    configurable: false,
  });
})();
