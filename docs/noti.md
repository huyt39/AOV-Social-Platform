# Tài liệu Hệ thống Notification

## Tổng quan

Hệ thống Notification của ArenaHub sử dụng kiến trúc event-driven với các thành phần:

- **RabbitMQ**: Message broker cho việc publish/consume events
- **MongoDB**: Lưu trữ persistent notifications
- **Redis**: Pub/Sub cho realtime delivery + tracking user online state
- **WebSocket**: Realtime push notifications đến client

## Kiến trúc

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│  Frontend   │────▶│  FastAPI    │────▶│     RabbitMQ        │
│  (React)    │     │  Backend    │     │  (Topic Exchange)   │
└─────────────┘     └─────────────┘     └──────────┬──────────┘
                                                   │
                                                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│  Frontend   │◀────│  WebSocket  │◀────│  Notification       │
│  User B     │     │  Gateway    │     │  Consumer           │
└─────────────┘     └──────┬──────┘     └──────────┬──────────┘
                           │                       │
                           ▼                       ▼
                    ┌─────────────┐         ┌─────────────┐
                    │   Redis     │         │   MongoDB   │
                    │  Pub/Sub    │         │  Storage    │
                    └─────────────┘         └─────────────┘
```

## Sequence Diagram: Like bài viết

```
User A                API                RabbitMQ          Consumer            MongoDB            Redis              WebSocket          User B
  │                    │                    │                 │                  │                  │                    │                │
  │──POST /like───────▶│                    │                 │                  │                  │                    │                │
  │                    │──publish_event────▶│                 │                  │                  │                    │                │
  │◀───response────────│                    │                 │                  │                  │                    │                │
  │                    │                    │──post.liked────▶│                  │                  │                    │                │
  │                    │                    │                 │──save────────────▶│                  │                    │                │
  │                    │                    │                 │                  │                  │                    │                │
  │                    │                    │                 │──is_online?──────────────────────────▶│                    │                │
  │                    │                    │                 │◀─────true─────────────────────────────│                    │                │
  │                    │                    │                 │──publish_notification─────────────────▶│                    │                │
  │                    │                    │                 │                  │                  │──push───────────────▶│                │
  │                    │                    │                 │                  │                  │                    │──notification──▶│
```

---

## Chi tiết luồng hoạt động

### Bước 1: User thực hiện action (Like bài viết)

**File:** `backend/app/api/routes/posts.py`

```python
@router.post("/{post_id}/like")
async def like_post(post_id: str, current_user: CurrentUser):
    # Tạo like record
    like = PostLike(post_id=post_id, user_id=current_user.id)
    await like.insert()
    
    # Tăng like_count
    post.like_count += 1
    await post.save()
    
    # Publish notification event (nếu không phải like bài của chính mình)
    if post.author_id != current_user.id:
        await publish_event(
            NotificationRoutingKey.POST_LIKED,
            {
                "post_id": post_id,
                "post_author_id": post.author_id,
                "actor_id": current_user.id,
                "actor_username": current_user.username,
            }
        )
```

### Bước 2: Publish event lên RabbitMQ

**File:** `backend/app/services/rabbitmq.py`

```python
class NotificationRoutingKey(str, Enum):
    POST_LIKED = "post.liked"
    POST_COMMENTED = "post.commented"
    POST_SHARED = "post.shared"
    COMMENT_REPLIED = "comment.replied"
    COMMENT_MENTIONED = "comment.mentioned"

EVENTS_EXCHANGE = "notification_events"  # Type: topic

async def publish_event(routing_key: NotificationRoutingKey, payload: dict):
    channel = await get_rabbitmq_channel()
    exchange = await channel.declare_exchange(
        EVENTS_EXCHANGE, 
        ExchangeType.TOPIC, 
        durable=True
    )
    
    await exchange.publish(
        Message(body=json.dumps(payload).encode()),
        routing_key=routing_key.value
    )
```

**Message payload:**
```json
{
    "post_id": "566256d2-8781-4abe-a8b3-ca79e3ed7e1d",
    "post_author_id": "0322141a-ec9e-4a23-a260-0d40b318987e",
    "actor_id": "7efb96bb-21c5-41c3-8053-8b9a5d9c17d4",
    "actor_username": "aduvip"
}
```

### Bước 3: Consumer xử lý event

**File:** `backend/app/services/notification_consumer.py`

```python
class NotificationConsumer:
    async def start(self):
        # Bind queue với routing patterns
        await queue.bind(exchange, routing_key="post.*")
        await queue.bind(exchange, routing_key="comment.*")
        
        await queue.consume(self._process_message)
    
    async def _process_message(self, message: IncomingMessage):
        routing_key = message.routing_key  # "post.liked"
        payload = json.loads(message.body)
        
        # Xác định notification type
        notification_type = self._get_notification_type(routing_key)
        
        # Lấy user_id người nhận
        user_id = payload["post_author_id"]
        
        # Tạo nội dung
        content = f"{payload['actor_username']} đã thích bài viết của bạn"
