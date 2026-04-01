// Mock authentication system for prototype
// In production, this would use Lovable Cloud authentication

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

const USERS_KEY = 'medical_chat_users';
const CURRENT_USER_KEY = 'medical_chat_current_user';

export const authService = {
  // Get all users from localStorage
  getUsers(): User[] {
    const users = localStorage.getItem(USERS_KEY);
    return users ? JSON.parse(users) : [];
  },

  // Save users to localStorage
  saveUsers(users: User[]): void {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  // Get current user
  getCurrentUser(): User | null {
    const user = localStorage.getItem(CURRENT_USER_KEY);
    return user ? JSON.parse(user) : null;
  },

  // Set current user
  setCurrentUser(user: User | null): void {
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
  },

  // Register new user
  register(email: string, password: string, name: string, role: UserRole = 'user'): User {
    const users = this.getUsers();
    
    if (users.find(u => u.email === email)) {
      throw new Error('User already exists');
    }

    const newUser: User = {
      id: crypto.randomUUID(),
      email,
      name,
      role,
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    this.saveUsers(users);
    return newUser;
  },

  // Login user
  login(email: string, password: string): User {
    const users = this.getUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) {
      throw new Error('Invalid credentials');
    }

    this.setCurrentUser(user);
    return user;
  },

  // Logout
  logout(): void {
    this.setCurrentUser(null);
  },

  // Check if user is admin
  isAdmin(user: User | null): boolean {
    return user?.role === 'admin';
  },
};

// Initialize with a default admin user for testing
if (authService.getUsers().length === 0) {
  authService.register('admin@medical.com', 'admin123', 'Admin User', 'admin');
  authService.register('user@medical.com', 'user123', 'Regular User', 'user');
}
