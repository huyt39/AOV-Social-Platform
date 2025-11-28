# ArenaHub Backend API Documentation

## Overview

Backend API cho ArenaHub - nền tảng social network cho game thủ Liên Quân Mobile.

## Authentication Endpoints

### 1. Verify Profile Screenshot

**POST** `/api/v1/auth/verify-profile`

Xác thực và trích xuất thông tin từ ảnh chụp màn hình hồ sơ game.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `profile_screenshot` (file) - JPG/PNG, max 5MB

**Response:**
```json
{
  "success": true,
  "data": {
    "in_game_name": "BestValheinVN",
    "level": 30,
    "rank": "DIAMOND",
    "total_matches": 1245,
    "win_rate": 52.5,
    "credibility_score": 95,
    "verified_at": "2024-01-15T10:30:00Z",
    "screenshot_url": "https://storage.../profile_123.jpg"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Không nhận diện đủ thông tin hồ sơ. Vui lòng chụp rõ hơn các thông tin: Tên người chơi, Rank, Level, Số trận, Tỷ lệ thắng, Uy tín"
}
```

**Status Codes:**
- `200`: Success
- `400`: Invalid file type, size, or insufficient data
- `500`: Gemini API error

---

### 2. Register User

**POST** `/api/v1/auth/register`

Đăng ký tài khoản người dùng mới với thông tin đã xác thực.

**Request:**
```json
{
  "username": "progamer123",
  "email": "user@example.com",
  "password": "SecurePass123",
  "main_role": "AD",
  "rank": "DIAMOND",
  "in_game_name": "BestValheinVN",
  "level": 30,
  "win_rate": 52.5,
  "total_matches": 1245,
  "credibility_score": 95,
  "profile_screenshot_url": "https://storage.../profile_123.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "progamer123",
    "email": "user@example.com",
    "in_game_name": "BestValheinVN",
    "rank": "DIAMOND",
    "main_role": "AD"
  }
}
```

**Validation:**
- `username`: 3-50 characters, alphanumeric + underscore
- `email`: Valid email format
- `password`: Minimum 8 characters, at least 1 uppercase and 1 number
- `rank`: Must be one of: BRONZE, SILVER, GOLD, PLATINUM, DIAMOND, VETERAN, MASTER, CONQUEROR
- `main_role`: Must be one of: TOP, JUNGLE, MID, AD, SUPPORT

**Status Codes:**
- `200`: Success
- `400`: Username or email already exists
- `422`: Validation error

---

### 3. Login

**POST** `/api/v1/auth/login`

Đăng nhập và nhận JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "progamer123",
    "email": "user@example.com",
    "in_game_name": "BestValheinVN",
    "rank": "DIAMOND",
    "main_role": "AD"
  }
}
```

**Status Codes:**
- `200`: Success
- `400`: Incorrect email/password or inactive user

---

## Data Models

### User

```typescript
{
  id: UUID;
  username: string;          // Unique
  email: string;             // Unique
  in_game_name: string;
  rank: RankEnum;
  main_role: RoleEnum;
  level: number;
  avatar_url?: string;
  profile_screenshot_url: string;
  profile_verified: boolean;
  profile_verified_at: datetime;
  win_rate: number;          // Percentage
  total_matches: number;
  credibility_score: number;
  is_active: boolean;
  created_at: datetime;
}
```

### Enums

**RankEnum:**
- BRONZE
- SILVER
- GOLD
- PLATINUM
- DIAMOND
- VETERAN
- MASTER
- CONQUEROR

**RoleEnum:**
- TOP
- JUNGLE
- MID
- AD
- SUPPORT

---

## Environment Variables

Required environment variables:

```bash
# Database
POSTGRES_SERVER=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=arenahub

# Security
SECRET_KEY=your_secret_key_here

# Gemini API (REQUIRED for profile verification)
GEMINI_API_KEY=your_gemini_api_key_here

# Frontend
FRONTEND_HOST=http://localhost:3001
```

---

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
uv sync
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update values:

```bash
cp ../.env.example ../.env
```

**Important:** Add your Gemini API key to `.env`:
```
GEMINI_API_KEY=your_actual_api_key
```

### 3. Run Migrations

```bash
# In backend directory
alembic revision --autogenerate -m "Add game profile fields to User"
alembic upgrade head
```

### 4. Start Development Server

```bash
# With Docker
docker compose watch

# Or locally
cd backend
source .venv/bin/activate
fastapi dev app/main.py
```

---

## API Documentation

Once the server is running, visit:

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "detail": "Error message here"
}
```

Common HTTP status codes:
- `200`: Success
- `400`: Bad Request (validation error, duplicate data)
- `401`: Unauthorized
- `404`: Not Found
- `422`: Unprocessable Entity (validation error)
- `500`: Internal Server Error

---

## Rate Limiting

Currently not implemented in MVP. Will be added in future versions using:
- Redis for distributed rate limiting
- Or MongoDB with TTL indexes

---

## Security

- Passwords are hashed using bcrypt
- JWT tokens expire in 8 days by default
- Profile screenshots should be stored in secure cloud storage (S3/Cloudinary)
- Gemini API key must be kept secret (server-side only)

---

## Testing

Run tests:

```bash
cd backend
bash ./scripts/test.sh
```

---

## Future Enhancements

- [ ] Implement cloud storage for profile screenshots
- [ ] Add rate limiting for AI endpoints
- [ ] Add caching for AI guide responses
- [ ] Implement WebSocket for real-time features
- [ ] Add social features (posts, comments, LFG)
