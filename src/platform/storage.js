/** Local storage with explicit errors: a failed save must never look successful. */
export const gameStorage = {
    getItem(key) { return window.localStorage.getItem(key); },
    setItem(key, value) { window.localStorage.setItem(key, String(value)); },
    removeItem(key) { window.localStorage.removeItem(key); }
};
