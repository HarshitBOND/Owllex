"""Infrastructure for the self-hosted RAG stack.

Storage, configuration and the composition root. Nothing in this package imports
from ``rag.app`` -- the dependency runs one way, so the stores can be built and
tested without pulling in the ingest or retrieval logic.

Start at :mod:`rag.core.services`, which wires everything together.
"""
