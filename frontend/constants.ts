import { Rank, Role, User, Post } from './types';

// API Base URL - Use environment variable with localhost fallback for development
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const CURRENT_USER: User = {
  id: 'u1',
  name: 'BestValheinVN',
  avatar: 'https://picsum.photos/id/64/200/200',
  rank: Rank.DIAMOND,
  mainRole: Role.AD,
  winRate: 52.5
};

export const MOCK_USERS: Record<string, User> = {
  'u2': {
    id: 'u2',
    name: 'ThánhRừng2k',
    avatar: 'https://picsum.photos/id/1005/200/200',
    rank: Rank.MASTER,
    mainRole: Role.JUNGLE,
    winRate: 60.2
  },
  'u3': {
    id: 'u3',
    name: 'MidOrFeed',
    avatar: 'https://picsum.photos/id/1011/200/200',
    rank: Rank.PLATINUM,
    mainRole: Role.MID,
    winRate: 48.9
  },
  'u4': {
    id: 'u4',
    name: 'AliceSupport',
    avatar: 'https://picsum.photos/id/1027/200/200',
    rank: Rank.CONQUEROR,
    mainRole: Role.SUPPORT,
    winRate: 65.0
  }
};

export const MOCK_POSTS: Post[] = [
  {
    id: 'p1',
    userId: 'u2',
    user: MOCK_USERS['u2'],
    content: 'Cần tìm team leo Cao Thủ tối nay. Mình đi rừng Nakroth thông thạo S. Ai đi mid cứng pm nhé!',
    type: 'LFG',
    likes: 12,
    comments: 4,
    timestamp: '10 phút trước'
  },
  {
    id: 'p2',
    userId: 'u4',
    user: MOCK_USERS['u4'],
    content: 'Mùa này Alice lên đồ phép hay tank thì ngon hơn mọi người? Vừa bị nerf nhẹ chiêu 2 xong.',
    type: 'DISCUSSION',
    likes: 45,
    comments: 23,
    timestamp: '1 giờ trước'
  },
  {
    id: 'p3',
    userId: 'u3',
    user: MOCK_USERS['u3'],
    content: 'Highlight Penta Kill với Tulen nè anh em ơi! 🔥',
    image: 'https://picsum.photos/id/1015/600/300',
    type: 'HIGHLIGHT',
    likes: 128,
    comments: 10,
    timestamp: '3 giờ trước'
  }
];

export const HERO_LIST = [
  "Florentino", "Nakroth", "Murad", "Raz", "Liliana", "Elsu", "Hayate", "Richter", "Veres", "Yena"
];
