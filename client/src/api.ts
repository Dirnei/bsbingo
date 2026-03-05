export interface GroupSummary {
  id: string;
  name: string;
  description: string;
  wordCount: number;
  createdBy: string | null;
  visibility: string;
}

export interface BoardCell {
  index: number;
  text: string;
  isFreeSpace: boolean;
}

export interface BoardResponse {
  cells: BoardCell[];
}

const BASE_URL = '/api';

// --- Auth ---

const TOKEN_KEY = 'bsbingo_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatar: string;
  provider: string;
}

export async function fetchMe(): Promise<UserInfo | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
      return null;
    }
    return null;
  }
  return res.json();
}

export function getLoginUrl(provider: 'github' | 'google'): string {
  return `${BASE_URL}/auth/login/${provider}`;
}

export async function fetchGroups(): Promise<GroupSummary[]> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/groups`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch groups: ${res.status}`);
  return res.json();
}

export async function fetchBoard(groupId: string): Promise<BoardResponse> {
  const res = await fetch(`${BASE_URL}/game/new?groupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to fetch board: ${res.status}`);
  return res.json();
}

export interface CreateGroupRequest {
  name: string;
  description: string;
  words: string[];
  visibility?: string;
}

export interface ApiError {
  error: string;
}

export async function createGroup(data: CreateGroupRequest): Promise<GroupSummary> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/groups`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as ApiError;
    throw new Error(body.error || `Failed to create group: ${res.status}`);
  }
  return res.json();
}

export interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  words: string[];
  visibility: string;
}

export async function fetchGroup(groupId: string): Promise<GroupDetail> {
  const res = await fetch(`${BASE_URL}/groups/${encodeURIComponent(groupId)}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Gruppe nicht gefunden');
    throw new Error(`Failed to fetch group: ${res.status}`);
  }
  return res.json();
}

export async function updateGroup(groupId: string, data: CreateGroupRequest): Promise<GroupSummary> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/groups/${encodeURIComponent(groupId)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Gruppe nicht gefunden');
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as ApiError;
    throw new Error(body.error || `Failed to update group: ${res.status}`);
  }
  return res.json();
}

export async function deleteGroup(groupId: string): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Gruppe nicht gefunden');
    throw new Error(`Failed to delete group: ${res.status}`);
  }
}
