# High-Performance WhatsApp Architecture for Insurance CRM

## 1. System Overview
This architecture resolves the critical issues of unreliable message delivery, permission synchronization, and group management. It decouples the frontend from WhatsApp logic using a robust **Queue-Worker** pattern.

### Core Components
1.  **Backend API (Node.js/Supabase Edge Functions)**: Receives message requests, enforces permissions, and pushes jobs to Redis.
2.  **Redis Queue (BullMQ)**: Persists jobs to ensure no message is lost during restarts or connection drops.
3.  **WhatsApp Worker (Node.js + Baileys)**: A dedicated service that maintains persistent WhatsApp connections (sessions) and processes the queue.
4.  **Supabase Database**: Stores session state, group mappings, and message logs.
5.  **Frontend**: Connects via WebSocket for real-time status updates (Sent -> Delivered -> Read).

---

## 2. Database Schema (Optimized)

### `whatsapp_sessions`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary Key |
| `user_id` | UUID | Admin User ID (Owner) |
| `phone_number` | VARCHAR | Connected Phone (e.g., 90555...) |
| `status` | ENUM | `connected`, `disconnected`, `scanning` |
| `qr_code` | TEXT | Base64 QR Data |
| `config` | JSONB | Session metadata (browser info) |
| `updated_at` | TIMESTAMPTZ | Heartbeat timestamp |

### `whatsapp_groups` (Normalized)
| Column | Type | Description |
|--------|------|-------------|
| `jid` | VARCHAR | **PK**. The unique WhatsApp ID (e.g., `123456@g.us`) |
| `name` | VARCHAR | Group Subject |
| `session_id` | UUID | FK to `whatsapp_sessions`. Which session owns this? |
| `participants` | JSONB | List of participant JIDs |
| `is_active` | BOOLEAN | If false, group is archived/left |
| `last_synced` | TIMESTAMPTZ | Sync timestamp |

### `group_assignments` (Permissions)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `group_jid` | VARCHAR | FK to `whatsapp_groups.jid` |
| `employee_group_id` | UUID | FK to internal `employee_groups` |
| `created_at` | TIMESTAMPTZ | |

### `messages` (Audit Log)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `wa_message_id` | VARCHAR | The WhatsApp ID (e.g. `BAE5...`) |
| `group_jid` | VARCHAR | Target Group |
| `sender_id` | UUID | Internal User ID (Employee) |
| `content` | TEXT | Message Body |
| `status` | ENUM | `pending`, `sent`, `delivered`, `read`, `failed` |
| `error_log` | TEXT | If failed, why? |
| `created_at` | TIMESTAMPTZ | |

---

## 3. Critical Fixes & Logic

### Fix #1: "Employees cannot send to auto-imported groups"
**Root Cause:**
1.  The system uses internal UUIDs for groups, but WhatsApp needs JIDs (`123@g.us`).
2.  The mapping between UUID and JID is often broken or missing.
3.  The Bot (Admin's session) is not an Admin or Member of the imported group.

**Solution:**
- **JID as Primary Key:** We stop generating UUIDs for WhatsApp groups. We use the JID as the canonical ID in the `whatsapp_groups` table.
- **Sync Validation:** During sync, the worker checks `groupMetadata.participants`. If the bot is not in the list, it marks the group as `readonly` in the DB.

### Fix #2: "Real-time delivery is unreliable"
**Root Cause:**
- Frontend relies on Supabase Realtime for *sending* logic (bad pattern).
- If the browser tab closes, the message is lost.

**Solution:**
- **Queue-Based Sending:** Frontend POSTs to `/api/send-message`. Server instantly ACKs ("Queued").
- **Redis Persistence:** The job is stored in Redis. Even if the server crashes, the job is retried on restart.

### Fix #3: "Session Drops"
**Solution:**
- **Persistent File Storage:** The worker saves Auth Credentials to disk (`/auth_info/session-{id}`).
- **Auto-Reconnect Loop:**
  ```javascript
  connection.on('close', ({ lastDisconnect }) => {
      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startSession(); // Immediate retry
  });
  ```

---

## 4. Message Flow (Employee → Group)

1.  **Frontend**:
    - User selects group (e.g., "Hasar Takip").
    - Types message.
    - `POST /api/messages/send { groupJid: '123@g.us', content: '...' }`

2.  **API Layer (Backend)**:
    - **Auth Check**: Is `auth.uid()` valid?
    - **Permission Check**: Does `group_assignments` link `123@g.us` to the user's Employee Group?
    - **Enqueue**: Add to Redis `whatsapp-queue`.
    - **Return**: `202 Accepted` (Message ID: `xyz`).

3.  **Worker (Background)**:
    - **Pop**: Get job `{ groupJid, content, senderId }`.
    - **Session Check**: Get the Admin Session responsible for this group.
    - **Send**: `sock.sendMessage(jid, { text: content })`.
    - **DB Update**: Update `messages` table status to `sent`.

4.  **Realtime**:
    - Supabase Realtime detects `UPDATE messages SET status = 'sent'`.
    - Frontend updates the tick mark (✓).

---

## 5. Implementation Plan

1.  **Database Migration**: Run the SQL script to create optimized tables.
2.  **Worker Service**: Create `worker.js` that initializes Baileys and connects to Redis.
3.  **API Endpoint**: Create a Supabase Edge Function or Express Route for sending.
4.  **Frontend Update**: Replace direct DB inserts with API calls.
