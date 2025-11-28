
# **BACKEND REQUIREMENTS SPECIFICATION — ARENAHUB**

## **1. Tổng quan Kiến trúc (Architecture Overview)**

### **Mô hình**

* **RESTful API**.

### **Database**

* **NoSQL (MongoDB)**
  Quản lý toàn bộ dữ liệu: Users/Profiles, Feed (bài viết), Comments, LFG (lobbies), AI chat/history.
  - Sử dụng TTL Index cho: cache AI guide (24h), rate limit theo cửa sổ 1 giờ, dọn dẹp dữ liệu cũ (lobbies hết hạn, sessions) nếu cần.
  - Quy ước ID: ưu tiên `_id` là UUID string thống nhất FE/BE (không dùng ObjectId). Nếu dùng ObjectId, cần trường `user_id` dạng UUID riêng cho liên kết. Khuyến nghị: dùng `_id` = UUID string.
  - Schema: ưu tiên embed cho dữ liệu nhỏ/trung bình (vd: `users.hero_stats`, `lobbies.members`) để cập nhật atomic; tách collection riêng khi kích thước lớn hoặc truy vấn chuyên biệt (likes, comments).

### **AI Gateway**

* Backend đóng vai trò trung gian gọi Google Gemini API.
* **Tuyệt đối không cho Frontend gọi trực tiếp** → Tránh lộ API Key.

---

## **2. Module Authentication & User (Hồ Sơ Game Thủ)**

### **Frontend liên quan**

`components/Profile.tsx`, `types.ts`

### **Data Model: `User`**

| Field                      | Type                           | Notes                            |
| -------------------------- | ------------------------------ | -------------------------------- |
| id                         | UUID                           | PK                               |
| username                   | string                         |                                  |
| password_hash              | string                         |                                  |
| email                      | string                         |                                  |
| in_game_name               | string                         | Từ LLM extraction                |
| avatar_url                 | string                         |                                  |
| rank      *                 | Enum(BRONZE → CONQUEROR)       | Từ LLM extraction                  |
| main_role                  | Enum(TOP, JUNGLE, MID, AD, SP) |                                  |
| level         *             | int                            | Từ LLM extraction                |
| profile_screenshot_url     | string                         | Ảnh hồ sơ game để verify         |
| profile_verified           | boolean                        | Đã xác thực hồ sơ chưa           |
| profile_verified_at        | timestamp                      | Thời điểm xác thực               |

#### **Stats**

* win_rate (float)
* total_matches (int)
* credibility_score (int) - Uy tín người chơi

#### **Xác thực Hồ Sơ Game Thủ bằng LLM**

**Vấn đề**: Không có API công khai để lấy thông tin người chơi từ Liên Quân Mobile.

**Giải pháp**: 
* Người dùng **bắt buộc chụp ảnh màn hình** hồ sơ trong game khi đăng ký
* Backend sử dụng **Gemini Vision API** để trích xuất thông tin từ ảnh

**Các trường cần trích xuất**:
1. Tên người chơi (in_game_name)
2. Level (level)
3. Số trận (total_matches)
4. Tỷ lệ thắng (win_rate)
5. Uy tín (credibility_score)

**Xử lý**:
* Nếu Gemini **không nhận diện đủ 5 trường** → trả lỗi và yêu cầu gửi lại ảnh
* Nếu thành công → tự động điền vào profile người dùng
* Ảnh gốc được lưu vào storage để xác minh sau này

### **Data Model: `UserHeroStats`**

| Field         | Type   |
| ------------- | ------ |
| user_id       | UUID   |
| hero_name     | string |
| matches_count | int    |
| win_rate      | float  |

---

### **API Endpoints**

| Method | Endpoint                    | Mô tả                                              |
| ------ | --------------------------- | -------------------------------------------------- |
| POST   | `/auth/register`            | Đăng ký (validate rank + role hợp lệ)              |
| POST   | `/auth/login`               | Trả JWT Token                                      |
| POST   | `/auth/verify-profile`      | Upload ảnh hồ sơ game, trích xuất bằng Gemini LLM |
| GET    | `/users/me`                 | Lấy thông tin đầy đủ (Stats + Top Heroes)          |
| PUT    | `/users/me`                 | Cập nhật Avatar, Rank, Main Role                   |
| GET    | `/users/:id/stats`          | Dữ liệu cho PieChart + Tướng tủ                    |

#### **Chi tiết: POST `/auth/verify-profile`**