```

### Bước 4: Lưu Notification vào MongoDB

**File:** `backend/app/models/notification.py`

```python
class NotificationType(str, Enum):
    POST_LIKED = "post_liked"
    POST_COMMENTED = "post_commented"
    POST_SHARED = "post_shared"
    MENTIONED = "mentioned"
    REPLY_THREAD = "reply_thread"

class Notification(Document):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str           # Người nhận
    actor_id: str          # Người thực hiện
    type: NotificationType
    post_id: str | None = None
    comment_id: str | None = None
    content: str
    is_read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

### Bước 5: Check online và push realtime

**File:** `backend/app/services/redis_client.py`

```python
class RedisService:
    # Redis key patterns
    # user:{userId}:sockets → SET chứa socket IDs
    # notification:user:{userId} → Pub/Sub channel
    
    async def is_user_online(self, user_id: str) -> bool:
        count = await self.client.scard(f"user:{user_id}:sockets")
        return count > 0
    
    async def publish_notification(self, user_id: str, payload: dict) -> int:
        channel = f"notification:user:{user_id}"
        return await self.client.publish(channel, json.dumps(payload))
```

### Bước 6: WebSocket Gateway forward đến client

**File:** `backend/app/api/routes/websocket.py`

```python
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    # Xác thực JWT
    user = await verify_websocket_token(token)
    
    await websocket.accept()
    
    # Đăng ký socket với Redis
    socket_id = str(uuid.uuid4())
    await redis_service.add_socket(user.id, socket_id)
    
    # Subscribe vào Redis channel
    async def on_notification(data: dict):
        await websocket.send_json(data)
    
    pubsub = await redis_service.subscribe_user_notifications(
        user.id, 
        callback=on_notification
    )
    
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await redis_service.remove_socket(user.id, socket_id)
```

### Bước 7: Frontend hiển thị notification

**File:** `frontend/components/Header.tsx`

```typescript
// Fetch notifications qua REST API
const fetchNotifications = async () => {
    const response = await fetch(`${API_URL}/notifications?limit=10`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    setNotifications(data.data);
    setUnreadCount(data.unread_count);
};

// WebSocket cho realtime updates
const ws = new WebSocket(`ws://localhost:8000/api/v1/ws?token=${token}`);
ws.onmessage = (event) => {
    const notification = JSON.parse(event.data);
    setUnreadCount(prev => prev + 1);
};
```

---

## API Endpoints

### REST API

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/notifications` | Lấy danh sách thông báo (có pagination) |
| GET | `/notifications/unread-count` | Lấy số thông báo chưa đọc |
| PATCH | `/notifications/{id}/read` | Đánh dấu đã đọc 1 thông báo |
| PATCH | `/notifications/read-all` | Đánh dấu đã đọc tất cả |
| DELETE | `/notifications/{id}` | Xóa 1 thông báo |
| DELETE | `/notifications` | Xóa nhiều thông báo |

### WebSocket

| Endpoint | Mô tả |
|----------|-------|
| `ws://host/api/v1/ws?token={jwt}` | WebSocket connection với JWT auth |
| `GET /ws/health` | Health check WebSocket service |

---

## Notification Types

| Type | Routing Key | Trigger | Content example |
|------|------------|---------|-----------------|
| `post_liked` | `post.liked` | Like bài viết | "{user} đã thích bài viết của bạn" |
| `post_commented` | `post.commented` | Comment bài viết | "{user} đã bình luận bài viết của bạn" |
| `post_shared` | `post.shared` | Share bài viết | "{user} đã chia sẻ bài viết của bạn" |
| `mentioned` | `comment.mentioned` | @ mention trong comment | "{user} đã nhắc đến bạn trong một bình luận" |
| `reply_thread` | `comment.replied` | Reply comment | "{user} đã trả lời bình luận của bạn" |

---

## Cấu hình

### Environment Variables

```env
# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest
```

### Docker Compose

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
```

---

## File Structure

```
backend/
├── app/
│   ├── api/routes/
│   │   ├── posts.py              # Publish events khi like/share
│   │   ├── comments.py           # Publish events khi comment/reply/mention
│   │   ├── notifications.py      # REST API endpoints
│   │   └── websocket.py          # WebSocket gateway
│   ├── services/
│   │   ├── rabbitmq.py           # RabbitMQ connection & publish
│   │   ├── redis_client.py       # Redis online state & Pub/Sub
│   │   └── notification_consumer.py  # Event consumer
│   └── models/
│       └── notification.py       # Notification model & schemas

frontend/
└── components/
    └── Header.tsx                # Notification UI
```

---

## Testing

### Kiểm tra RabbitMQ
```bash
# Management UI
http://localhost:15672
# Login: guest/guest
```

### Kiểm tra Redis
```bash
docker exec -it redis redis-cli
> KEYS user:*
> PUBSUB CHANNELS
```

### Kiểm tra WebSocket
```bash
curl http://localhost:8000/api/v1/ws/health
# {"status":"ok","redis_connected":true}
```

### Test API
```bash
# Get notifications
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/notifications

# Get unread count
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/notifications/unread-count
```
