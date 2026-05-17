import pytest

from app.security import hash_password, verify_password


@pytest.mark.unit
def test_password_hash_roundtrip():
    hashed = hash_password("S3cret!")
    assert hashed != "S3cret!"
    assert verify_password("S3cret!", hashed)
    assert not verify_password("incorrecta", hashed)
