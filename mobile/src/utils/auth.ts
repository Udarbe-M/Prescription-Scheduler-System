import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';

const USERS_KEY = '@users';
const CURRENT_USER_KEY = '@current_user';

interface StoredUser extends User {
  password: string;
}

type AuthListener = (user: User | null) => void;
const authListeners: AuthListener[] = [];

export const subscribeToAuthChanges = (listener: AuthListener) => {
  authListeners.push(listener);
  return () => {
    const index = authListeners.indexOf(listener);
    if (index > -1) {
      authListeners.splice(index, 1);
    }
  };
};

const notifyAuthChange = (user: User | null) => {
  authListeners.forEach(listener => listener(user));
};

export const register = async (
  email: string,
  password: string,
  name: string
): Promise<{ success: boolean; message: string; user?: User }> => {
  try {
    if (!email || !password || !name) {
      return { success: false, message: 'All fields are required' };
    }

    if (password.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters' };
    }

    if (!email.includes('@')) {
      return { success: false, message: 'Invalid email format' };
    }

    const usersData = await AsyncStorage.getItem(USERS_KEY);
    const users: StoredUser[] = usersData ? JSON.parse(usersData) : [];

    const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return { success: false, message: 'Email already registered' };
    }

    const newUser: StoredUser = {
      id: Date.now().toString(),
      email: email.toLowerCase(),
      name,
      password,
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));

    const { password: _, ...userWithoutPassword } = newUser;
    return {
      success: true,
      message: 'Registration successful',
      user: userWithoutPassword,
    };
  } catch (error) {
    console.error('Registration error:', error);
    return { success: false, message: 'Registration failed. Please try again.' };
  }
};

export const login = async (
  email: string,
  password: string
): Promise<{ success: boolean; message: string; user?: User }> => {
  try {
    if (!email || !password) {
      return { success: false, message: 'Email and password are required' };
    }

    const usersData = await AsyncStorage.getItem(USERS_KEY);
    const users: StoredUser[] = usersData ? JSON.parse(usersData) : [];

    const user = users.find(
      u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );

    if (!user) {
      return { success: false, message: 'Invalid email or password' };
    }

    const { password: _, ...userWithoutPassword } = user;
    await AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userWithoutPassword));

    notifyAuthChange(userWithoutPassword);

    return {
      success: true,
      message: 'Login successful',
      user: userWithoutPassword,
    };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, message: 'Login failed. Please try again.' };
  }
};

export const logout = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(CURRENT_USER_KEY);
    notifyAuthChange(null);
  } catch (error) {
    console.error('Logout error:', error);
  }
};

export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const userData = await AsyncStorage.getItem(CURRENT_USER_KEY);
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
};

export const isAuthenticated = async (): Promise<boolean> => {
  const user = await getCurrentUser();
  return user !== null;
};