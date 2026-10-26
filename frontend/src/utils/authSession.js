const TOKEN_KEY = 'token';

// All tabs on the same origin share one remembered login.
export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || null;
}
export function setAuthToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function subscribeAuthChanges(onChange) {
  const onStorage = event => {
    if (event.storageArea === localStorage && (event.key === TOKEN_KEY || event.key === null)) {
      onChange();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

export function openAuthenticatedPage(path) {
  const url = new URL(path, window.location.href);
  if (url.origin !== window.location.origin) throw new Error('Expected a same-origin page');
  const preview = window.open('about:blank', '_blank');
  if (!preview) {
    window.location.assign(url.href);
    return;
  }
  try {
    preview.opener = null;
    preview.location.replace(url.href);
  } catch {
    preview.close();
    window.location.assign(url.href);
  }
}
