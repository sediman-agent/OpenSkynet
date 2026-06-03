"""Comprehensive tests for Lark, Slack, WeChat, and WhatsApp integrations.

This test suite covers the enhanced platform adapters with media support
and integration functionality.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch
from dataclasses import dataclass

import pytest

from sediman.gateway.events import MessageEvent
from sediman.gateway.runner import GatewayRunner
from sediman.integrations.lark.adapter import LarkAdapter
from sediman.integrations.slack.adapter import SlackAdapter
from sediman.integrations.wechat.adapter import WeChatAdapter
from sediman.integrations.whatsapp.adapter import WhatsAppAdapter


# =============================================================================
# Lark Integration Tests
# =============================================================================

class TestLarkAdapter:
    """Test Lark adapter functionality."""

    def test_adapter_creation(self):
        """Test creating LarkAdapter."""
        adapter = LarkAdapter()

        assert adapter.platform_name == "lark"
        assert not adapter.is_connected

    def test_adapter_connect_disconnect(self):
        """Test adapter connect/disconnect methods."""
        adapter = LarkAdapter()

        import asyncio

        async def test_connect_disconnect():
            await adapter.connect()
            assert adapter.is_connected
            await adapter.disconnect()
            assert not adapter.is_connected

        asyncio.run(test_connect_disconnect())

    def test_adapter_no_client_error(self):
        """Test error when client is not available."""
        adapter = LarkAdapter()

        import asyncio

        async def test_no_client():
            with pytest.raises(RuntimeError, match="client not available"):
                await adapter.send_message("open_123", "Hello!")

        asyncio.run(test_no_client())

    def test_deduplicator_initialization(self):
        """Test that deduplicator is initialized."""
        adapter = LarkAdapter()

        assert adapter._deduplicator is not None
        assert adapter._access_token is None

    def test_token_caching_on_disconnect(self):
        """Test that token is cleared on disconnect."""
        adapter = LarkAdapter()
        adapter._access_token = "test_token"
        adapter._token_expiry = 1234567890.0

        import asyncio

        async def test_disconnect_clears_token():
            await adapter.disconnect()
            assert adapter._access_token is None
            assert adapter._token_expiry is None

        asyncio.run(test_disconnect_clears_token())

    def test_duplicate_detection(self):
        """Test message deduplication."""
        adapter = LarkAdapter()

        # First call should not be duplicate
        assert not adapter.is_duplicate("msg_123")

        # Second call with same ID should be duplicate
        assert adapter.is_duplicate("msg_123")

    def test_set_credentials(self):
        """Test setting Lark credentials."""
        adapter = LarkAdapter()

        mock_client = MagicMock()
        adapter.set_credentials(mock_client, "app_123", "secret_456")

        assert adapter._http_client == mock_client
        assert adapter._app_id == "app_123"
        assert adapter._app_secret == "secret_456"

    def test_send_with_retry_stub(self):
        """Test that _send_with_retry is defined."""
        adapter = LarkAdapter()

        # Method should exist
        assert hasattr(adapter, "_send_with_retry")
        assert callable(getattr(adapter, "_send_with_retry"))

    def test_get_tenant_access_token_stub(self):
        """Test that _get_tenant_access_token is defined."""
        adapter = LarkAdapter()

        # Method should exist
        assert hasattr(adapter, "_get_tenant_access_token")
        assert callable(getattr(adapter, "_get_tenant_access_token"))

    def test_upload_image_stub(self):
        """Test that _upload_image is defined."""
        adapter = LarkAdapter()

        # Method should exist
        assert hasattr(adapter, "_upload_image")
        assert callable(getattr(adapter, "_upload_image"))

    def test_upload_video_stub(self):
        """Test that _upload_video is defined."""
        adapter = LarkAdapter()

        # Method should exist
        assert hasattr(adapter, "_upload_video")
        assert callable(getattr(adapter, "_upload_video"))

    def test_upload_file_stub(self):
        """Test that _upload_file is defined."""
        adapter = LarkAdapter()

        # Method should exist
        assert hasattr(adapter, "_upload_file")
        assert callable(getattr(adapter, "_upload_file"))

    def test_media_send_methods_exist(self):
        """Test that all media send methods are defined."""
        adapter = LarkAdapter()

        # Check media methods exist
        assert hasattr(adapter, "send_image")
        assert hasattr(adapter, "send_image_file")
        assert hasattr(adapter, "send_video")
        assert hasattr(adapter, "send_voice")
        assert hasattr(adapter, "send_document")
        assert hasattr(adapter, "send_typing")
        assert hasattr(adapter, "stop_typing")
        assert hasattr(adapter, "edit_message")
        assert hasattr(adapter, "delete_message")

    def test_send_typing_no_op(self):
        """Test send_typing is a no-op for Lark."""
        adapter = LarkAdapter()

        import asyncio

        async def test_typing():
            # Should not raise
            await adapter.send_typing("open_123")

        asyncio.run(test_typing())

    def test_stop_typing_no_op(self):
        """Test stop_typing is a no-op for Lark."""
        adapter = LarkAdapter()

        import asyncio

        async def test_stop_typing():
            # Should not raise
            await adapter.stop_typing("open_123")

        asyncio.run(test_stop_typing())


class TestLarkMessageEvent:
    """Test MessageEvent creation from Lark data."""

    def test_lark_basic_event_creation(self):
        """Test creating basic Lark message event."""
        lark_event = {
            "event": {
                "text": "Hello bot!",
                "sender": {
                    "sender_id": {"open_id": "ou_123"},
                    "sender_name": "TestUser"
                },
                "chat_id": "oc_456",
                "root_id": ""
            }
        }

        event = MessageEvent.from_lark(lark_event)

        assert event.platform == "lark"
        assert event.chat_id == "oc_456"
        assert event.user_id == "ou_123"
        assert event.user_name == "TestUser"
        assert event.text == "Hello bot!"
        assert event.chat_type == "private"

    def test_lark_group_message(self):
        """Test Lark group message (with root_id)."""
        lark_event = {
            "event": {
                "text": "Group message",
                "sender": {
                    "sender_id": {"open_id": "ou_123"},
                    "sender_name": "TestUser"
                },
                "chat_id": "oc_456",
                "root_id": "root_789"
            }
        }

        event = MessageEvent.from_lark(lark_event)

        assert event.chat_type == "group"

    def test_lark_command_detection(self):
        """Test command detection in Lark messages."""
        lark_event = {
            "event": {
                "text": "/help",
                "sender": {
                    "sender_id": {"open_id": "ou_123"},
                    "sender_name": "TestUser"
                },
                "chat_id": "oc_456",
                "root_id": ""
            }
        }

        event = MessageEvent.from_lark(lark_event)

        assert event.is_command == True
        assert event.command == "/help"

    def test_lark_rich_text_extraction(self):
        """Test text extraction from rich text structure."""
        lark_event = {
            "event": {
                "text": [
                    {"type": "text", "text": "Hello "},
                    {"type": "text", "text": "World"}
                ],
                "sender": {
                    "sender_id": {"open_id": "ou_123"},
                    "sender_name": "TestUser"
                },
                "chat_id": "oc_456",
                "root_id": ""
            }
        }

        event = MessageEvent.from_lark(lark_event)

        assert event.text == "Hello World"

    def test_lark_session_key_generation(self):
        """Test session key generation for Lark."""
        lark_event = {
            "event": {
                "text": "Test",
                "sender": {
                    "sender_id": {"open_id": "ou_123"},
                    "sender_name": "TestUser"
                },
                "chat_id": "oc_456",
                "root_id": ""
            }
        }

        event = MessageEvent.from_lark(lark_event)

        expected = "agent:main:lark:private:oc_456"
        assert event.session_key == expected


# =============================================================================
# Slack Integration Tests
# =============================================================================

class TestSlackAdapter:
    """Test Slack adapter functionality."""

    def test_adapter_creation(self):
        """Test creating SlackAdapter."""
        adapter = SlackAdapter()

        assert adapter.platform_name == "slack"
        assert not adapter.is_connected

    def test_adapter_connect_disconnect(self):
        """Test adapter connect/disconnect methods."""
        adapter = SlackAdapter()

        import asyncio

        async def test_connect_disconnect():
            await adapter.connect()
            assert adapter.is_connected
            await adapter.disconnect()
            assert not adapter.is_connected

        asyncio.run(test_connect_disconnect())

    def test_adapter_no_client_error(self):
        """Test error when client is not available."""
        adapter = SlackAdapter()

        import asyncio

        async def test_no_client():
            with pytest.raises(RuntimeError, match="client not available"):
                await adapter.send_message("C12345", "Hello!")

        asyncio.run(test_no_client())

    def test_media_send_methods_exist(self):
        """Test that all media send methods are defined."""
        adapter = SlackAdapter()

        # Check media methods exist
        assert hasattr(adapter, "send_image")
        assert hasattr(adapter, "send_image_file")
        assert hasattr(adapter, "send_video")
        assert hasattr(adapter, "send_voice")
        assert hasattr(adapter, "send_document")
        assert hasattr(adapter, "send_typing")
        assert hasattr(adapter, "stop_typing")
        assert hasattr(adapter, "edit_message")
        assert hasattr(adapter, "delete_message")

    def test_send_typing_stub(self):
        """Test send_typing method exists."""
        adapter = SlackAdapter()

        # Method should exist
        assert hasattr(adapter, "send_typing")
        assert callable(getattr(adapter, "send_typing"))

    def test_thread_tracker_initialization(self):
        """Test that thread tracker is initialized."""
        adapter = SlackAdapter()

        assert adapter._thread_tracker is not None
        assert adapter._typing_tasks is not None


class TestSlackMessageEvent:
    """Test MessageEvent creation from Slack data."""

    def test_slack_basic_event_creation(self):
        """Test creating basic Slack message event."""
        slack_event = {
            "text": "Hello bot!",
            "channel": "C12345",
            "user": "U67890"
        }

        event = MessageEvent.from_slack(slack_event)

        assert event.platform == "slack"
        assert event.chat_id == "C12345"
        assert event.user_id == "U67890"
        assert event.text == "Hello bot!"

    def test_slack_channel_type_detection(self):
        """Test channel type detection (channel vs DM)."""
        # Channel (starts with C or G is group)
        channel_event = {
            "text": "Test",
            "channel": "C12345",
            "user": "U67890"
        }

        event = MessageEvent.from_slack(channel_event)
        assert event.chat_type == "group"

        # DM (starts with D is private)
        dm_event = {
            "text": "Test",
            "channel": "D12345",
            "user": "U67890"
        }

        dm = MessageEvent.from_slack(dm_event)
        assert dm.chat_type == "private"

    def test_slack_command_detection(self):
        """Test command detection in Slack messages."""
        slack_event = {
            "text": "/help",
            "channel": "C12345",
            "user": "U67890"
        }

        event = MessageEvent.from_slack(slack_event)

        assert event.is_command == True
        assert event.command == "/help"

    def test_slack_session_key_generation(self):
        """Test session key generation for Slack."""
        slack_event = {
            "text": "Test",
            "channel": "C12345",
            "user": "U67890"
        }

        event = MessageEvent.from_slack(slack_event)

        expected = "agent:main:slack:group:C12345"
        assert event.session_key == expected


# =============================================================================
# WeChat Integration Tests
# =============================================================================

class TestWeChatAdapter:
    """Test WeChat adapter functionality."""

    def test_adapter_creation(self):
        """Test creating WeChatAdapter."""
        adapter = WeChatAdapter()

        assert adapter.platform_name == "wechat"
        assert not adapter.is_connected

    def test_adapter_connect_disconnect(self):
        """Test adapter connect/disconnect methods."""
        adapter = WeChatAdapter()

        import asyncio

        async def test_connect_disconnect():
            await adapter.connect()
            assert adapter.is_connected
            await adapter.disconnect()
            assert not adapter.is_connected

        asyncio.run(test_connect_disconnect())

    def test_adapter_no_client_error(self):
        """Test error when client is not available."""
        adapter = WeChatAdapter()

        import asyncio

        async def test_no_client():
            with pytest.raises(RuntimeError, match="client not available"):
                await adapter.send_message("12345", "Hello!")

        asyncio.run(test_no_client())

    def test_media_send_methods_exist(self):
        """Test that all media send methods are defined."""
        adapter = WeChatAdapter()

        # Check media methods exist
        assert hasattr(adapter, "send_image")
        assert hasattr(adapter, "send_image_file")
        assert hasattr(adapter, "send_video")
        assert hasattr(adapter, "send_voice")
        assert hasattr(adapter, "send_document")
        assert hasattr(adapter, "send_typing")
        assert hasattr(adapter, "stop_typing")
        assert hasattr(adapter, "edit_message")
        assert hasattr(adapter, "delete_message")


class TestWeChatMessageEvent:
    """Test MessageEvent creation from WeChat data."""

    def test_wechat_private_message(self):
        """Test WeChat private message (no room_id)."""
        wechat_event = {
            "text": "Hello bot!",
            "from_user_id": "wx_123",
            "to_user_id": "bot_456",
            "room_id": "",
            "chat_room_id": ""
        }

        event = MessageEvent.from_wechat(wechat_event)

        assert event.platform == "wechat"
        assert event.chat_id == "wx_123"
        assert event.user_id == "wx_123"
        assert event.chat_type == "private"
        assert event.text == "Hello bot!"

    def test_wechat_group_message(self):
        """Test WeChat group message (with room_id)."""
        wechat_event = {
            "text": "Group message",
            "from_user_id": "wx_123",
            "to_user_id": "bot_456",
            "room_id": "room_789",
            "chat_room_id": ""
        }

        event = MessageEvent.from_wechat(wechat_event)

        assert event.chat_id == "room_789"
        assert event.chat_type == "group"

    def test_wechat_no_commands(self):
        """Test that WeChat doesn't use slash commands."""
        wechat_event = {
            "text": "/help",
            "from_user_id": "wx_123",
            "to_user_id": "bot_456",
            "room_id": "",
            "chat_room_id": ""
        }

        event = MessageEvent.from_wechat(wechat_event)

        assert event.is_command == False
        assert event.command is None

    def test_wechat_session_key_generation(self):
        """Test session key generation for WeChat."""
        wechat_event = {
            "text": "Test",
            "from_user_id": "wx_123",
            "to_user_id": "bot_456",
            "room_id": "",
            "chat_room_id": ""
        }

        event = MessageEvent.from_wechat(wechat_event)

        expected = "agent:main:wechat:private:wx_123"
        assert event.session_key == expected

    def test_wechat_group_session_key(self):
        """Test session key for WeChat group."""
        wechat_event = {
            "text": "Test",
            "from_user_id": "wx_123",
            "to_user_id": "bot_456",
            "room_id": "room_789",
            "chat_room_id": ""
        }

        event = MessageEvent.from_wechat(wechat_event)

        expected = "agent:main:wechat:group:room_789"
        assert event.session_key == expected


