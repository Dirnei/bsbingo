export interface GroupSummary {
  id: string;
  name: string;
  description: string;
  wordCount: number;
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

export async function fetchGroups(): Promise<GroupSummary[]> {
  const res = await fetch(`${BASE_URL}/groups`);
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
}

export interface ApiError {
  error: string;
}

export async function createGroup(data: CreateGroupRequest): Promise<GroupSummary> {
  const res = await fetch(`${BASE_URL}/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch(`${BASE_URL}/groups/${encodeURIComponent(groupId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch(`${BASE_URL}/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Gruppe nicht gefunden');
    throw new Error(`Failed to delete group: ${res.status}`);
  }
}
