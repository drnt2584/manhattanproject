export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'notify' } };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && !url.endsWith('/auth/login')) onUnauthorized();
    throw new ApiError(res.status, data?.error || res.statusText);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', `/api${url}`),
  post: (url, body = {}) => request('POST', `/api${url}`, body),
  put: (url, body) => request('PUT', `/api${url}`, body),
  del: (url) => request('DELETE', `/api${url}`),
};

export const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