# =============================================================================
# WhatsApp Integration Tests
# =============================================================================

class TestWhatsAppAdapter:
    """Test WhatsApp adapter functionality."""

    def test_adapter_creation(self):
        """Test creating WhatsAppAdapter."""
        adapter = WhatsAppAdapter()

        assert adapter.platform_name == "whatsapp"
        assert not adapter.is_connected

    def test_adapter_connect_disconnect(self):
        """Test adapter connect/disconnect methods."""
        adapter = WhatsAppAdapter()

        import asyncio

        async def test_connect_disconnect():
            await adapter.connect()
            assert adapter.is_connected
            await adapter.disconnect()
            assert not adapter.is_connected

        asyncio.run(test_connect_disconnect())

    def test_adapter_no_client_error(self):
        """Test error when client is not available."""
        adapter = WhatsAppAdapter()

        import asyncio

        async def test_no_client():
            with pytest.raises(RuntimeError, match="client not available"):
                await adapter.send_message("1234567890", "Hello!")

        asyncio.run(test_no_client())

    def test_media_send_methods_exist(self):
        """Test that all media send methods are defined."""
        adapter = WhatsAppAdapter()

        # Check media methods exist
        assert hasattr(adapter, "send_image")
        assert hasattr(adapter, "send_image_file")
        assert hasattr(adapter, "send_video")
        assert hasattr(adapter, "send_voice")
        assert hasattr(adapter, "send_document")
        assert hasattr(adapter, "send_typing")
        assert hasattr(adapter, "stop_typing")
        # WhatsApp typically doesn't support editing
        assert hasattr(adapter, "edit_message")
        assert hasattr(adapter, "delete_message")


