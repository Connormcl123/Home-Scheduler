/** localStorage that never throws: the kiosk runs with site data cleared on some boots. */
export function safeStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the setting simply is not remembered.
  }
}
