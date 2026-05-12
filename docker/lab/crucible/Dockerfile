# Isolated Crucible CLI for Security Gate lab compose (not an official upstream image).
# Crucible is distributed on PyPI as crucible-security; see https://pypi.org/project/crucible-security/
FROM python:3.12-slim-bookworm

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN pip install --no-cache-dir "crucible-security>=0.1.0,<1"

WORKDIR /workspace

# Keep the container alive so `docker compose exec crucible-lab crucible ...` works like Semgrep.
CMD ["sleep", "infinity"]
