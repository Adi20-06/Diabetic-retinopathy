import secrets_check as S
import secure_backup as B

def test_weak_secrets_are_flagged(tmp_path):
    f = tmp_path / ".env"
    f.write_text("JWT_SECRET=short\nDB_PASSWORD=postgres\nSTORAGE_SECRET_KEY=Xk29fj3kd9sKQ2mZpA81\nJWT_SECRET_OLD=\n")
    bad = " ".join(S.problems(f))
    assert "JWT_SECRET" in bad and "DB_PASSWORD" in bad and "STORAGE_SECRET_KEY" not in bad

def test_backup_encryption_roundtrip_and_wrong_password(tmp_path):
    src = tmp_path / "data.bin"; src.write_bytes(b"patient data" * 200_000)       # about 2.4 MB, so several chunks
    enc, back = tmp_path / "data.enc", tmp_path / "back.bin"
    B.encrypt_file(src, enc, "right-password-123")
    assert b"patient data" not in enc.read_bytes()
    B.decrypt_file(enc, back, "right-password-123")
    assert back.read_bytes() == src.read_bytes()
    import pytest
    from cryptography.exceptions import InvalidTag
    with pytest.raises(InvalidTag): B.decrypt_file(enc, tmp_path / "x.bin", "wrong-password")
    enc.write_bytes(enc.read_bytes()[:-1000])                                       # truncated file is detected
    with pytest.raises(Exception): B.decrypt_file(enc, tmp_path / "y.bin", "right-password-123")