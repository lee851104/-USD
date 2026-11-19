// localStorage 包一層 try/catch：私密模式或被封鎖時頁面照常運作。
const PREFIX = 'usd-dash:';

export function getItem(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function setItem(key, value) {
  try {
    if (value == null || value === '') localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, value);
  } catch {
    /* ignore */
  }
}
