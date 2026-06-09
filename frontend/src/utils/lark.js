// Lark H5 JSAPI helpers
// In Lark WebView: window.h5sdk and window.tt are injected automatically
// Outside Lark (dev): falls back to mock

const APP_ID = import.meta.env.VITE_LARK_APP_ID || '';

export function isInLark() {
  return !!(window.h5sdk || window.tt);
}

// Get Lark auth code — must be called to identify the user
export function getAuthCode() {
  return new Promise((resolve, reject) => {
    if (!window.h5sdk && !window.tt) {
      // Dev fallback: skip real auth
      console.warn('Not in Lark — using dev mock user');
      resolve('dev_mock_code');
      return;
    }
    const ready = window.h5sdk
      ? (cb) => window.h5sdk.ready(cb)
      : (cb) => cb();

    ready(() => {
      window.tt.requestAuthCode({
        appId: APP_ID,
        success(res) { resolve(res.code); },
        fail(err) { reject(new Error(err.errMsg || 'Auth failed')); },
      });
    });
  });
}
