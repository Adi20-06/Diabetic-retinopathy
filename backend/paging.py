import time
from fastapi import Query, Response

class Page:
    """Use as  pg: Page = Depends()  in a list endpoint. Adds ?limit= and ?offset= and an X-Total-Count header."""
    def __init__(self, response: Response, limit: int = Query(300, ge=1, le=500), offset: int = Query(0, ge=0)):
        self.response, self.limit, self.offset = response, limit, offset
    def apply(self, qs):
        self.response.headers["X-Total-Count"] = str(qs.order_by(None).count())
        return qs.offset(self.offset).limit(self.limit)

_cache: dict = {}
def cached(key: str, seconds: int, fn):
    """Remember fn()'s answer for a short time (per process). Used for the analytics dashboard."""
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < seconds: return hit[1]
    val = fn(); _cache[key] = (time.time(), val)
    if len(_cache) > 500: _cache.clear()
    return val

def clear_cache(): _cache.clear()