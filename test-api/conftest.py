import pytest, httpx, os, time

BASE_URL = os.environ.get("API_URL", "http://localhost:3000")
MAX_WAIT = 30

@pytest.fixture(scope="session")
def wait_for_api():
    """Wait for the API to become healthy before running tests."""
    for _ in range(MAX_WAIT):
        try:
            r = httpx.get(f"{BASE_URL}/health", timeout=2)
            if r.status_code == 200 and r.json().get("ok"):
                break
        except (httpx.ConnectError, httpx.TimeoutException):
            pass
        time.sleep(1)
    else:
        pytest.exit(f"API at {BASE_URL} never became healthy after {MAX_WAIT}s")
    yield

@pytest.fixture(scope="session")
def client(wait_for_api):
    """Shared httpx client for all tests."""
    with httpx.Client(base_url=BASE_URL, timeout=10) as c:
        yield c