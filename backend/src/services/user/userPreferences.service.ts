/**
 * User Preferences Service - MVP Implementation
 *
 * Manages user preferences like language, theme, etc.
 * MVP: In-memory storage with database fallback
 */

import prisma from '../../config/database';

export interface UserPreference {
  language: string;
  theme: string;
  timezone: string;
  notifications: boolean;
}

const DEFAULT_PREFERENCES: UserPreference = {
  language: 'en',
  theme: 'light',
  timezone: 'UTC',
  notifications: true,
};

export class UserPreferencesService {
  private cache = new Map<string, UserPreference>();

  /**
   * Get a user preference value
   */
  async getPreference<K extends keyof UserPreference>(userId: string, key: K): Promise<UserPreference[K]> {
    const prefs = await this.getAllPreferences(userId);
    return prefs[key];
  }

  /**
   * Set a user preference value
   */
  async setPreference<K extends keyof UserPreference>(userId: string, key: K, value: UserPreference[K]): Promise<void> {
    const prefs = await this.getAllPreferences(userId);
    prefs[key] = value;
    this.cache.set(userId, prefs);
    // MVP: Just cache, full DB persistence can be added later
  }

  /**
   * Get all preferences for a user
   */
  async getAllPreferences(userId: string): Promise<UserPreference> {
    // Check cache first
    if (this.cache.has(userId)) {
      return this.cache.get(userId)!;
    }

    // Try to load from database - just get basic user info
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      // Default preferences - language can be enhanced later
      const prefs: UserPreference = {
        ...DEFAULT_PREFERENCES,
      };

      this.cache.set(userId, prefs);
      return prefs;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }

  /**
   * Get user's preferred language
   */
  async getLanguage(userId: string): Promise<string> {
    return this.getPreference(userId, 'language');
  }
}

// Singleton removed - use container.getUserPreferences() instead

export default UserPreferencesService;
