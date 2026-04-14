import uuid

def test_statement_create_and_retrieve(client):
    statement = {
        "scope": {"type": "world"},
        "kind": "narration",
        "authorType": "agent",
        "authorId": "test-agent",
        "content": "The world is vast and mysterious.",
    }
    r = client.post("/api/statements", json=statement)
    assert r.status_code == 201
    body = r.json()
    assert body["id"]
    assert body["scope"] == {"type": "world"}
    assert body["kind"] == "narration"
    assert body["authorType"] == "agent"
    assert body["content"] == "The world is vast and mysterious."

    r2 = client.get(f"/api/statements/{body['id']}")
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2["id"] == body["id"]
    assert body2["content"] == body["content"]

def test_statement_create_with_party_scope(client):
    party_id = str(uuid.uuid4())
    statement = {
        "scope": {"type": "party", "partyId": party_id},
        "kind": "dialogue",
        "authorType": "user",
        "authorId": "test-user",
        "content": "I draw my sword!",
    }
    r = client.post("/api/statements", json=statement)
    assert r.status_code == 201
    body = r.json()
    assert body["scope"] == {"type": "party", "partyId": party_id}

def test_statement_get_not_found(client):
    r = client.get(f"/api/statements/{str(uuid.uuid4())}")
    assert r.status_code == 404
    assert r.json()["error"] == "not found"

def test_statement_list_by_scope(client):
    party_id = str(uuid.uuid4())
    for i in range(3):
        statement = {
            "scope": {"type": "party", "partyId": party_id},
            "kind": "narration",
            "authorType": "agent",
            "authorId": "test-agent",
            "content": f"Message {i}",
        }
        r = client.post("/api/statements", json=statement)
        assert r.status_code == 201

    r = client.get(f"/api/statements?scope_type=party&scope_key={party_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 3
    assert len(body["statements"]) >= 3

def test_statement_list_requires_scope_type(client):
    r = client.get("/api/statements")
    assert r.status_code == 400
    assert "scope_type" in r.json()["error"]

def test_statement_create_invalid_body(client):
    r = client.post("/api/statements", json={"foo": "bar"})
    assert r.status_code == 400
    assert "error" in r.json()