import time
from collections import defaultdict
from typing import Dict, List
from fastapi import Request, HTTPException, status

# Sliding-window IP request tracker: { "key": [timestamp1, timestamp2, ...] }
_ip_buckets: Dict[str, List[float]] = defaultdict(list)

def check_ip_rate_limit(
    request: Request,
    key_prefix: str,
    max_requests: int = 20,
    window_seconds: int = 60
):
    """
    Simple, robust sliding-window in-memory rate limiter based on client IP.
    """
    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or request.client.host
        if request.client
        else "127.0.0.1"
    )
    bucket_key = f"{key_prefix}:{client_ip}"
    now = time.time()

    # Clean old requests outside the window
    cutoff = now - window_seconds
    _ip_buckets[bucket_key] = [t for t in _ip_buckets[bucket_key] if t > cutoff]

    if len(_ip_buckets[bucket_key]) >= max_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests from this device. Please slow down and try again shortly."
        )

    _ip_buckets[bucket_key].append(now)

def clear_rate_limits():
    """Clear all rate limits (useful for testing)."""
    _ip_buckets.clear()
