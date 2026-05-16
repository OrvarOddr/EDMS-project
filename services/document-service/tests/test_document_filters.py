from types import SimpleNamespace

from app.routers.versions import _filter_visible_documents, _matches_workflow_filters


def _document(document_id: str, owner_user_id: str = "owner", created_by_user_id: str = "creator"):
    return SimpleNamespace(
        id=document_id,
        owner_user_id=owner_user_id,
        created_by_user_id=created_by_user_id,
        archived_at=None,
    )


def test_visible_documents_include_owner_creator_and_workflow_assignments():
    actor = "user-1"
    documents = [
        _document("owned", owner_user_id=actor),
        _document("created", created_by_user_id=actor),
        _document("assigned", owner_user_id="other", created_by_user_id="other"),
        _document("hidden", owner_user_id="other", created_by_user_id="other"),
    ]
    workflow_map = {
        "assigned": {"assigned_user_ids": [actor], "assignee_user_id": "other"},
        "hidden": {"assigned_user_ids": ["someone-else"], "assignee_user_id": "someone-else"},
    }

    visible = _filter_visible_documents(documents, workflow_map, actor)

    assert [document.id for document in visible] == ["owned", "created", "assigned"]


def test_workflow_filters_are_combined_after_visibility():
    actor = "user-1"
    documents = [
        _document("draft", owner_user_id=actor),
        _document("matching", owner_user_id="other", created_by_user_id="other"),
        _document("wrong-state", owner_user_id="other", created_by_user_id="other"),
        _document("wrong-assignee", owner_user_id="other", created_by_user_id="other"),
    ]
    workflow_map = {
        "draft": {
            "state_code": "borrador",
            "assignee_user_id": actor,
            "assigned_user_ids": [actor],
        },
        "matching": {
            "state_code": "en_revision",
            "assignee_user_id": "lead-1",
            "assigned_user_ids": [actor],
        },
        "wrong-state": {
            "state_code": "aprobado",
            "assignee_user_id": "lead-1",
            "assigned_user_ids": [actor],
        },
        "wrong-assignee": {
            "state_code": "en_revision",
            "assignee_user_id": "lead-2",
            "assigned_user_ids": [actor],
        },
    }

    visible = _filter_visible_documents(
        documents,
        workflow_map,
        actor,
        state_filter="en_revision",
        assignee_filter="lead-1",
        assigned_filter=actor,
    )

    assert [document.id for document in visible] == ["matching"]


def test_assigned_filter_requires_workflow_assignment():
    actor = "user-1"
    documents = [
        _document("owner-without-assignment", owner_user_id=actor),
        _document("assigned", owner_user_id="other", created_by_user_id="other"),
    ]
    workflow_map = {
        "owner-without-assignment": {"assigned_user_ids": []},
        "assigned": {"assigned_user_ids": [actor]},
    }

    visible = _filter_visible_documents(documents, workflow_map, actor, assigned_filter=actor)

    assert [document.id for document in visible] == ["assigned"]


def test_empty_workflow_filters_match_everything():
    assert _matches_workflow_filters(None)
    assert _matches_workflow_filters({})