**Input** (multipart/form-data):
```json
{
  "profile_screenshot": "file (jpg/png)",
  "user_id": "UUID (optional khi đã login)"
}
```

**Logic Backend**:
1. Validate file (kích thước < 5MB, định dạng hợp lệ)
2. Upload ảnh lên storage (S3/Cloudinary)
3. Gọi Gemini Vision API với prompt:
   ```
   "Phân tích ảnh màn hình hồ sơ game Liên Quân Mobile này và trích xuất CHÍNH XÁC các thông tin sau dưới dạng JSON:
   - in_game_name (string): Tên người chơi
   - level (int): Cấp độ
   - total_matches (int): Tổng số trận
   - win_rate (float): Tỷ lệ thắng (%)
   - credibility_score (int): Điểm uy tín
   
   Nếu THIẾU BẤT KỲ trường nào, trả về: { \"error\": \"Không đủ thông tin\" }"
   ```
4. Parse JSON response từ Gemini
5. Nếu có `error` → HTTP 400 với message yêu cầu chụp lại
6. Nếu thành công → Lưu vào DB: cập nhật `users.in_game_name`, `users.level`, `users.stats` (win_rate, total_matches, credibility_score), `users.profile_verified = true`, `users.profile_verified_at`, `users.profile_screenshot_url`; sau đó trả về dữ liệu đã lưu

**Output** (Success):
```json
{
  "success": true,
  "data": {
    "in_game_name": "BestValheinVN",
    "level": 30,
    "total_matches": 1245,
    "win_rate": 52.5,
    "credibility_score": 95,
    "verified_at": "2024-01-15T10:30:00Z",
    "screenshot_url": "https://storage.../profile_123.jpg"
  }
}
```

**Output** (Error):
```json
{
  "success": false,
  "error": "Không nhận diện đủ thông tin hồ sơ. Vui lòng chụp rõ hơn các thông tin: Tên, Level, Số trận, Tỷ lệ thắng, Uy tín.",
  "missing_fields": ["credibility_score", "win_rate"]
}
```

---

## **3. Module Social Feed (Bảng Tin)**

### **Frontend liên quan**

`components/Feed.tsx`, `types.ts`

### **Data Model: `Post`**

* id
* user_id
* content (text)
* media_url
* type: Enum(LFG, HIGHLIGHT, DISCUSSION, NONE)
* created_at
* like_count
* comment_count

---

### **API Endpoints**

| Method | Endpoint              | Mô tả                                             |
| ------ | --------------------- | ------------------------------------------------- |
| GET    | `/posts`              | Lấy danh sách bài viết (pagination + filter type) |
| POST   | `/posts`              | Tạo bài viết mới                                  |
| POST   | `/posts/:id/like`     | Like/Unlike                                       |
| GET    | `/posts/:id/comments` | Lấy bình luận                                     |
| POST   | `/posts/:id/comments` | Gửi bình luận                                     |

---

## **4. Module LFG (Looking For Group - Tìm Trận)**

### **Frontend**

`components/LFG.tsx`

### **Logic nghiệp vụ**

Trạng thái bài đăng LFG:

* **OPEN** – còn slot
* **FULL** – đủ người
* **CLOSED** – chủ phòng đóng

Nút **XIN SLOT** gọi API gửi yêu cầu tham gia.

---

### **API Endpoints**

| Method | Endpoint                                                 | Mô tả                                        |
| ------ | -------------------------------------------------------- | -------------------------------------------- |
| GET    | `/lobbies`                                               | Lọc danh sách LFG (type = LFG)               |
|        | → Trả thêm: `current_slots`, `max_slots`, `needed_roles` |                                              |
| POST   | `/lobbies/:id/join`                                      | Gửi yêu cầu xin slot                         |
| POST   | `/lobbies/:id/approve`                                   | Chủ phòng duyệt                              |
| GET    | `/system/online-count`                                   | Trả số người online (fake hoặc socket count) |

---

## **5. Module AI Coach & Guide (Gemini Integration)**

### **Frontend**

`components/Guide.tsx`, `components/AICoach.tsx`, `services/geminiService.ts`

### ❗ Yêu cầu quan trọng

Frontend đang gọi Gemini trực tiếp → phải chuyển toàn bộ sang Backend.

---

### **AI Gateway Service**

Backend sử dụng thư viện: `google-generativeai` (Python SDK)

**Các tính năng sử dụng Gemini**:
1. **Text Generation**: AI Coach, Hero Guide
2. **Vision API**: Trích xuất thông tin hồ sơ từ ảnh chụp màn hình (Profile Verification)

