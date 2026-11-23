import os
DB_URL = os.getenv("DB_URL", "postgresql+psycopg://dr:drpass@127.0.0.1:5433/drdb")
MINIO = dict(endpoint=os.getenv("MINIO_ENDPOINT", "localhost:9000"),
             access_key="minioadmin", secret_key="minioadmin", secure=False)
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me-before-any-real-use-0123456789")
JWT_SECRET_OLD = os.getenv("JWT_SECRET_OLD", "")      # set only during a rotation  
DEMO_OTP = os.getenv("DEMO_OTP", "123456")      # replaced by SMS in a real deployment
CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]

ENV = os.getenv("ENV", "dev")                       # set ENV=production when deployed
TOKEN_MINUTES = int(os.getenv("TOKEN_MINUTES", "30"))
if len(JWT_SECRET) < 32:
    if ENV == "production": raise RuntimeError("JWT_SECRET must be at least 32 characters in production")
    print("WARNING: JWT_SECRET is short or default. Generate one: python -c \"import secrets;print(secrets.token_urlsafe(48))\"")

CONSENT_VERSION = "1.0"          # bump when the consent wording changes

AI_MODE = os.getenv("AI_MODE", "embedded")     # embedded | queue | inline