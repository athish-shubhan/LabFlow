"""Failed-login throttle.

Counts failed sign-ins per (client address, email) in a sliding window and answers 429
once the limit is reached. State is in process memory, so with several workers or
replicas each one keeps its own count and the effective limit is multiplied; a shared
store (Redis, or a table) would be needed for a hard guarantee. It still stops a
single client from guessing passwords at bcrypt-limited speed against one account. Behind the Next.js BFF every browser
sign-in arrives from the BFF's address, so the email is what separates users there, and
repeated failures against one email block that email for the window.
"""

import threading
import time
from collections import defaultdict, deque

MAX_FAILURES = 10
WINDOW_SECONDS = 15 * 60
# Keeps memory bounded when someone cycles through many emails.
MAX_TRACKED_KEYS = 10_000


class LoginThrottle:
    def __init__(self, max_failures: int = MAX_FAILURES, window: float = WINDOW_SECONDS, clock=time.monotonic):
        self.max_failures = max_failures
        self.window = window
        self._clock = clock
        self._failures: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: tuple[str, str], now: float) -> deque[float]:
        hits = self._failures.get(key)
        if hits is None:
            return deque()
        while hits and now - hits[0] >= self.window:
            hits.popleft()
        if not hits:
            del self._failures[key]
        return hits

    def retry_after(self, key: tuple[str, str]) -> int | None:
        """Seconds until another attempt is allowed, or None if the key is not blocked."""
        with self._lock:
            now = self._clock()
            hits = self._prune(key, now)
            if len(hits) < self.max_failures:
                return None
            return max(1, int(hits[0] + self.window - now) + 1)

    def record_failure(self, key: tuple[str, str]) -> None:
        with self._lock:
            now = self._clock()
            if len(self._failures) >= MAX_TRACKED_KEYS and key not in self._failures:
                for existing in list(self._failures):
                    self._prune(existing, now)
                if len(self._failures) >= MAX_TRACKED_KEYS:
                    self._failures.pop(next(iter(self._failures)))
            self._failures[key].append(now)

    def reset(self, key: tuple[str, str] | None = None) -> None:
        with self._lock:
            if key is None:
                self._failures.clear()
            else:
                self._failures.pop(key, None)


login_throttle = LoginThrottle()
