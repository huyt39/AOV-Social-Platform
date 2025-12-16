# Hệ thống Tin nhắn (Messaging System)

Tài liệu chi tiết về kiến trúc và triển khai hệ thống tin nhắn realtime trong AOV Social Platform.

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Kiến trúc hệ thống](#2-kiến-trúc-hệ-thống)
3. [Data Models](#3-data-models)
4. [REST API Endpoints](#4-rest-api-endpoints)
5. [WebSocket Protocol](#5-websocket-protocol)
6. [RabbitMQ Message Queue](#6-rabbitmq-message-queue)
7. [Message Consumer](#7-message-consumer)
8. [Redis Pub/Sub](#8-redis-pubsub)
9. [Luồng xử lý (Flow Diagrams)](#9-luồng-xử-lý)
10. [File Structure](#10-file-structure)

---

## 1. Tổng quan

### 1.1 Tính năng chính

- **Chat 1-1 (Direct Message)**: Tin nhắn riêng tư giữa 2 người dùng
- **Chat nhóm (Group Chat)**: Tin nhắn nhóm với nhiều thành viên
- **Tin nhắn realtime**: Gửi/nhận tin nhắn ngay lập tức qua WebSocket
- **Trạng thái tin nhắn**: SENT → DELIVERED → SEEN
- **Typing indicator**: Hiển thị khi người khác đang gõ
- **Media attachments**: Hỗ trợ gửi ảnh và video
- **Reply message**: Trả lời tin nhắn cụ thể

### 1.2 Technology Stack

| Component | Technology |
|-----------|------------|
| Backend Framework | FastAPI (Python) |
| Database | MongoDB (via Beanie ODM) |
| Message Queue | RabbitMQ (aio-pika) |
| Cache/Pub-Sub | Redis (redis-py async) |
| Realtime | WebSocket |

---

## 2. Kiến trúc hệ thống

```mermaid
flowchart TB
    subgraph Client
        FE[Frontend React]
    end

    subgraph "API Layer"
        REST[REST API - messages.py]
        WS[WebSocket - websocket.py]
    end

    subgraph "Business Logic"
        MS[MessageService]
    end

    subgraph "Data Layer"
        MONGO[(MongoDB)]
    end

    subgraph "Event System"
        RMQ[RabbitMQ Exchange]
        MC[Message Consumer]
        REDIS[(Redis Pub/Sub)]
    end

    FE <-->|HTTP| REST
    FE <-->|WebSocket| WS
    
    REST --> MS
    WS --> MS
    
    MS --> MONGO
    
    REST -->|publish_message_event| RMQ
    WS -->|publish_message_event| RMQ
    
    RMQ -->|consume| MC
    MC -->|publish_to_user| REDIS
    REDIS -->|subscribe| WS
    WS -->|send_json| FE
```

### 2.1 Mô tả kiến trúc

1. **REST API** (`messages.py`): Xử lý các request HTTP như tạo conversation, gửi tin nhắn, đánh dấu đã xem
2. **WebSocket** (`websocket.py`): Kết nối realtime cho việc gửi/nhận tin nhắn
3. **MessageService** (`message_service.py`): Business logic xử lý conversation và message
4. **RabbitMQ**: Message queue để decouple API layer và event processing
5. **Message Consumer** (`message_consumer.py`): Xử lý các event từ RabbitMQ
6. **Redis Pub/Sub**: Phân phối tin nhắn realtime đến các WebSocket connection

---

## 3. Data Models

File: [`app/models/conversation.py`](file:///home/linh/AOV-Social-Platform/backend/app/models/conversation.py)

### 3.1 Enums

```python
class ConversationType(str, Enum):
    DIRECT = "DIRECT"  # Chat 1-1
    GROUP = "GROUP"    # Chat nhóm

class ParticipantRole(str, Enum):
    MEMBER = "MEMBER"
    ADMIN = "ADMIN"

class MessageType(str, Enum):
    TEXT = "TEXT"
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    MIXED = "MIXED"  # Text + media

class MessageStatus(str, Enum):
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    SEEN = "SEEN"
```

### 3.2 Document Models (MongoDB)

#### Conversation
```python
class Conversation(Document):
    id: str                          # UUID
    type: ConversationType           # DIRECT | GROUP
    name: Optional[str]              # Tên nhóm (cho GROUP)
    avatar_url: Optional[str]        # Avatar nhóm
    created_by: Optional[str]        # User ID người tạo
    created_at: datetime
    updated_at: datetime             # Last activity
    last_message_id: Optional[str]   # ID tin nhắn cuối
    last_message_content: Optional[str]  # Preview text
    last_message_at: Optional[datetime]
```

#### ConversationParticipant
```python
class ConversationParticipant(Document):
    id: str
    conversation_id: str
    user_id: str
    role: ParticipantRole            # MEMBER | ADMIN
    last_seen_message_id: Optional[str]
    unread_count: int                # Số tin chưa đọc
    muted: bool
    joined_at: datetime
    left_at: Optional[datetime]      # Null nếu còn trong conversation
```

#### Message
```python
class Message(Document):
    id: str
    conversation_id: str
    sender_id: str
    content: Optional[str]           # Nội dung text
    type: MessageType                # TEXT | IMAGE | VIDEO | MIXED
    media: list[MediaAttachment]     # Danh sách media
    status: MessageStatus            # SENT | DELIVERED | SEEN
    reply_to_message_id: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]   # Cho tin nhắn đã chỉnh sửa
    deleted_at: Optional[datetime]   # Soft delete
```

#### MediaAttachment
```python
class MediaAttachment(BaseModel):
    url: str
    type: str                        # "image" | "video"
    thumbnail_url: Optional[str]
    width: Optional[int]
    height: Optional[int]
    duration: Optional[float]        # Cho video, đơn vị giây
```

### 3.3 MongoDB Indexes

```python
# Conversation indexes
["created_at", "updated_at"]

# ConversationParticipant indexes
["conversation_id", "user_id"]
[("conversation_id", 1), ("user_id", 1)]  # Compound index

# Message indexes
["conversation_id", "sender_id", "created_at"]
[("conversation_id", 1), ("created_at", -1)]  # Pagination
```

---

## 4. REST API Endpoints

File: [`app/api/routes/messages.py`](file:///home/linh/AOV-Social-Platform/backend/app/api/routes/messages.py)

Base URL: `/api/v1/messages`

### 4.1 Search Users

```
GET /messages/search/users?q={query}&limit={limit}
```

Tìm kiếm người dùng để bắt đầu conversation mới.

**Response:**
```json
{
  "success": true,
  "data": [
    {"id": "...", "username": "...", "avatar_url": "..."}
  ]
}
```

### 4.2 Conversations

#### Tạo conversation
```
POST /messages/conversations
```

**Request Body:**
```json
{
  "type": "DIRECT" | "GROUP",
  "participant_ids": ["user_id_1", "user_id_2"],
  "name": "Group Name",       // Cho GROUP
  "avatar_url": "..."         // Optional
}
```

> **Note**: Với DIRECT chat, nếu đã tồn tại conversation giữa 2 user thì trả về cái cũ.

#### Lấy danh sách conversations
```
GET /messages/conversations?cursor={cursor}&limit={limit}
```

**Response:** `ConversationsResponse`

#### Lấy chi tiết conversation
```
GET /messages/conversations/{conversation_id}
```

**Response:** `ConversationPublic` với participants và last_message

### 4.3 Messages

#### Lấy messages trong conversation
```
GET /messages/conversations/{conversation_id}/messages?cursor={cursor}&limit={limit}
```

- Pagination dựa trên `created_at` (cursor-based)
- Trả về messages theo thứ tự thời gian (oldest first)

#### Gửi message
```
POST /messages/conversations/{conversation_id}/messages
```

**Request Body:**
```json
{
  "content": "Hello!",
  "media": [{"url": "...", "type": "image"}],
  "reply_to_message_id": null
}
```

> **Important**: Sau khi gửi, sẽ publish event `MESSAGE_SENT` đến RabbitMQ.

#### Đánh dấu đã xem
```
PATCH /messages/conversations/{conversation_id}/seen?message_id={message_id}
```

- Reset `unread_count` về 0
- Update `last_seen_message_id`
- Update status của messages thành `SEEN`
- Publish event `MESSAGE_SEEN` đến RabbitMQ

### 4.4 Participants (Group Chat)

#### Thêm thành viên
```
POST /messages/conversations/{conversation_id}/participants?user_ids=[]
```
- Chỉ ADMIN mới có quyền thêm

#### Xóa thành viên
```
DELETE /messages/conversations/{conversation_id}/participants/{user_id}
```
- ADMIN có thể xóa người khác
- Member chỉ có thể tự rời

### 4.5 Direct Message Helper

```
POST /messages/direct/{user_id}
```

Tạo hoặc lấy conversation DIRECT với một user.

---

## 5. WebSocket Protocol

File: [`app/api/routes/websocket.py`](file:///home/linh/AOV-Social-Platform/backend/app/api/routes/websocket.py)

### 5.1 Kết nối

```
ws://host/api/v1/ws?token=<jwt_token>
```

Sau khi kết nối thành công, server gửi:
```json
{
  "type": "connected",
  "message": "Connected to notification and message stream",
  "user_id": "..."
}
```

### 5.2 Client → Server Messages

#### Gửi tin nhắn
```json
{
  "type": "SEND_MESSAGE",
  "conversationId": "conv_123",
  "content": "Hello!",
  "media": [],
  "tempId": "temp_abc",
  "replyToMessageId": null
}
```

#### Typing indicator
```json
{
  "type": "TYPING",
  "conversationId": "conv_123"
}
```

#### Đánh dấu đã xem
```json
{
  "type": "MARK_SEEN",
  "conversationId": "conv_123",
  "messageId": "msg_456"
}
```

#### Ping/Pong
```json
{"type": "ping"}
// Server responds: {"type": "pong"}
```

### 5.3 Server → Client Messages

#### Tin nhắn mới
```json
{
  "type": "NEW_MESSAGE",
  "conversationId": "conv_123",
  "messageId": "msg_456",
  "senderId": "user_789",
  "senderUsername": "john",
  "senderAvatar": "...",
  "content": "Hello!",
  "messageType": "TEXT",
  "media": [],
  "status": "SENT",
  "createdAt": "2024-01-01T12:00:00Z"
}
```

#### Message ACK
```json
{
  "type": "MESSAGE_ACK",
  "tempId": "temp_abc",
  "messageId": "msg_456",
  "status": "SENT"
}
```

#### Message status update
```json
{
  "type": "MESSAGE_STATUS",
  "messageId": "msg_456",
  "status": "DELIVERED"
}
```

#### Message seen
```json
{
  "type": "MESSAGE_SEEN",
  "conversationId": "conv_123",
  "userId": "user_789",
  "username": "john",
  "lastSeenMessageId": "msg_456"
}
```

#### Typing indicator
```json
{
  "type": "TYPING",
  "conversationId": "conv_123",
  "userId": "user_789",
  "username": "john"
}
```

### 5.4 Connection Manager

```python
class ConnectionManager:
    active_connections: dict[str, set[WebSocket]]  # user_id -> sockets
    socket_info: dict[str, tuple[str, WebSocket]]  # socket_id -> (user_id, ws)
```

- Mỗi user có thể có nhiều WebSocket connections (multiple tabs/devices)
- Socket ID được đăng ký vào Redis để track online status

---

## 6. RabbitMQ Message Queue

File: [`app/services/rabbitmq.py`](file:///home/linh/AOV-Social-Platform/backend/app/services/rabbitmq.py)

### 6.1 Exchanges

| Exchange Name | Type | Purpose |
|---------------|------|---------|
| `events` | TOPIC | Notification events |
| `message_events` | TOPIC | Messaging events |

### 6.2 Routing Keys

```python
class MessageRoutingKey:
    MESSAGE_SENT = "message.sent"
    MESSAGE_DELIVERED = "message.delivered"
    MESSAGE_SEEN = "message.seen"
    TYPING = "message.typing"
```

### 6.3 Publisher Function

```python
async def publish_message_event(routing_key: str, payload: dict) -> bool:
    """
    Publish message event to RabbitMQ message events exchange.
    
    Payload được thêm timestamp tự động.
    Message được set PERSISTENT để survive broker restarts.
    """
```

### 6.4 Event Payloads

#### MESSAGE_SENT
```json
{
  "message_id": "msg_456",
  "conversation_id": "conv_123",
  "sender_id": "user_789",
  "temp_id": "temp_abc",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### MESSAGE_SEEN
```json
{
  "conversation_id": "conv_123",
  "user_id": "user_789",
  "message_id": "msg_456",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### TYPING
```json
{
  "conversation_id": "conv_123",
  "user_id": "user_789",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

---

## 7. Message Consumer

File: [`app/services/message_consumer.py`](file:///home/linh/AOV-Social-Platform/backend/app/services/message_consumer.py)

### 7.1 Queue Configuration

- **Queue name**: `message_consumer`
- **Binding**: `message_events` exchange với routing key `message.*`

### 7.2 Event Handlers

#### _handle_message_sent

1. Lấy message từ DB
2. Lấy sender info (username, avatar)
3. Build message payload cho realtime
4. Lấy danh sách participants (trừ sender)
5. Với mỗi participant online: publish to Redis Pub/Sub
6. Gửi ACK về cho sender

#### _handle_message_delivered

1. Update message status trong DB: SENT → DELIVERED
2. Notify sender qua Redis Pub/Sub

#### _handle_message_seen

1. Gọi `message_service.mark_conversation_seen()`
2. Notify các participants khác về việc đã xem

#### _handle_typing

1. Lấy user info
2. Broadcast typing indicator đến các participants online

### 7.3 Starting Consumer

```python
# Trong app startup (main.py)
from app.services.message_consumer import message_consumer

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    asyncio.create_task(message_consumer.start())
    yield
    # Shutdown
    await message_consumer.stop()
```

---

## 8. Redis Pub/Sub

### 8.1 Channels

| Channel Pattern | Purpose |
|-----------------|---------|
| `notification:user:{user_id}` | Notifications |
| `message:user:{user_id}` | Messages |

### 8.2 Redis Service Methods

```python
class RedisService:
    async def add_socket(user_id: str, socket_id: str)
    async def remove_socket(user_id: str, socket_id: str)
    async def is_user_online(user_id: str) -> bool
    async def publish_to_user(user_id: str, channel_type: str, data: dict)
    async def subscribe_user_notifications(user_id: str, callback)
```

### 8.3 Online Status

- Mỗi WebSocket connection đăng ký socket_id vào Redis Set: `online:{user_id}`
- User được coi là online nếu Set không rỗng
- Khi disconnect, socket_id bị remove khỏi Set

---

## 9. Luồng xử lý

### 9.1 Gửi tin nhắn (realtime)

```mermaid
sequenceDiagram
    participant C1 as Client (Sender)
    participant WS as WebSocket
    participant MS as MessageService
    participant DB as MongoDB
    participant RMQ as RabbitMQ
    participant MC as MessageConsumer
    participant REDIS as Redis Pub/Sub
    participant C2 as Client (Recipient)

    C1->>WS: SEND_MESSAGE
    WS->>MS: send_message()
    MS->>DB: Insert Message
    MS->>DB: Update Conversation (last_message)
    MS->>DB: Increment unread_count
    WS->>C1: MESSAGE_ACK
    WS->>RMQ: publish MESSAGE_SENT
    
    RMQ->>MC: consume MESSAGE_SENT
    MC->>DB: Get Message details
    MC->>REDIS: publish_to_user (recipients)
    REDIS->>WS: Message listener
    WS->>C2: NEW_MESSAGE
```

### 9.2 Đánh dấu đã xem

```mermaid
sequenceDiagram
    participant C1 as Client (Reader)
    participant API as REST API
    participant MS as MessageService
    participant DB as MongoDB
    participant RMQ as RabbitMQ
    participant MC as MessageConsumer
    participant REDIS as Redis
    participant C2 as Client (Sender)

    C1->>API: PATCH /seen?message_id=xxx
    API->>MS: mark_conversation_seen()
    MS->>DB: Update participant (unread=0)
    MS->>DB: Update messages (status=SEEN)
    API->>RMQ: publish MESSAGE_SEEN
    
    RMQ->>MC: consume MESSAGE_SEEN
    MC->>REDIS: publish_to_user (sender)
    REDIS->>C2: MESSAGE_SEEN event
```

### 9.3 Typing indicator

```mermaid
sequenceDiagram
    participant C1 as Client (Typing)
    participant WS as WebSocket
    participant RMQ as RabbitMQ
    participant MC as MessageConsumer
    participant REDIS as Redis
    participant C2 as Client (Viewing)

    C1->>WS: TYPING
    WS->>RMQ: publish TYPING
    RMQ->>MC: consume TYPING
    MC->>REDIS: publish_to_user (others)
    REDIS->>WS: Typing payload
    WS->>C2: TYPING event
```

---

## 10. File Structure

```
backend/app/
├── models/
│   └── conversation.py          # Data models & schemas
├── api/routes/
│   ├── messages.py              # REST API endpoints
│   └── websocket.py             # WebSocket endpoint
├── services/
│   ├── message_service.py       # Business logic
│   ├── message_consumer.py      # RabbitMQ consumer
│   ├── rabbitmq.py              # RabbitMQ publisher
│   └── redis_client.py          # Redis service
└── core/
    └── config.py                # Settings (RABBITMQ_URL, etc.)
```

---

## Appendix A: Error Handling

### API Errors

| HTTP Code | Scenario |
|-----------|----------|
| 400 | Invalid input (missing content/media, self-message) |
| 403 | Not a participant, not admin |
| 404 | Conversation/User not found |

### WebSocket Errors

```json
{
  "type": "ERROR",
  "message": "Error description"
}
```

---

## Appendix B: Configuration

```env
# .env
RABBITMQ_URL=amqp://user:pass@localhost:5672/
REDIS_URL=redis://localhost:6379/0
MONGODB_URL=mongodb://localhost:27017/aov_db
```

---

## Appendix C: Testing

### Test WebSocket với wscat

```bash
# Install
npm install -g wscat

# Connect
wscat -c "ws://localhost:8000/api/v1/ws?token=<jwt_token>"

# Send message
{"type": "SEND_MESSAGE", "conversationId": "xxx", "content": "Hello", "tempId": "temp1"}

# Typing
{"type": "TYPING", "conversationId": "xxx"}
```

### Health Check

```
GET /api/v1/ws/health
```

Response:
```json
{
  "status": "ok",
  "redis_connected": true,
  "active_connections": 5
}
```
