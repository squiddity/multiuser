import time

ADMIN_ROOM_ID = "22222222-2222-2222-2222-222222222222"


def poll_for_kind(client, scope_type, kind, scope_key=None, max_wait=4.0, interval=0.25):
    url = f"/api/statements?scope_type={scope_type}&kind={kind}"
    if scope_key:
        url += f"&scope_key={scope_key}"
    deadline = time.time() + max_wait
    while time.time() < deadline:
        r = client.get(url)
        if r.status_code == 200 and r.json().get("total", 0) > 0:
            return r.json()["statements"]
        time.sleep(interval)
    return []


def test_authoring_decision_promote_creates_world_canon(client):
    # 1. Create an open-question in governance scope
    oq_r = client.post(
        "/api/statements",
        json={
            "scope": {"type": "governance", "roomId": ADMIN_ROOM_ID},
            "kind": "open-question",
            "authorType": "agent",
            "authorId": "narrator",
            "content": "Subject: Dragon scar\n\nCandidate: Scar from a wyvern attack.",
            "fields": {
                "subject": "Dragon scar",
                "candidate": "Scar from a wyvern attack.",
                "routedTo": ADMIN_ROOM_ID,
                "blocks": [],
                "stage": "deferred",
            },
        },
    )
    assert oq_r.status_code == 201, oq_r.text
    oq_id = oq_r.json()["id"]

    # 2. Post an authoring-decision promoting it
    ad_r = client.post(
        "/api/statements",
        json={
            "scope": {"type": "governance", "roomId": ADMIN_ROOM_ID},
            "kind": "authoring-decision",
            "authorType": "user",
            "authorId": "gm-user",
            "content": "Decision: promote. Accepted as canon.",
            "fields": {
                "openQuestionId": oq_id,
                "decision": "promote",
                "rationale": "Accepted.",
            },
        },
    )
    assert ad_r.status_code == 201, ad_r.text
    ad_id = ad_r.json()["id"]

    # 3. Poll for the canon-reference that the worker should emit to world scope
    canon_rows = poll_for_kind(client, "world", "canon-reference", max_wait=4.0)
    matching = [r for r in canon_rows if ad_id in (r.get("sources") or [])]
    assert matching, (
        f"expected a canon-reference sourced from authoring-decision {ad_id} after promote; "
        f"got world canon-references: {canon_rows}"
    )
    assert matching[0]["content"] == "Scar from a wyvern attack."
