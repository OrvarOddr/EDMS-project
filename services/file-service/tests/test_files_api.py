"""Tests de integracion de file-service que no requieren MinIO (solo BD).

Las rutas de subida/descarga dependen de MinIO y quedan fuera de alcance
(se cubririan en E2E con el stack completo).
"""
import pytest

pytestmark = pytest.mark.integration


def test_listar_sin_asignar_requiere_usuario(client):
    assert client.get("/files/unassigned").status_code == 401


def test_listar_papelera_requiere_usuario(client):
    assert client.get("/files/trash").status_code == 401


def test_resumen_almacenamiento_requiere_usuario(client):
    assert client.get("/files/storage/summary").status_code == 401


def test_listar_sin_asignar_vacio_para_usuario(client):
    r = client.get("/files/unassigned", headers={"X-User-Id": "user-1"})
    assert r.status_code == 200
    assert r.json() == []


def test_resumen_almacenamiento_inicial(client):
    r = client.get("/files/storage/summary", headers={"X-User-Id": "user-1"})
    assert r.status_code == 200
