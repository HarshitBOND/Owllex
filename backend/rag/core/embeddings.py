"""Local embeddings. No API calls, no keys, no per-token billing.

Replaces OpenAI ``text-embedding-3-small`` with Qwen3-Embedding running in this
process. Two things about that swap are worth stating plainly, because both have
bitten deployments of this size:

* **The model is the memory budget.** Qwen3-Embedding-8B is ~16GB in bfloat16.
  It fits a 32GB box alongside FAISS and the API, but not comfortably alongside
  a large flat index. ``EMBED_MODEL`` accepts the 0.6B and 4B siblings, which
  are the right answer on a smaller host; the code path is identical.
* **The index is the other half of the budget.** Qwen3 emits 4096 dimensions but
  is trained with Matryoshka representation learning, so a truncated-and-
  renormalised prefix is a valid embedding. ``EMBED_DIM`` (default 1024) is what
  keeps a multi-million-chunk flat index inside RAM.

Changing ``EMBED_MODEL`` or ``EMBED_DIM`` invalidates every stored vector --
the whole corpus has to be re-embedded. :func:`embedding_signature` is written
into SQLite so a mismatch is caught at startup instead of silently returning
nonsense neighbours.
"""

from __future__ import annotations

import logging
import threading
import zlib
from typing import Protocol, runtime_checkable

import numpy as np

from .config import RagConfig

logger = logging.getLogger("ravenslaw.rag.embeddings")

# Short names the config accepts, mapped to their Hugging Face ids.
_MODEL_ALIASES = {
    "qwen3-embedding-8b": "Qwen/Qwen3-Embedding-8B",
    "qwen3-embedding-4b": "Qwen/Qwen3-Embedding-4B",
    "qwen3-embedding-0.6b": "Qwen/Qwen3-Embedding-0.6B",
}

# Selects the offline test backend instead of a real model. Never use in production.
DETERMINISTIC_MODEL = "deterministic-test"


@runtime_checkable
class Embedder(Protocol):
    """What the ingest and retrieval paths depend on.

    A protocol rather than a concrete class so the pipeline can be constructed
    against a stub in tests without importing torch.
    """

    @property
    def dimension(self) -> int: ...

    @property
    def model_name(self) -> str: ...

    def embed_documents(self, texts: list[str]) -> np.ndarray: ...

    def embed_query(self, text: str) -> np.ndarray: ...


def embedding_signature(model_name: str, dimension: int) -> str:
    """Identity of the vector space. Stored with the index; compared on boot."""
    return f"{model_name}@{dimension}"


def _normalize(matrix: np.ndarray) -> np.ndarray:
    """Unit-length rows, so FAISS inner product is cosine similarity."""
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    # A zero vector has no direction; leave it at zero rather than dividing by 0.
    np.maximum(norms, 1e-12, out=norms)
    return matrix / norms


