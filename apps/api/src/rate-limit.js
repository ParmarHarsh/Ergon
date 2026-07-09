export function createLoginRateLimiter({ maxAttempts = 10, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const attempts = new Map();

  function prune(currentTime) {
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= currentTime) attempts.delete(key);
    }
  }

  return {
    check(key) {
      const currentTime = now();
      if (attempts.size > 10_000) prune(currentTime);
      const entry = attempts.get(key);
      if (!entry || entry.resetAt <= currentTime) return { allowed: true };
      if (entry.count >= maxAttempts) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000)) };
      }
      return { allowed: true };
    },
    recordFailure(key) {
      const currentTime = now();
      const entry = attempts.get(key);
      if (!entry || entry.resetAt <= currentTime) {
        attempts.set(key, { count: 1, resetAt: currentTime + windowMs });
      } else {
        entry.count += 1;
      }
    },
    reset(key) {
      attempts.delete(key);
    }
  };
}
