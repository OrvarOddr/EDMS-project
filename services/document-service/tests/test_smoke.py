import pytest

from app.routers.versions import _filter_visible_documents, _matches_workflow_filters


@pytest.mark.unit
def test_simbolos_importables():
    assert callable(_filter_visible_documents)
    assert callable(_matches_workflow_filters)
