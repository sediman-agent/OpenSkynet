/**
 * Database schema for app-wide conversations and messages
 * This is separate from project_conversations which are project-specific
 */

export const CONVERSATIONS_SCHEMA = `
-- App-wide conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages within conversations
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL DEFAULT '',
    status TEXT DEFAULT 'done' CHECK(status IN ('idle', 'sending', 'streaming', 'done', 'error')),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata_json TEXT DEFAULT '{}',
    thinking TEXT,
    screenshot TEXT,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Tool calls for messages
CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    detail TEXT,
    observation TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'error')),
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tool_calls_message ON tool_calls(message_id);

-- Full-text search on conversations
CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
    title,
    content=conversations,
    content_rowid=rowid
);

-- Triggers for FTS
CREATE TRIGGER IF NOT EXISTS conversations_ai AFTER INSERT ON conversations BEGIN
    INSERT INTO conversations_fts(rowid, title)
    VALUES (new.rowid, new.title);
END;

CREATE TRIGGER IF NOT EXISTS conversations_ad AFTER DELETE ON conversations BEGIN
    INSERT INTO conversations_fts(conversations_fts, rowid, title)
    VALUES ('delete', old.rowid, old.title);
END;

CREATE TRIGGER IF NOT EXISTS conversations_au AFTER UPDATE ON conversations BEGIN
    INSERT INTO conversations_fts(conversations_fts, rowid, title)
    VALUES ('delete', old.rowid, old.title);
    INSERT INTO conversations_fts(rowid, title)
    VALUES (new.rowid, new.title);
END;
`;

/**
 * Initialize the conversations schema in the database
 */
export function initConversationsSchema(db: any): void {
  db.exec(CONVERSATIONS_SCHEMA);
}