class TestWhatsAppMessageEvent:
    """Test MessageEvent creation from WhatsApp data."""

    def test_whatsapp_basic_event_creation(self):
        """Test creating basic WhatsApp message event."""
        whatsapp_entry = {
            "entry": [
                {
                    "changes": [
                        {
                            "value": {
                                "metadata": {
                                    "phone_number_id": "phone_123"
                                },
                                "messages": [
                                    {
                                        "from": "15551234567",
                                        "text": {
                                            "body": "Hello bot!"
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        }

        event = MessageEvent.from_whatsapp(whatsapp_entry)

        assert event.platform == "whatsapp"
        assert event.chat_id == "15551234567"
        assert event.user_id == "15551234567"
        assert event.text == "Hello bot!"
        assert event.chat_type == "private"

    def test_whatsapp_no_commands(self):
        """Test that WhatsApp doesn't use slash commands."""
        whatsapp_entry = {
            "entry": [
                {
                    "changes": [
                        {
                            "value": {
                                "metadata": {
                                    "phone_number_id": "phone_123"
                                },
                                "messages": [
                                    {
                                        "from": "15551234567",
                                        "text": {
                                            "body": "/help"
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        }

        event = MessageEvent.from_whatsapp(whatsapp_entry)

        assert event.is_command == False
        assert event.command is None

    def test_whatsapp_empty_entry(self):
        """Test handling empty entry structure."""
        whatsapp_entry = {"entry": []}

        event = MessageEvent.from_whatsapp(whatsapp_entry)

        assert event.platform == "whatsapp"
        assert event.chat_id == ""

    def test_whatsapp_session_key_generation(self):
        """Test session key generation for WhatsApp."""
        whatsapp_entry = {
            "entry": [
                {
                    "changes": [
                        {
                            "value": {
                                "metadata": {
                                    "phone_number_id": "phone_123"
                                },
                                "messages": [
                                    {
                                        "from": "15551234567",
                                        "text": {
                                            "body": "Test"
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        }

        event = MessageEvent.from_whatsapp(whatsapp_entry)

        expected = "agent:main:whatsapp:private:15551234567"
        assert event.session_key == expected


# =============================================================================
# Gateway Runner Platform Tests
# =============================================================================

class TestGatewayRunnerNewPlatforms:
    """Test GatewayRunner with new platforms."""

    def test_register_lark_adapter(self):
        """Test registering Lark adapter."""
        runner = GatewayRunner()
        adapter = LarkAdapter()

        runner.register_adapter(adapter)

        assert "lark" in runner._adapters

    def test_register_slack_adapter(self):
        """Test registering Slack adapter."""
        runner = GatewayRunner()
        adapter = SlackAdapter()

        runner.register_adapter(adapter)

        assert "slack" in runner._adapters

    def test_register_wechat_adapter(self):
        """Test registering WeChat adapter."""
        runner = GatewayRunner()
        adapter = WeChatAdapter()

        runner.register_adapter(adapter)

        assert "wechat" in runner._adapters

    def test_register_whatsapp_adapter(self):
        """Test registering WhatsApp adapter."""
        runner = GatewayRunner()
        adapter = WhatsAppAdapter()

        runner.register_adapter(adapter)

        assert "whatsapp" in runner._adapters

    def test_lark_whitelist(self):
        """Test whitelist for Lark platform."""
        runner = GatewayRunner()
        runner.set_allowed_users("lark", {"ou_123", "ou_456"})

        assert "lark" in runner._allowed_users
        assert runner._allowed_users["lark"] == {"ou_123", "ou_456"}

    def test_slack_team_whitelist(self):
        """Test team whitelist for Slack platform."""
        runner = GatewayRunner()
        runner.set_allowed_servers("slack", {"T12345", "T67890"})

        assert "slack" in runner._allowed_servers
        assert runner._allowed_servers["slack"] == {"T12345", "T67890"}


# =============================================================================
# Platform Comparison Tests
# =============================================================================

class TestPlatformComparison:
    """Test comparison across all platforms."""

    def test_all_platforms_have_adapters(self):
        """Test that all platforms have adapter classes."""
        from sediman.integrations.lark.adapter import LarkAdapter
        from sediman.integrations.slack.adapter import SlackAdapter
        from sediman.integrations.wechat.adapter import WeChatAdapter
        from sediman.integrations.whatsapp.adapter import WhatsAppAdapter
        from sediman.integrations.discord.adapter import DiscordAdapter
        from sediman.integrations.telegram.adapter import TelegramAdapter

        adapters = [
            LarkAdapter,
            SlackAdapter,
            WeChatAdapter,
            WhatsAppAdapter,
            DiscordAdapter,
            TelegramAdapter,
        ]

        # All should be classes
        for adapter_cls in adapters:
            assert isinstance(adapter_cls, type)

    def test_all_platforms_session_keys_unique(self):
        """Test that session keys are unique across platforms."""
        events = [
            MessageEvent.from_lark({
                "event": {
                    "text": "Test",
                    "sender": {"sender_id": {"open_id": "123"}, "sender_name": "User"},
                    "chat_id": "chat_123",
                    "root_id": ""
                }
            }),
            MessageEvent.from_slack({
                "text": "Test",
                "channel": "C123",
                "user": "U123"
            }),
            MessageEvent.from_wechat({
                "text": "Test",
                "from_user_id": "123",
                "to_user_id": "bot",
                "room_id": "",
                "chat_room_id": ""
            }),
            MessageEvent.from_whatsapp({
                "entry": [{
                    "changes": [{
                        "value": {
                            "metadata": {"phone_number_id": "phone"},
                            "messages": [{"from": "123", "text": {"body": "Test"}}]
                        }
                    }]
                }]
            }),
        ]

        session_keys = [e.session_key for e in events]

        # All session keys should be unique
        assert len(session_keys) == len(set(session_keys))

        # Each should contain its platform name
        assert "lark" in session_keys[0]
        assert "slack" in session_keys[1]
        assert "wechat" in session_keys[2]
        assert "whatsapp" in session_keys[3]


# =============================================================================
# Edge Cases and Error Handling
# =============================================================================

class TestNewPlatformsEdgeCases:
    """Test edge cases for new platforms."""

    def test_lark_empty_text(self):
        """Test Lark event with empty text."""
        lark_event = {
            "event": {
                "text": "",
                "sender": {"sender_id": {"open_id": "123"}, "sender_name": "User"},
                "chat_id": "chat_123",
                "root_id": ""
            }
        }

        event = MessageEvent.from_lark(lark_event)

        assert event.text == ""
        assert not event.is_command

    def test_slack_empty_text(self):
        """Test Slack event with empty text."""
        slack_event = {
            "text": "",
            "channel": "C123",
            "user": "U123"
        }

        event = MessageEvent.from_slack(slack_event)

        assert event.text == ""
        assert not event.is_command

    def test_wechat_empty_text(self):
        """Test WeChat event with empty text."""
        wechat_event = {
            "text": "",
            "from_user_id": "123",
            "to_user_id": "bot",
            "room_id": "",
            "chat_room_id": ""
        }

        event = MessageEvent.from_wechat(wechat_event)

        assert event.text == ""
        assert not event.is_command

    def test_whatsapp_empty_messages_list(self):
        """Test WhatsApp entry with empty messages list."""
        whatsapp_entry = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "phone"},
                        "messages": []
                    }
                }]
            }]
        }

        event = MessageEvent.from_whatsapp(whatsapp_entry)

        assert event.text == ""

    def test_lark_rich_text_empty_list(self):
        """Test Lark rich text with empty list."""
        lark_event = {
            "event": {
                "text": [],
                "sender": {"sender_id": {"open_id": "123"}, "sender_name": "User"},
                "chat_id": "chat_123",
                "root_id": ""
            }
        }

        event = MessageEvent.from_lark(lark_event)

        assert event.text == ""

    def test_lark_rich_text_non_text_elements(self):
        """Test Lark rich text with non-text elements."""
        lark_event = {
            "event": {
                "text": [
                    {"type": "mention", "user_id": "123"},
                    {"type": "link", "url": "https://example.com"}
                ],
                "sender": {"sender_id": {"open_id": "123"}, "sender_name": "User"},
                "chat_id": "chat_123",
                "root_id": ""
            }
        }

        event = MessageEvent.from_lark(lark_event)

        # Should extract text from text elements only
        assert event.text == ""


# =============================================================================
# Platform-Specific Features Tests
# =============================================================================

class TestPlatformSpecificFeatures:
    """Test platform-specific features and configurations."""

    def test_slack_has_team_whitelist(self):
        """Test Slack supports team-level whitelist."""
        runner = GatewayRunner()

        runner.set_allowed_servers("slack", {"T12345", "T67890"})

        assert "slack" in runner._allowed_servers
        assert "T12345" in runner._allowed_servers["slack"]

    def test_lark_uses_open_id(self):
        """Test Lark uses open_id format."""
        lark_event = {
            "event": {
                "text": "Test",
                "sender": {
                    "sender_id": {"open_id": "ou_12345678"},
                    "sender_name": "User"
                },
                "chat_id": "oc_87654321",
                "root_id": ""
            }
        }

        event = MessageEvent.from_lark(lark_event)

        # Lark uses ou_ prefix for users, oc_ prefix for chats
        assert event.user_id == "ou_12345678"
        assert event.chat_id == "oc_87654321"

    def test_wechat_room_detection(self):
        """Test WeChat room detection logic."""
        # With room_id
        event1 = MessageEvent.from_wechat({
            "text": "Test",
            "from_user_id": "123",
            "to_user_id": "bot",
            "room_id": "room_123",
            "chat_room_id": ""
        })
        assert event1.chat_type == "group"

        # With chat_room_id
        event2 = MessageEvent.from_wechat({
            "text": "Test",
            "from_user_id": "123",
            "to_user_id": "bot",
            "room_id": "",
            "chat_room_id": "chat_room_456"
        })
        assert event2.chat_type == "group"

        # Neither
        event3 = MessageEvent.from_wechat({
            "text": "Test",
            "from_user_id": "123",
            "to_user_id": "bot",
            "room_id": "",
            "chat_room_id": ""
        })
        assert event3.chat_type == "private"

    def test_whatsapp_phone_number_format(self):
        """Test WhatsApp phone number handling."""
        whatsapp_entry = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "123456789"},
                        "messages": [{
                            "from": "15551234567",
                            "text": {"body": "Test"}
                        }]
                    }
                }]
            }]
        }

        event = MessageEvent.from_whatsapp(whatsapp_entry)

        # WhatsApp uses phone numbers as IDs
        assert event.user_id == "15551234567"
        assert event.chat_id == "15551234567"


# =============================================================================
# Integration Config Tests
# =============================================================================

class TestNewPlatformsConfig:
    """Test integration configuration for new platforms."""

    def test_default_config_has_new_platforms(self):
        """Test default config includes new platforms."""
        from sediman.integrations.config import _default_config

        config = _default_config()

        assert "lark" in config
        assert "slack" in config
        assert "wechat" in config
        assert "whatsapp" in config

    def test_lark_config_structure(self):
        """Test Lark config has required fields."""
        from sediman.integrations.config import _default_config

        config = _default_config()

        assert config["lark"]["enabled"] == False
        assert "app_id" in config["lark"]
        assert "app_secret" in config["lark"]

    def test_slack_config_structure(self):
        """Test Slack config has required fields."""
        from sediman.integrations.config import _default_config

        config = _default_config()

        assert config["slack"]["enabled"] == False
        assert "token" in config["slack"]
        assert "channels" in config["slack"]

    def test_wechat_config_structure(self):
        """Test WeChat config has required fields."""
        from sediman.integrations.config import _default_config

        config = _default_config()

        assert config["wechat"]["enabled"] == False
        assert "account_id" in config["wechat"]

    def test_whatsapp_config_structure(self):
        """Test WhatsApp config has required fields."""
        from sediman.integrations.config import _default_config

        config = _default_config()

        # Check WhatsApp config exists
        assert "whatsapp" in config or "whatsapp_business" in config

        whatsapp_config = config.get("whatsapp", config.get("whatsapp_business", {}))

        assert whatsapp_config.get("enabled", False) == False
        assert "token" in whatsapp_config or "access_token" in whatsapp_config
        assert "phone_number_id" in whatsapp_config or "phone_id" in whatsapp_config
