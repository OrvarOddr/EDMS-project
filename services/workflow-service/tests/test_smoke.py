import pytest

from app.routers.documents import (
    STATES_REQUIRING_COMMENT,
    VALID_STATES,
    WORKFLOW_TRANSITIONS,
)


@pytest.mark.unit
def test_estado_archivado_no_tiene_transiciones():
    assert WORKFLOW_TRANSITIONS["archivado"] == set()


@pytest.mark.unit
def test_observado_y_rechazado_exigen_comentario():
    assert STATES_REQUIRING_COMMENT == frozenset({"observado", "rechazado"})
    assert STATES_REQUIRING_COMMENT <= VALID_STATES
