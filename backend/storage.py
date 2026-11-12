import io, datetime as dt
from minio import Minio
from settings import MINIO

cli = Minio(**MINIO)
def init():
    for b in ("fundus", "heatmaps"):
        if not cli.bucket_exists(b): cli.make_bucket(b)
def put(bucket, key, data: bytes):
    cli.put_object(bucket, key, io.BytesIO(data), len(data), content_type="image/jpeg")
def url(bucket, key):
    return cli.presigned_get_object(bucket, key, expires=dt.timedelta(minutes=15))