---

### **API Endpoints**

#### **1. POST `/ai/guide`**

Input:

```json
{ "hero_name": "Valhein" }
```

**Logic Backend**

1. Validate hero_name hợp lệ
2. Prompt:
   `"Bạn là HLV Liên Quân... phân tích tướng {hero_name}..."`
3. Gọi Gemini API
4. Cache vào Mongo 24h (TTL index trên trường `expires_at`)
5. Output: Markdown string

---

#### **2. POST `/ai/chat`**

Input:

```json
{
  "message": "lên đồ cho Murad sao hợp meta?",
  "history": []
}
```

**Logic Backend**

* Kiểm tra rate limit: 20 messages/hour
* Duy trì context (server-side)
* Inject system prompt: `"Bạn là trợ lý AI dùng ngôn ngữ game thủ..."`
* Gọi Gemini → trả về reply

---

## **6. Module System & Metadata**

Frontend: `components/Navigation.tsx`, `constants.ts`

### **API Endpoints**

| Method | Endpoint           | Mô tả                        |
| ------ | ------------------ | ---------------------------- |
| GET    | `/metadata/heroes` | Trả danh sách tướng và class |
| GET    | `/health`          | Health check                 |

---

## **7. Yêu cầu Phi Chức Năng (Non-Functional Requirements)**

### **Security**

* Mọi API (trừ Register/Login) yêu cầu JWT
* Rate Limit mạnh cho `/ai/*`
* Rate limit và cache thực hiện bằng Mongo (counter + TTL index), không sử dụng Redis trong MVP
* Validate file upload:
  - Kích thước tối đa: 5MB
  - Định dạng cho phép: JPG, PNG
  - Kiểm tra MIME type thực tế (không chỉ extension)
* Lưu trữ ảnh profile an toàn (S3/Cloudinary với signed URLs)

### **Performance**

* API Feed: **< 200ms**
* API AI: **< 3–5s** (ưu tiên stream)

### **Real-time (Phase 2 - optional)**

Sử dụng WebSocket:

* Thông báo xin slot LFG
* Chat phòng
* Cập nhật số online real-time

---

## **Mongo Collections & Indexes (MVP)**

* `users`
  - Trường chính: username (unique), email (unique), password_hash, in_game_name, avatar_url, rank, main_role, level, profile_screenshot_url, profile_verified, profile_verified_at, stats{win_rate,total_matches,credibility_score}, hero_stats[] (name, matches_count, win_rate)
  - Index: username unique, email unique
* `posts`
  - Trường: user_id, content, media_url, type, created_at, like_count, comment_count
  - Index: type, created_at desc, user_id
* `post_likes`
  - Trường: post_id, user_id, created_at
  - Index: unique compound (post_id, user_id) để idempotent like/unlike
* `comments`
  - Trường: post_id, user_id, content, created_at
  - Index: post_id, created_at
* `lobbies`
  - Trường: owner_id, title, description, needed_roles[], max_slots, members[] (user_id, status), status (OPEN/FULL/CLOSED), created_at, updated_at, expires_at (optional)
  - Index: status, created_at, owner_id, TTL trên `expires_at` nếu áp dụng
* `ai_chat_history`
  - Trường: user_id, session_id, messages[] (role, content, ts)
  - Index: user_id, session_id (TTL optional để dọn sau N ngày)
* `ai_guides_cache`
  - Trường: hero_name (unique), md_content, expires_at
  - Index: unique (hero_name), TTL trên `expires_at`
* `rate_limits`
  - Trường: key (user_id:endpoint hoặc ip:endpoint), window_start, count
  - Index: unique (key, window_start), TTL trên `window_start`
* `metadata_heroes`
  - Trường: name, class, aliases
  - Index: name

---

## **JSON Response Mẫu — `GET /users/me`**

```json
{
  "id": "u1",
  "name": "BestValheinVN",
  "avatar": "https://...",
  "rank": "DIAMOND",
  "rank_tier": 3,
  "main_role": "AD",
  "server": "Mặt Trời",
  "level": 30,
  "profile_verified": true,
  "profile_verified_at": "2024-01-15T10:30:00Z",
  "profile_screenshot_url": "https://storage.../profile_u1.jpg",
  "stats": {
    "win_rate": 52.5,
    "total_matches": 1245,
    "credibility_score": 95
  },
  "top_heroes": [
    { "name": "Valhein", "matches": 120, "win_rate": 58 },
    { "name": "Murad", "matches": 85, "win_rate": 62 }
  ]
}
```