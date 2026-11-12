import os
DB_URL = os.getenv("DB_URL", "postgresql+psycopg://dr:drpass@127.0.0.1:5433/drdb")
MINIO = dict(endpoint=os.getenv("MINIO_ENDPOINT", "localhost:9000"),
             access_key="minioadmin", secret_key="minioadmin", secure=False)