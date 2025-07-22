// A small throttle utility with leading + trailing invocation
// Usage: const throttledFn = throttle(fn, 200);
// The returned function keeps `this` and arguments intact.
export function throttle(func, wait = 100) {
  let lastCallTime = 0;
  let timeoutId = null;

  const invoke = (context, args) => {
    lastCallTime = Date.now();
    func.apply(context, args);
  };

  return function throttled(...args) {
    const now = Date.now();
    const remaining = wait - (now - lastCallTime);

    if (remaining <= 0 || remaining > wait) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      invoke(this, args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        timeoutId = null;
        invoke(this, args);
      }, remaining);
    }
  };
}
