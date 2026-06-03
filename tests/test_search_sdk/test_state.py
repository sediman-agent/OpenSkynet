"""Tests for state subsystem."""

import json
import pytest
import tempfile
import shutil

from sediman.search.sdk.state import StatePrimitives


class TestStatePrimitives:
    @classmethod
    def setup_class(cls):
        # Use temp directory for isolated tests
        cls._temp_dir = tempfile.mkdtemp()

    @classmethod
    def teardown_class(cls):
        # Clean up temp directory
        if hasattr(cls, '_temp_dir') and cls._temp_dir:
            shutil.rmtree(cls._temp_dir, ignore_errors=True)

    def test_state_init(self):
        state = StatePrimitives()
        assert state._state_dir.exists()

    def test_save_and_load(self):
        state = StatePrimitives()
        data = {"test": "data", "items": [1, 2, 3]}

        state.save("test_state", data)
        loaded = state.load("test_state")

        assert loaded == data
        # Clean up
        state.delete("test_state")

    def test_load_nonexistent(self):
        state = StatePrimitives()
        result = state.load("nonexistent")
        assert result is None

    def test_list_empty(self):
        state = StatePrimitives()
        states = state.list()
        assert states == []

    def test_list_with_states(self):
        state = StatePrimitives()
        state.save("state1", {"data": 1})
        state.save("state2", {"data": 2})

        states = state.list()
        assert set(states) == {"state1", "state2"}

        # Clean up
        state.delete("state1")
        state.delete("state2")

    def test_delete_state(self):
        state = StatePrimitives()
        state.save("to_delete", {"data": 1})

        assert state.delete("to_delete") is True
        assert state.delete("nonexistent") is False

    def test_clear_all_states(self):
        state = StatePrimitives()
        state.save("s1", {"data": 1})
        state.save("s2", {"data": 2})

        count = state.clear()
        assert count >= 2  # At least our 2 states
        assert state.list() == []

    def test_save_invalid_json(self):
        state = StatePrimitives()
        # Non-serializable data should raise ValueError
        class CustomClass:
            pass

        with pytest.raises(ValueError):
            state.save("invalid", CustomClass())
