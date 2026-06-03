"""NumPy-based storage for external pre-computed embeddings.

This module provides storage for embeddings that are pre-computed and stored
in NumPy .npz format, used for external skill embeddings.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

from structlog import get_logger

from ..config import (
    EXTERNAL_EMBEDDINGS_META_PATH,
    EXTERNAL_EMBEDDINGS_PATH,
    EXTERNAL_INDEX_PATH,
)

logger = get_logger()


@dataclass
class ExternalEmbeddingMetadata:
    """Metadata for external embeddings.

    Attributes:
        model: Name of the model used to generate embeddings
        provider: Provider name (e.g., "fastembed")
        dimension: Vector dimension
        generated_at: When embeddings were generated
        name_to_idx: Mapping from skill names to vector indices
        hashes: Content hashes for change detection
    """
    model: str = "BAAI/bge-small-en-v1.5"
    provider: str = "fastembed"
    dimension: int = 384
    generated_at: str = ""
    name_to_idx: dict[str, int] | None = None
    hashes: dict[str, str] | None = None

    @classmethod
    def load(cls, path: Path) -> ExternalEmbeddingMetadata:
        """Load metadata from JSON file.

        Args:
            path: Path to metadata JSON file

        Returns:
            ExternalEmbeddingMetadata instance
        """
        if not path.exists():
            logger.warning("external_embeddings_metadata_not_found", path=str(path))
            return cls()

        try:
            data = json.loads(path.read_text())
            return cls(
                model=data.get("model", "BAAI/bge-small-en-v1.5"),
                provider=data.get("provider", "fastembed"),
                dimension=data.get("dimension", 384),
                generated_at=data.get("generated_at", ""),
                name_to_idx=data.get("name_to_idx", {}),
                hashes=data.get("hashes", {}),
            )
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("external_embeddings_metadata_invalid", path=str(path), error=str(e))
            return cls()


class ExternalEmbeddingStorage:
    """Storage for external pre-computed embeddings in NumPy format.

    This storage handles embeddings that are pre-computed and committed
    to the repository, typically for external skills.

    Example:
        ```python
        storage = ExternalEmbeddingStorage()
        await storage.load()

        vectors = storage.get_vectors()
        metadata = storage.get_metadata()
        ```
    """

    def __init__(
        self,
        embeddings_path: Path | None = None,
        metadata_path: Path | None = None,
        index_path: Path | None = None,
    ) -> None:
        """Initialize external embedding storage.

        Args:
            embeddings_path: Path to .npz embeddings file
            metadata_path: Path to metadata JSON file
            index_path: Path to skills index JSON file
        """
        self.embeddings_path = embeddings_path or EXTERNAL_EMBEDDINGS_PATH
        self.metadata_path = metadata_path or EXTERNAL_EMBEDDINGS_META_PATH
        self.index_path = index_path or EXTERNAL_INDEX_PATH

        self._metadata: ExternalEmbeddingMetadata | None = None
        self._vectors: list[list[float]] = []
        self._skills: list[dict[str, Any]] = []
        self._loaded = False

    async def load(self) -> None:
        """Load embeddings and metadata from disk.

        This loads both the NumPy embeddings file and the metadata.
        If files don't exist, the storage remains empty.
        """
        if self._loaded:
            return

        # Load metadata first
        self._metadata = ExternalEmbeddingMetadata.load(self.metadata_path)

        # Load index
        self._skills = self._load_index()

        # Load embeddings
        if self.embeddings_path.exists():
            self._vectors = self._load_embeddings()
            logger.info(
                "external_embeddings_loaded",
                skills=len(self._skills),
                vectors=len(self._vectors),
                dim=self._metadata.dimension if self._metadata else 0,
            )
        else:
            logger.debug("external_embeddings_not_found", path=str(self.embeddings_path))

        self._loaded = True

    def _load_index(self) -> list[dict[str, Any]]:
        """Load skills index from JSON file."""
        if not self.index_path.exists():
            logger.debug("external_index_not_found", path=str(self.index_path))
            return []

        try:
            data = json.loads(self.index_path.read_text())
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("external_index_read_failed", path=str(self.index_path), error=str(e))
            return []

        # Handle both list and dict formats
        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            return data.get("skills", [])
        else:
            return []

    def _load_embeddings(self) -> list[list[float]]:
        """Load embeddings from NumPy .npz file."""
        try:
            import numpy as np

            data = np.load(str(self.embeddings_path), allow_pickle=False)

            if "embeddings" in data:
                matrix = data["embeddings"]
                return [row.tolist() for row in matrix]
            else:
                arr = data.get("arr_0")
                if arr is not None:
                    return [row.tolist() for row in arr]
                else:
                    logger.warning("external_embeddings_no_data", path=str(self.embeddings_path))
                    return []
        except ImportError:
            logger.warning("external_embeddings_numpy_not_available")
            return []
        except Exception as e:
            logger.warning("external_embeddings_load_failed", path=str(self.embeddings_path), error=str(e))
            return []

    def get_metadata(self) -> ExternalEmbeddingMetadata:
        """Get embedding metadata.

        Returns:
            ExternalEmbeddingMetadata instance
        """
        return self._metadata or ExternalEmbeddingMetadata()

    def get_vectors(self) -> list[list[float]]:
        """Get all embedding vectors.

        Returns:
            List of embedding vectors
        """
        return self._vectors

    def get_skills(self) -> list[dict[str, Any]]:
        """Get all skill metadata.

        Returns:
            List of skill dictionaries
        """
        return self._skills

    def get_vector(self, index: int) -> list[float] | None:
        """Get a single vector by index.

        Args:
            index: Vector index

        Returns:
            Vector at index, or None if index out of bounds
        """
        if 0 <= index < len(self._vectors):
            return self._vectors[index]
        return None

    def get_skill_index(self, name: str) -> int | None:
        """Get skill index by name.

        Args:
            name: Skill name

        Returns:
            Index of skill, or None if not found
        """
        if self._metadata and self._metadata.name_to_idx:
            return self._metadata.name_to_idx.get(name)
        return None

    def is_loaded(self) -> bool:
        """Check if embeddings have been loaded.

        Returns:
            True if loaded, False otherwise
        """
        return self._loaded

    def get_dimension(self) -> int:
        """Get embedding dimension.

        Returns:
            Vector dimension, or 0 if not loaded
        """
        if self._metadata:
            return self._metadata.dimension
        if self._vectors:
            return len(self._vectors[0]) if self._vectors else 0
        return 0


__all__ = ["ExternalEmbeddingStorage", "ExternalEmbeddingMetadata"]
