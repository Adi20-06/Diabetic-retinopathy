import os
DB_URL = os.getenv("DB_URL", "postgresql+psycopg://dr:drpass@localhost:5432/drdb")
MINIO = dict(endpoint=os.getenv("MINIO_ENDPOINT", "localhost:9000"),
             access_key="minioadmin", secret_key="minioadmin", secure=False)