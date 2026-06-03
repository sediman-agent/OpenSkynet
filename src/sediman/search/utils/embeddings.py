"""Embedding utilities and provider management.

This module provides utilities for working with embeddings,
including provider abstraction and batch processing.
"""

from __future__ import annotations

from typing import Any

from structlog import get_logger

from ..config import EMBEDDING_DIMENSION, EMBEDDING_MODEL, EMBEDDING_PROVIDER

logger = get_logger()


class EmbeddingProvider:
    """Abstraction over different embedding providers.

    This wrapper provides a consistent interface for embedding generation
    regardless of the underlying provider (OpenAI, FastEmbed, etc.).
    """

    def __init__(
        self,
        provider: str | None = None,
        model: str | None = None,
        expected_dimension: int | None = None,
    ) -> None:
        """Initialize embedding provider.

        Args:
            provider: Provider name (default from config)
            model: Model name (default from config)
            expected_dimension: Expected vector dimension for validation
        """
        self.provider_name = provider or EMBEDDING_PROVIDER
        self.model_name = model or EMBEDDING_MODEL
        self.expected_dimension = expected_dimension or EMBEDDING_DIMENSION
        self._provider: Any = None
        self._dimension: int | None = None

    @property
    def provider(self) -> Any:
        """Get underlying provider instance."""
        if self._provider is None:
            self._provider = self._create_provider()
        return self._provider

    @property
    def dimension(self) -> int:
        """Get embedding dimension."""
        if self._dimension is None:
            # Try to get dimension from provider
            if hasattr(self.provider, "dimension"):
                self._dimension = self.provider.dimension
            else:
                self._dimension = self.expected_dimension
        return self._dimension

    def _create_provider(self) -> Any:
        """Create embedding provider instance.

        Returns:
            Provider instance (OpenAI, FastEmbed, etc.)
        """
        # Try FastEmbed first (local, fast)
        if self.provider_name in ("auto", "fastembed"):
            try:
                from sediman.memory.embeddings import FastEmbedProvider

                provider = FastEmbedProvider(model=self.model_name)
                if self._validate_dimension(provider):
                    logger.info("embedding_provider_fastembed", model=self.model_name)
                    return provider
            except Exception as e:
                logger.debug("embedding_provider_fastembed_failed", error=str(e))

        # Try OpenAI
        if self.provider_name in ("auto", "openai"):
            try:
                from sediman.memory.embeddings import OpenAIEmbeddingProvider

                provider = OpenAIEmbeddingProvider(model=self.model_name)
                if self._validate_dimension(provider):
                    logger.info("embedding_provider_openai", model=self.model_name)
                    return provider
            except Exception as e:
                logger.debug("embedding_provider_openai_failed", error=str(e))

        # Fallback to any available provider
        try:
            from sediman.memory.embeddings import create_embedding_provider

            provider = create_embedding_provider()
            logger.info("embedding_provider_fallback", name=provider.name)
            return provider
        except Exception as e:
            logger.warning("embedding_provider_unavailable", error=str(e))
            raise RuntimeError(f"No embedding provider available: {e}") from e

    def _validate_dimension(self, provider: Any) -> bool:
        """Validate provider dimension matches expected.

        Args:
            provider: Provider instance to validate

        Returns:
            True if dimension matches or validation not possible
        """
        if hasattr(provider, "dimension"):
            if provider.dimension != self.expected_dimension:
                logger.warning(
                    "embedding_provider_dimension_mismatch",
                    provider_dim=provider.dimension,
                    expected=self.expected_dimension,
                )
                return False
        return True

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for texts.

        Args:
            texts: List of text strings to embed

        Returns:
            List of embedding vectors
        """
        try:
            if hasattr(self.provider, "embed"):
                return await self.provider.embed(texts)
            else:
                logger.warning("embedding_provider_no_embed_method")
                return []
        except Exception as e:
            logger.error("embedding_failed", error=str(e))
            raise


async def batch_embed(
    texts: list[str],
    batch_size: int = 32,
    **kwargs: Any,
) -> list[list[float]]:
    """Generate embeddings for texts in batches.

    Args:
        texts: List of text strings to embed
        batch_size: Number of texts per batch
        **kwargs: Additional arguments for EmbeddingProvider

    Returns:
        List of embedding vectors
    """
    provider = EmbeddingProvider(**kwargs)

    results = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        embeddings = await provider.embed(batch)
        results.extend(embeddings)

    return results


__all__ = ["EmbeddingProvider", "batch_embed"]
