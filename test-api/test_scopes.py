import uuid

def test_scope_isolation(client):
    party_a = str(uuid.uuid4())
    party_b = str(uuid.uuid4())

    stmt_a = {
        "scope": {"type": "party", "partyId": party_a},
        "kind": "narration",
        "authorType": "agent",
        "authorId": "test-agent",
        "content": "Secret from party A only",
    }
    r = client.post("/api/statements", json=stmt_a)
    assert r.status_code == 201
    id_a = r.json()["id"]

    stmt_b = {
        "scope": {"type": "party", "partyId": party_b},
        "kind": "narration",
        "authorType": "agent",
        "authorId": "test-agent",
        "content": "Secret from party B only",
    }
    r = client.post("/api/statements", json=stmt_b)
    assert r.status_code == 201
    id_b = r.json()["id"]

    r_a = client.get(f"/api/statements?scope_type=party&scope_key={party_a}")
    assert r_a.status_code == 200
    stmts_a = r_a.json()["statements"]
    ids_a = [s["id"] for s in stmts_a]
    assert id_a in ids_a
    assert id_b not in ids_a

    r_b = client.get(f"/api/statements?scope_type=party&scope_key={party_b}")
    assert r_b.status_code == 200
    stmts_b = r_b.json()["statements"]
    ids_b = [s["id"] for s in stmts_b]
    assert id_b in ids_b
    assert id_a not in ids_b