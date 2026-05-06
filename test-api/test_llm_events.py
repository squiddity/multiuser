"""
Tests for the LLM telemetry SSE endpoint (GET /llm-events).

Verifies:
- SSE response format (text/event-stream)
- Initial connection with ok comment
- Query-parameter compatibility for filter/replay options
"""


def _assert_sse_handshake(response):
    assert response.status_code == 200
    assert response.headers.get("content-type") == "text/event-stream"
    assert response.headers.get("cache-control") == "no-cache"

    lines = response.iter_lines()
    for _ in range(10):
        if next(lines) == ":ok":
            return
    assert False, "expected initial :ok comment"


def test_llm_events_returns_event_stream(client):
    """SSE endpoint returns text/event-stream content type."""
    with client.stream("GET", "/llm-events") as response:
        _assert_sse_handshake(response)


def test_llm_events_with_filter(client):
    """SSE endpoint accepts roomId filter parameter."""
    with client.stream("GET", "/llm-events?roomId=11111111-1111-1111-1111-111111111111") as response:
        _assert_sse_handshake(response)


def test_llm_events_with_caller_filter(client):
    """SSE endpoint accepts caller filter parameter."""
    with client.stream("GET", "/llm-events?caller=narrator.compose") as response:
        _assert_sse_handshake(response)


def test_llm_events_with_replay(client):
    """SSE endpoint accepts replay parameter."""
    with client.stream("GET", "/llm-events?replay=1") as response:
        _assert_sse_handshake(response)
