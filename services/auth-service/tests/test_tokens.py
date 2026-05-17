"""Tests unitarios de la capa de seguridad (sin BD ni red)."""
import pytest
from jose import JWTError

from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)


@pytest.mark.unit
def test_hash_password_no_es_reversible_y_es_salteado():
    h1 = hash_password("S3cret!")
    h2 = hash_password("S3cret!")
    assert h1 != "S3cret!"
    assert h1 != h2  # salt distinto
    assert verify_password("S3cret!", h1)
    assert verify_password("S3cret!", h2)
    assert not verify_password("otra", h1)


@pytest.mark.unit
def test_hash_token_es_sha256_estable():
    assert hash_token("abc") == hash_token("abc")
    assert hash_token("abc") != hash_token("abd")
    assert len(hash_token("abc")) == 64


@pytest.mark.unit
def test_access_token_contiene_claims_y_es_decodificable():
    token = create_access_token("u1", ["admin"], email="a@b.cl", status="active")
    payload = decode_token(token, expected_type="access")
    assert payload["sub"] == "u1"
    assert payload["roles"] == ["admin"]
    assert payload["email"] == "a@b.cl"
    assert payload["status"] == "active"
    assert payload["type"] == "access"


@pytest.mark.unit
def test_decode_token_rechaza_tipo_inesperado():
    refresh = create_refresh_token("u1")
    # decodifica bien como refresh
    assert decode_token(refresh, expected_type="refresh")["type"] == "refresh"
    # pero falla si se espera un access
    with pytest.raises(JWTError):
        decode_token(refresh, expected_type="access")


@pytest.mark.unit
def test_decode_token_rechaza_firma_invalida():
    token = create_access_token("u1", [], email="a@b.cl", status="active")
    with pytest.raises(JWTError):
        decode_token(token + "tampered", expected_type="access")
