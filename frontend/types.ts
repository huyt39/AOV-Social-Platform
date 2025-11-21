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

export enum Role {
  TOP = 'Đường Caesar',
  JUNGLE = 'Rừng',
  MID = 'Đường Giữa',
  AD = 'Xạ Thủ',
  SUPPORT = 'Trợ Thủ',
  FILL = 'Mọi vị trí'
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  rank: Rank;
  mainRole: Role;
  winRate: number;
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
  type: 'LFG' | 'HIGHLIGHT' | 'DISCUSSION'; // Looking For Group
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}
