const axios = require('axios');

const BASE_URL = 'https://open.larksuite.com/open-apis';

let tokenCache = { token: null, expiresAt: 0 };

// Get tenant access token (cached, auto-refreshes)
async function getTenantToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const res = await axios.post(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    app_id: process.env.LARK_APP_ID,
    app_secret: process.env.LARK_APP_SECRET,
  });
  if (res.data.code !== 0) throw new Error(`Lark token error: ${res.data.msg}`);
  tokenCache.token = res.data.tenant_access_token;
  tokenCache.expiresAt = Date.now() + (res.data.expire - 60) * 1000;
  return tokenCache.token;
}

// Exchange user auth code for user info
async function getUserInfo(code) {
  const token = await getTenantToken();
  // Step 1: get user access token
  const tokenRes = await axios.post(
    `${BASE_URL}/authen/v1/oidc/access_token`,
    { grant_type: 'authorization_code', code },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  if (tokenRes.data.code !== 0) throw new Error(`Auth error: ${tokenRes.data.msg}`);
  const userAccessToken = tokenRes.data.data.access_token;

  // Step 2: get user info
  const userRes = await axios.get(`${BASE_URL}/authen/v1/user_info`, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  if (userRes.data.code !== 0) throw new Error(`User info error: ${userRes.data.msg}`);
  return userRes.data.data; // { open_id, name, avatar_url, email, ... }
}

// List records from a Bitable table
async function listRecords(tableId, filter = '', pageSize = 100) {
  const token = await getTenantToken();
  const params = { page_size: pageSize };
  if (filter) params.filter = filter;

  const res = await axios.get(
    `${BASE_URL}/bitable/v1/apps/${process.env.BITABLE_APP_TOKEN}/tables/${tableId}/records`,
    { headers: { Authorization: `Bearer ${token}` }, params }
  );
  if (res.data.code !== 0) throw new Error(`List records error: ${res.data.msg}`);
  return res.data.data.items || [];
}

// Create a record in a Bitable table
async function createRecord(tableId, fields) {
  const token = await getTenantToken();
  const res = await axios.post(
    `${BASE_URL}/bitable/v1/apps/${process.env.BITABLE_APP_TOKEN}/tables/${tableId}/records`,
    { fields },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  if (res.data.code !== 0) throw new Error(`Create record error: ${res.data.msg}`);
  return res.data.data.record;
}

// Send a Lark message to a user by open_id
async function sendMessage(openId, text) {
  const token = await getTenantToken();
  await axios.post(
    `${BASE_URL}/im/v1/messages?receive_id_type=open_id`,
    {
      receive_id: openId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
}

module.exports = { getTenantToken, getUserInfo, listRecords, createRecord, sendMessage };
