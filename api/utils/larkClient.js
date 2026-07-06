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

// List records from a Bitable table (auto-paginates up to maxTotal records)
// Lark Bitable max page_size is 500; pass maxTotal to cap total records fetched
async function listRecords(tableId, filter = '', maxTotal = 100) {
  const token = await getTenantToken();
  const pageSize = Math.min(maxTotal, 500);
  const params = { page_size: pageSize };
  if (filter) params.filter = filter;

  const allItems = [];
  let pageToken = null;

  do {
    if (pageToken) params.page_token = pageToken;
    const res = await axios.get(
      `${BASE_URL}/bitable/v1/apps/${process.env.BITABLE_APP_TOKEN}/tables/${tableId}/records`,
      { headers: { Authorization: `Bearer ${token}` }, params }
    );
    if (res.data.code !== 0) throw new Error(`List records error [${res.data.code}]: ${res.data.msg}`);
    const data = res.data.data;
    allItems.push(...(data.items || []));
    pageToken = data.has_more ? data.page_token : null;
  } while (pageToken && allItems.length < maxTotal);

  return allItems;
}

// Create a record in a Bitable table
async function createRecord(tableId, fields) {
  const token = await getTenantToken();
  const res = await axios.post(
    `${BASE_URL}/bitable/v1/apps/${process.env.BITABLE_APP_TOKEN}/tables/${tableId}/records`,
    { fields },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  if (res.data.code !== 0) {
    console.error('Lark create record failed:', JSON.stringify({ code: res.data.code, msg: res.data.msg, fields }));
    throw new Error(`Create record error: ${res.data.msg}`);
  }
  return res.data.data.record;
}

// Send a plain text Lark message to a user by open_id
async function sendMessage(openId, text) {
  const token = await getTenantToken();
  await axios.post(
    `${BASE_URL}/im/v1/messages?receive_id_type=open_id`,
    { receive_id: openId, msg_type: 'text', content: JSON.stringify({ text }) },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
}

// Send an interactive card to a user by open_id
// card: { config, header: { title, template }, elements: [...] }
async function sendCard(openId, card) {
  const token = await getTenantToken();
  try {
    const res = await axios.post(
      `${BASE_URL}/im/v1/messages?receive_id_type=open_id`,
      { receive_id: openId, msg_type: 'interactive', content: JSON.stringify(card) },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    if (res.data.code !== 0) {
      console.error('sendCard failed:', openId, res.data.code, res.data.msg);
    }
  } catch (err) {
    console.error('sendCard HTTP error:', openId, JSON.stringify(err.response?.data) || err.message);
    throw err;
  }
}

module.exports = { getTenantToken, getUserInfo, listRecords, createRecord, sendMessage, sendCard };
