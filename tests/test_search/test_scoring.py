"""Tests for search scoring utilities."""

import pytest

from sediman.search.utils.scoring import (
    combined_score,
    cosine_similarity,
    keyword_score,
    normalize_vector,
    rank_results,
)


class TestNormalizeVector:
    def test_normalize_basic(self):
        vec = [3.0, 4.0]
        result = normalize_vector(vec)
        expected = [0.6, 0.8]  # sqrt(9+16) = 5
        assert all(abs(a - b) < 0.001 for a, b in zip(result, expected))

    def test_normalize_zero_vector(self):
        vec = [0.0, 0.0, 0.0]
        result = normalize_vector(vec)
        assert result == vec

    def test_normalize_unit_vector(self):
        vec = [1.0, 0.0]
        result = normalize_vector(vec)
        assert result == vec


class TestCosineSimilarity:
    def test_cosine_identical(self):
        vec1 = [1.0, 2.0, 3.0]
        vec2 = [1.0, 2.0, 3.0]
        result = cosine_similarity(vec1, vec2)
        assert result == pytest.approx(1.0)

    def test_cosine_orthogonal(self):
        vec1 = [1.0, 0.0]
        vec2 = [0.0, 1.0]
        result = cosine_similarity(vec1, vec2)
        assert result == pytest.approx(0.0)

    def test_cosine_opposite(self):
        vec1 = [1.0, 1.0]
        vec2 = [-1.0, -1.0]
        result = cosine_similarity(vec1, vec2)
        assert result == pytest.approx(-1.0)

    def test_cosine_dimension_mismatch(self):
        vec1 = [1.0, 2.0]
        vec2 = [1.0]
        result = cosine_similarity(vec1, vec2)
        assert result == 0.0

    def test_cosine_zero_vectors(self):
        vec1 = [0.0, 0.0]
        vec2 = [1.0, 2.0]
        result = cosine_similarity(vec1, vec2)
        assert result == 0.0


class TestKeywordScore:
    def test_keyword_score_exact_match(self):
        doc = {"name": "python", "description": "A programming language"}
        result = keyword_score("python", doc)
        assert result > 0

    def test_keyword_score_partial_match(self):
        doc = {"name": "python", "description": "Programming language"}
        result = keyword_score("python programming", doc)
        assert result > 0

    def test_keyword_score_no_match(self):
        doc = {"name": "javascript", "description": "A language"}
        result = keyword_score("python", doc)
        assert result == 0.0

    def test_keyword_score_with_keywords(self):
        doc = {
            "name": "skill",
            "description": "A test",
            "keywords": ["python", "programming"],
        }
        result = keyword_score("python", doc)
        assert result > 0

    def test_keyword_score_empty_query(self):
        doc = {"name": "test"}
        result = keyword_score("", doc)
        assert result == 0.0

    def test_keyword_score_case_insensitive(self):
        doc = {"name": "Python", "description": "Programming"}
        result = keyword_score("PYTHON", doc)
        assert result > 0


class TestCombinedScore:
    def test_combined_score_equal_weights(self):
        result = combined_score(0.8, 0.6, vector_weight=0.5)
        assert result == pytest.approx(0.7)

    def test_combined_score_vector_weighted(self):
        result = combined_score(0.8, 0.4, vector_weight=0.75)
        assert result == pytest.approx(0.7)

    def test_combined_score_keyword_weighted(self):
        result = combined_score(0.4, 0.8, vector_weight=0.25)
        assert result == pytest.approx(0.7)

    def test_combined_score_clamps_range(self):
        # Both scores should be 0-1, combined should also be 0-1
        result = combined_score(1.0, 1.0)
        assert result <= 1.0
        assert result >= 0.0


class TestRankResults:
    def test_rank_results_sorts_by_score(self):
        results = [
            (0.5, {"name": "c"}),
            (0.9, {"name": "a"}),
            (0.7, {"name": "b"}),
        ]
        ranked = rank_results(results, max_results=10)
        assert ranked[0][0] == 0.9
        assert ranked[1][0] == 0.7
        assert ranked[2][0] == 0.5

    def test_rank_results_limits_results(self):
        results = [
            (0.9, {"name": "a"}),
            (0.8, {"name": "b"}),
            (0.7, {"name": "c"}),
        ]
        ranked = rank_results(results, max_results=2)
        assert len(ranked) == 2
        assert ranked[0][0] == 0.9
        assert ranked[1][0] == 0.8

    def test_rank_results_filters_by_min_score(self):
        results = [
            (0.9, {"name": "a"}),
            (0.3, {"name": "b"}),
            (0.7, {"name": "c"}),
        ]
        ranked = rank_results(results, max_results=10, min_score=0.5)
        assert len(ranked) == 2
        assert all(score >= 0.5 for score, _ in ranked)

    def test_rank_results_empty(self):
        ranked = rank_results([], max_results=10)
        assert ranked == []

    def test_rank_results_all_below_min(self):
        results = [(0.1, {"name": "a"}), (0.2, {"name": "b"})]
        ranked = rank_results(results, max_results=10, min_score=0.5)
        assert ranked == []
