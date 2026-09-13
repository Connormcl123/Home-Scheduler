import type {
  AssistantAction,
  AssistantChatResponse,
  AssistantConversation,
  AssistantConversationSummary,
  AssistantRole
} from "@mirror-dashboard/shared";
import { getDb } from "../db.js";
import { AssistantError, runAssistantTurn } from "./assistant.js";

/**
 * Saved assistant chats, so the Assistant tab can show a Recents list the way
 * the Claude app does. The model still only sees the last few turns of a
 * conversation (runAssistantTurn trims it), which keeps each reply cheap.
 */
type ConversationRow = { id: number; title: string; created_at: string; updated_at: string };
type MessageRow = { id: number; role: AssistantRole; content: string; actions: string; created_at: string };

// SQLite's CURRENT_TIMESTAMP is UTC with no zone marker; give the client ISO.
function iso(value: string) {
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

function titleFrom(message: string) {
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > 48 ? `${oneLine.slice(0, 47).trimEnd()}\u2026` : oneLine;
}

function parseActions(value: string): AssistantAction[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function listConversations(): Promise<AssistantConversationSummary[]> {
  const db = await getDb();
  const rows = await db.all<Array<ConversationRow & { preview: string | null; message_count: number }>>(`
    SELECT c.*,
      (SELECT content FROM assistant_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS preview,
      (SELECT COUNT(*) FROM assistant_messages m WHERE m.conversation_id = c.id) AS message_count
    FROM assistant_conversations c
    ORDER BY c.updated_at DESC, c.id DESC
    LIMIT 100
  `);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    preview: (row.preview ?? "").replace(/\s+/g, " ").slice(0, 120),
    messageCount: row.message_count,
    updatedAt: iso(row.updated_at)
  }));
}

export async function getConversation(id: number): Promise<AssistantConversation | null> {
  const db = await getDb();
  const row = await db.get<ConversationRow>("SELECT * FROM assistant_conversations WHERE id = ?", id);
  if (!row) return null;
  const messages = await db.all<MessageRow[]>(
    "SELECT id, role, content, actions, created_at FROM assistant_messages WHERE conversation_id = ? ORDER BY id",
    id
  );
  return {
    id: row.id,
    title: row.title,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      actions: parseActions(message.actions),
      createdAt: iso(message.created_at)
    }))
  };
}

export async function deleteConversation(id: number) {
  const db = await getDb();
  await db.run("DELETE FROM assistant_conversations WHERE id = ?", id);
}

/**
 * One chat turn inside a saved conversation. With no id a new conversation is
 * started, titled from the first message. The turn runs before anything is
 * written, so a failed reply never leaves a half-saved chat behind.
 */
export async function chatInConversation(message: string, conversationId: number | null): Promise<AssistantChatResponse> {
  const db = await getDb();
  let conversation: ConversationRow | undefined;
  if (conversationId !== null) {
    conversation = await db.get<ConversationRow>("SELECT * FROM assistant_conversations WHERE id = ?", conversationId);
    if (!conversation) throw new AssistantError("That chat no longer exists.", 404);
  }

  const history = conversation
    ? (await db.all<MessageRow[]>("SELECT role, content FROM assistant_messages WHERE conversation_id = ? ORDER BY id", conversation.id))
        .map(({ role, content }) => ({ role, content }))
    : [];

  const result = await runAssistantTurn(history, message);

  let id = conversation?.id;
  const title = conversation?.title ?? titleFrom(message);
  if (id === undefined) {
    const inserted = await db.run("INSERT INTO assistant_conversations (title) VALUES (?)", title);
    id = Number(inserted.lastID);
  }
  await db.run("INSERT INTO assistant_messages (conversation_id, role, content) VALUES (?, 'user', ?)", id, message);
  await db.run(
    "INSERT INTO assistant_messages (conversation_id, role, content, actions) VALUES (?, 'assistant', ?, ?)",
    id,
    result.reply,
    JSON.stringify(result.actions)
  );
  await db.run("UPDATE assistant_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", id);

  return { ...result, conversationId: id, title };
}
