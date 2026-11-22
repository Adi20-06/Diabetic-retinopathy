import io, datetime as dt
from minio import Minio
from settings import MINIO

cli = Minio(**MINIO)
def init():
    for b in ("fundus", "heatmaps"):
        if not cli.bucket_exists(b): cli.make_bucket(b)
def put(bucket, key, data: bytes, content_type="image/jpeg"):
    cli.put_object(bucket, key, io.BytesIO(data), len(data), content_type=content_type)

def get(bucket, key) -> bytes:
    r = cli.get_object(bucket, key)
    try:
        return r.read()
    finally:
        r.close(); r.release_conn()
        
def url(bucket, key):
    return cli.presigned_get_object(bucket, key, expires=dt.timedelta(minutes=15))

def remove(bucket, key):
    """Delete one object. MinIO does not complain if it is already gone, so this is safe to repeat."""
    cli.remove_object(bucket, key)