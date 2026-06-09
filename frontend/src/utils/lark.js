// Lark OAuth redirect flow
// When user opens app inside Lark, redirect to Lark auth → get code in URL → exchange for identity

const APP_ID = import.meta.env.VITE_LARK_APP_ID || '';

// Get auth code from URL params (after Lark redirects back)
export function getCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('code');
}

// Redirect to Lark OAuth — user is auto-approved if already logged in
export function redirectToLarkAuth() {
  const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
  window.location.href = `https://open.larksuite.com/open-apis/authen/v1/index?app_id=${APP_ID}&redirect_uri=${redirectUri}&response_type=code`;
}
