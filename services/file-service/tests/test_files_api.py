"""Tests de integracion de file-service que no requieren MinIO (solo BD).

Las rutas de subida/descarga dependen de MinIO y quedan fuera de alcance
(se cubririan en E2E con el stack completo).
"""
import uuid

import httpx
import pytest
import respx

from app.config import settings

pytestmark = pytest.mark.integration

DOC_IDS_URL = f"{settings.DOCUMENT_SERVICE_URL}/internal/documents/ids-by-project"


def _seed_file(document_id, size_bytes, user="user-1", status="completed"):
    """Inserta un StoredFile + FileUpload (usa SessionLocal directo)."""
    from app.database import SessionLocal
    from app.models.file_upload import FileUpload
    from app.models.stored_file import StoredFile

    db = SessionLocal()
    try:
        stored = StoredFile(
            original_filename="f.txt",
            stored_filename=f"{uuid.uuid4()}.txt",
            mime_type="text/plain",
            size_bytes=size_bytes,
            storage_backend="minio",
            storage_path=f"path/{uuid.uuid4()}",
            uploader_user_id=user,
        )
        db.add(stored)
        db.flush()
        db.add(
            FileUpload(
                stored_file_id=stored.id,
                document_id=document_id,
                uploader_user_id=user,
                upload_status=status,
            )
        )
        db.commit()
    finally:
        db.close()


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


@respx.mock
def test_resumen_almacenamiento_por_proyecto(client):
    """El almacenamiento se acota al proyecto: cuenta solo los archivos de los
    documentos del proyecto (consultados al document-service). Un proyecto sin
    documentos suma 0; sin project_id se mantiene el total global del usuario."""
    _seed_file(document_id="doc-A", size_bytes=1000)
    _seed_file(document_id="doc-B", size_bytes=500)

    respx.get(DOC_IDS_URL, params={"project_id": "proj-con"}).mock(
        return_value=httpx.Response(200, json={"document_ids": ["doc-A"]})
    )
    respx.get(DOC_IDS_URL, params={"project_id": "proj-vacio"}).mock(
        return_value=httpx.Response(200, json={"document_ids": []})
    )

    # Sin project_id -> total global del usuario (1000 + 500).
    total = client.get("/files/storage/summary", headers={"X-User-Id": "user-1"})
    assert total.status_code == 200
    assert total.json()["used_bytes"] == 1500

    # Proyecto con doc-A -> solo 1000.
    con = client.get(
        "/files/storage/summary",
        headers={"X-User-Id": "user-1"},
        params={"project_id": "proj-con"},
    )
    assert con.status_code == 200, con.text
    assert con.json()["used_bytes"] == 1000

    # Proyecto sin documentos -> 0.
    vacio = client.get(
        "/files/storage/summary",
        headers={"X-User-Id": "user-1"},
        params={"project_id": "proj-vacio"},
    )
    assert vacio.status_code == 200
    assert vacio.json()["used_bytes"] == 0
