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

export async function deleteGroup(groupId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Gruppe nicht gefunden');
    throw new Error(`Failed to delete group: ${res.status}`);
  }
}
