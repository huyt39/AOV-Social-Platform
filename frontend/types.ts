export enum Rank {
  BRONZE = 'Đồng',
  SILVER = 'Bạc',
  GOLD = 'Vàng',
  PLATINUM = 'Bạch Kim',
  DIAMOND = 'Kim Cương',
  VETERAN = 'Tinh Anh',
  MASTER = 'Cao Thủ',
  CONQUEROR = 'Thách Đấu'
}

// Game position/role (renamed for clarity)
export enum GameRole {
  TOP = 'Đường Caesar',
  JUNGLE = 'Rừng',
  MID = 'Đường Giữa',
  AD = 'Xạ Thủ',
  SUPPORT = 'Trợ Thủ',
  FILL = 'Mọi vị trí'
}

// Backward compatibility alias
export const Role = GameRole;

// User permission roles for RBAC
export enum UserRole {
  GUEST = 'GUEST',
  USER = 'USER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN'
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  rank: Rank;
  mainRole: GameRole;
  winRate: number;
  role?: UserRole;
}

export interface Post {
  id: string;
  userId: string;
  user: User;
  content: string;
  image?: string;
  likes: number;
  comments: number;
  timestamp: string;
  type: 'LFG' | 'HIGHLIGHT' | 'DISCUSSION';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

// ============== FORUM TYPES ==============

export enum ThreadStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  HIDDEN = 'HIDDEN'
}

export enum ForumCommentStatus {
  ACTIVE = 'ACTIVE',
  HIDDEN = 'HIDDEN',
  DELETED = 'DELETED'
}

export interface ForumCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  threadCount: number;
  displayOrder: number;
  createdAt: string;
}

export interface ForumThreadAuthor {
  id: string;
  username: string;
  avatarUrl?: string;
  rank?: string;
  level?: number;
}

export interface ForumThreadListItem {
  id: string;
  title: string;
  contentPreview: string;
  author: ForumThreadAuthor;
  categoryId: string;
  status: ThreadStatus;
  viewCount: number;
  commentCount: number;
  likeCount: number;
  createdAt: string;
  lastActivityAt: string;
}

export interface ForumThread {
  id: string;
  title: string;
  content: string;
  authorId: string;
  author: ForumThreadAuthor;
  categoryId: string;
  categoryName?: string;
  status: ThreadStatus;
  mediaUrls: string[];
  viewCount: number;
  commentCount: number;
  likeCount: number;
  isLiked: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}

export interface ForumCommentAuthor {
  id: string;
  username: string;
  avatarUrl?: string;
  rank?: string;
}

export interface ForumComment {
  id: string;
  threadId: string;
  authorId: string;
  author: ForumCommentAuthor;
  content: string;
  parentId?: string;
  depth: number;
  replyToUserId?: string;
  replyToUsername?: string;
  mediaUrls: string[];
  likeCount: number;
  replyCount: number;
  isLiked: boolean;
  status: ForumCommentStatus;
  createdAt: string;
  replies: ForumComment[];
}

// API Response types
export interface ForumCategoriesResponse {
  data: ForumCategory[];
  count: number;
}

export interface ForumThreadsResponse {
  data: ForumThreadListItem[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface ForumCommentsResponse {
  data: ForumComment[];
  nextCursor?: string;
  hasMore: boolean;
}

// Create/Update types
export interface CreateThreadInput {
  title: string;
  content: string;
  mediaUrls?: string[];
}

export interface CreateCommentInput {
  content: string;
  mediaUrls?: string[];
}

export interface ReplyCommentInput {
  content: string;
  mediaUrls?: string[];
}
