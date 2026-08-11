const MAX_ATTEMPTS = 3;

export function shouldRetry(attemptCount) {
  return Number(attemptCount || 0) + 1 < MAX_ATTEMPTS;
}

export function getNextAttempt(attemptCount) {
  return Number(attemptCount || 0) + 1;
}

export function getMaxAttempts() {
  return MAX_ATTEMPTS;
}

export function getRetryInput(input) {
  return input || {};
}