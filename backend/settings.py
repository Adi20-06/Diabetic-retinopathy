import os
DB_URL = os.getenv("DB_URL", "postgresql+psycopg://dr:drpass@127.0.0.1:5433/drdb")
MINIO = dict(endpoint=os.getenv("MINIO_ENDPOINT", "localhost:9000"),
             access_key="minioadmin", secret_key="minioadmin", secure=False)
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me-before-any-real-use-0123456789")
DEMO_OTP = os.getenv("DEMO_OTP", "123456")      # replaced by SMS in a real deployment
CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]