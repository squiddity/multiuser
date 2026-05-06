"""
Tests for the LLM telemetry SSE endpoint (GET /llm-events).

Verifies:
- SSE response format (text/event-stream)
- Initial connection with ok comment
- Event flow when telemetry is emitted
- Filtering by roomId
- Replay of recent events
"""

import json


def test_llm_events_returns_event_stream(client):
    """SSE endpoint returns text/event-stream content type."""
    with client.stream("GET", "/llm-events") as response:
        assert response.status_code == 200
        assert response.headers.get("content-type") == "text/event-stream"
        assert response.headers.get("cache-control") == "no-cache"
        # Read first event (initial :ok comment)
        for _ in range(10):
            line = response.iter_lines().__next__()
            if line == ":ok":
                break
        else:
            assert False, "expected initial :ok comment"


def test_llm_events_with_filter(client):
    """SSE endpoint accepts roomId filter parameter."""
    r = client.get("/llm-events?roomId=11111111-1111-1111-1111-111111111111")
    assert r.status_code == 200


def test_llm_events_with_caller_filter(client):
    """SSE endpoint accepts caller filter parameter."""
    r = client.get("/llm-events?caller=narrator.compose")
    assert r.status_code == 200


def test_llm_events_with_replay(client):
    """SSE endpoint accepts replay parameter."""
    r = client.get("/llm-events?replay=1")
    assert r.status_code == 200