class QwenEmbedder:
    """Qwen3-Embedding via sentence-transformers, loaded lazily on first use.

    Loading is deferred because the API process must be able to start, serve
    ``/health`` and answer non-RAG routes without paying a multi-GB model load
    first -- and because a host that only parses documents never needs it at all.
    """

    def __init__(self, config: RagConfig) -> None:
        self._config = config
        self._model_name = _MODEL_ALIASES.get(config.embed_model.lower(), config.embed_model)
        self._dimension = config.embed_dim
        self._model = None
        self._lock = threading.Lock()

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def _resolve_device(self) -> str:
        configured = self._config.embed_device.lower()
        if configured != "auto":
            return configured
        try:
            import torch

            if torch.cuda.is_available():
                return "cuda"
        except ImportError:
            pass
        return "cpu"

    def load(self):
        """Build the model. Safe to call concurrently; only the first call pays."""
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model

            device = self._resolve_device()
            # bfloat16 on CPU and float16 on GPU halve the resident size of an
            # 8B model, which is the difference between fitting this host and
            # not. Both are ample for embedding, which is not precision-bound.
            dtype = "float16" if device.startswith("cuda") else "bfloat16"
            logger.info("Loading embedding model %s on %s (%s)", self._model_name, device, dtype)

            model = self._build_model(device, dtype)
            model.max_seq_length = self._config.embed_max_seq_length

            native = model.get_sentence_embedding_dimension()
            if self._dimension > native:
                raise RuntimeError(
                    f"EMBED_DIM={self._dimension} exceeds {self._model_name}'s native "
                    f"dimension ({native}). Matryoshka truncation can only shorten."
                )
            self._model = model
            logger.info("Embedding model ready (native dim %d, using %d)", native, self._dimension)
            return self._model

    def _build_model(self, device: str, dtype: str):
        """Construct the SentenceTransformer, tolerating both dtype kwarg names.

        transformers renamed ``torch_dtype`` to ``dtype`` in v5. Both spellings
        are tried rather than pinning a version, because getting it wrong does
        not fail loudly -- an unrecognised model_kwarg can be dropped, and the
        model then loads in float32 at twice the resident size, which is the
        difference between fitting this host and being OOM-killed.
        """
        from sentence_transformers import SentenceTransformer

        common = {
            "device": device,
            "trust_remote_code": self._config.embed_trust_remote_code,
            # Qwen3-Embedding is trained with left padding; getting this wrong
            # degrades embeddings silently rather than erroring.
            "tokenizer_kwargs": {"padding_side": "left"},
        }
        errors: list[str] = []
        for key in ("dtype", "torch_dtype"):
            try:
                return SentenceTransformer(self._model_name, model_kwargs={key: dtype}, **common)
            except (TypeError, ValueError) as exc:
                errors.append(f"{key}: {exc}")

        logger.warning(
            "Could not set the model dtype (%s); loading in the default precision, "
            "which roughly doubles resident memory", "; ".join(errors),
        )
        return SentenceTransformer(self._model_name, **common)

    def _encode(self, texts: list[str], prompt_name: str | None) -> np.ndarray:
        model = self.load()
        kwargs = {
            "batch_size": self._config.embed_batch_size,
            "convert_to_numpy": True,
            "show_progress_bar": False,
            # Normalisation happens after truncation, below -- normalising a
            # 4096-dim vector and then slicing it does not give a unit vector.
            "normalize_embeddings": False,
        }
        if prompt_name:
            try:
                vectors = model.encode(texts, prompt_name=prompt_name, **kwargs)
            except (ValueError, KeyError):
                # Older checkpoints ship no named prompts; the plain encode is
                # still correct, just without the retrieval instruction prefix.
                vectors = model.encode(texts, **kwargs)
        else:
            vectors = model.encode(texts, **kwargs)

        vectors = np.asarray(vectors, dtype=np.float32)
        if vectors.ndim == 1:
            vectors = vectors.reshape(1, -1)
        vectors = vectors[:, : self._dimension]
        return _normalize(vectors) if self._config.embed_normalize else vectors

    def embed_documents(self, texts: list[str]) -> np.ndarray:
        """Embed chunks. Returns ``(len(texts), dimension)`` float32."""
        if not texts:
            return np.zeros((0, self._dimension), dtype=np.float32)
        return self._encode(list(texts), prompt_name=None)

    def embed_query(self, text: str) -> np.ndarray:
        """Embed a search query, with Qwen3's retrieval instruction prefix.

        Queries and documents are deliberately encoded differently: Qwen3 is
        trained with an instruction on the query side only, and skipping it
        measurably costs recall.
        """
        return self._encode([text], prompt_name="query")[0]


class DeterministicEmbedder:
    """Hash-based embeddings for tests and CI. **Not** semantically meaningful.

    Exists so the full ingest/search path -- SQLite ids, FAISS writes, filtered
    retrieval, resume behaviour -- can be tested offline, without downloading
    gigabytes of weights. Selected only by ``EMBED_MODEL=deterministic-test``.
    """

    def __init__(self, dimension: int = 64) -> None:
        self._dimension = dimension

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def model_name(self) -> str:
        return DETERMINISTIC_MODEL

    def _vector(self, text: str) -> np.ndarray:
        # A per-token bag-of-words projection: unrelated strings land apart and
        # a query sharing words with a chunk lands near it, which is all the
        # tests need from "similarity". crc32 rather than hash(): the builtin is
        # salted per process, so vectors written by an ingest run would not match
        # queries embedded by the API process.
        vector = np.zeros(self._dimension, dtype=np.float32)
        for token in text.lower().split():
            vector[zlib.crc32(token.encode()) % self._dimension] += 1.0
        return vector

    def embed_documents(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self._dimension), dtype=np.float32)
        return _normalize(np.vstack([self._vector(t) for t in texts]))

    def embed_query(self, text: str) -> np.ndarray:
        return _normalize(self._vector(text).reshape(1, -1))[0]


def build_embedder(config: RagConfig) -> Embedder:
    """Construct the configured embedder. The only place that decides which."""
    if config.embed_model.lower() == DETERMINISTIC_MODEL:
        logger.warning("Using the deterministic test embedder -- results are not semantic")
        return DeterministicEmbedder(dimension=config.embed_dim)
    return QwenEmbedder(config)
