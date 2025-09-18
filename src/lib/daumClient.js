// ESM
import axios from 'axios';

function getDaumCreds(env = 'test') {
  const isProd = env === 'prod' || env === 'production';
  const id = isProd ? process.env.DAUM_ID_PROD : process.env.DAUM_ID_TEST;
  const key = isProd ? process.env.DAUM_KEY_PROD : process.env.DAUM_KEY_TEST;
  const baseURL = isProd ? process.env.DAUM_BASEURL_PROD : process.env.DAUM_BASEURL_TEST;
  if (!id || !key || !baseURL) throw new Error(`[DaumConfigError] Missing ${env} envs`);
  return { id, key, baseURL };
}

function buildBasicAuthHeader(id, key) {
  const token = Buffer.from(`${id}:${key}`).toString('base64');
  return `Basic ${token}`;
}

export default function createDaumAxios(env = 'test') {
  const { id, key, baseURL } = getDaumCreds(env);
  return axios.create({
    baseURL,
    timeout: 15000,
    headers: { Authorization: buildBasicAuthHeader(id, key) },
  });
}
