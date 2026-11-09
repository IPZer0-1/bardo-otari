import pool from "./client";

export interface Conversation {
  id: string;
  campaign_id: string;
  user_id: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

const MAX_CONVERSATIONS = 5;

export async function getConversationsForUser(
  campaignId: string,
  userId: string
): Promise<Conversation[]> {
  const { rows } = await pool.query(
    `SELECT id, campaign_id, user_id, created_at
     FROM conversations
     WHERE campaign_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [campaignId, userId, MAX_CONVERSATIONS]
  );
  return rows;
}

export async function createConversation(
  campaignId: string,
  userId: string
): Promise<Conversation> {
  // Si ya hay MAX_CONVERSATIONS, borrar la más antigua
  const { rows: existing } = await pool.query(
    `SELECT id FROM conversations
     WHERE campaign_id = $1 AND user_id = $2
     ORDER BY created_at ASC`,
    [campaignId, userId]
  );

  if (existing.length >= MAX_CONVERSATIONS) {
    await pool.query(
      `DELETE FROM conversations WHERE id = $1`,
      [existing[0].id]
    );
  }

  const { rows } = await pool.query(
    `INSERT INTO conversations (campaign_id, user_id)
     VALUES ($1, $2)
     RETURNING id, campaign_id, user_id, created_at`,
    [campaignId, userId]
  );
  return rows[0];
}

export async function getMessagesForConversation(
  conversationId: string,
  userId: string
): Promise<ChatMessage[]> {
  // Verificar propiedad antes de devolver mensajes
  const { rows } = await pool.query(
    `SELECT m.id, m.conversation_id, m.role, m.content, m.created_at
     FROM chat_messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE m.conversation_id = $1 AND c.user_id = $2
     ORDER BY m.created_at ASC`,
    [conversationId, userId]
  );
  return rows;
}

export async function saveMessages(
  conversationId: string,
  userContent: string,
  assistantContent: string
): Promise<void> {
  await pool.query(
    `INSERT INTO chat_messages (conversation_id, role, content) VALUES
     ($1, 'user', $2),
     ($1, 'assistant', $3)`,
    [conversationId, userContent, assistantContent]
  );
}
