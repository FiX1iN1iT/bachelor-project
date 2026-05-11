export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
}

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}

export const authService = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  getCurrentUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  },

  async login(username: string, password: string): Promise<User> {
    const body = new URLSearchParams({ username, password });
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail ?? 'Неверный логин или пароль');
    }

    const { access_token } = (await res.json()) as { access_token: string };
    const payload = decodeJwtPayload(access_token);
    const sub = payload['sub'] as string;
    const role = (payload['role'] as UserRole) ?? 'user';
    const fullName = (payload['full_name'] as string) ?? '';

    const user: User = {
      id: sub,
      fullName,
      role,
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  },

  async register(username: string, password: string, fullName: string): Promise<void> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, full_name: fullName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail ?? 'Ошибка регистрации');
    }
  },

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  isAdmin(user: User | null): boolean {
    return user?.role === 'admin';
  },
};
