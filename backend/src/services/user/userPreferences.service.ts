/**
 * User Preferences Service
 *
 * Manages user preferences like language, theme, etc.
 * REDO 8: Full DB persistence with in-memory cache for performance
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
   * Set a user preference value with DB persistence
   */
  async setPreference<K extends keyof UserPreference>(userId: string, key: K, value: UserPreference[K]): Promise<void> {
    const prefs = await this.getAllPreferences(userId);
    prefs[key] = value;
    this.cache.set(userId, prefs);

    // REDO 8: Persist to DB
    try {
      await prisma.userPreferences.upsert({
        where: { userId },
        create: {
          userId,
          language: prefs.language,
          theme: prefs.theme,
          timezone: prefs.timezone,
          emailNotificationsEnabled: prefs.notifications,
        },
        update: {
          language: prefs.language,
          theme: prefs.theme,
          timezone: prefs.timezone,
          emailNotificationsEnabled: prefs.notifications,
        },
      });
    } catch (error) {
      console.warn('[UserPreferences] Failed to persist to DB:', error);
      // Continue with cache-only - don't throw
    }
  }

  /**
   * Get all preferences for a user
   */
  async getAllPreferences(userId: string): Promise<UserPreference> {
    // Check cache first
    if (this.cache.has(userId)) {
      return this.cache.get(userId)!;
    }

    // REDO 8: Load from UserPreferences table
    try {
      const dbPrefs = await prisma.userPreferences.findUnique({
        where: { userId },
      });

      if (dbPrefs) {
        const prefs: UserPreference = {
          language: dbPrefs.language,
          theme: dbPrefs.theme,
          timezone: dbPrefs.timezone,
          notifications: dbPrefs.emailNotificationsEnabled,
        };
        this.cache.set(userId, prefs);
        return prefs;
      }

      // No preferences found - create with defaults
      const prefs = { ...DEFAULT_PREFERENCES };
      this.cache.set(userId, prefs);

      // Optionally create default record in DB (fire-and-forget)
      prisma.userPreferences.create({
        data: {
          userId,
          language: prefs.language,
          theme: prefs.theme,
          timezone: prefs.timezone,
          emailNotificationsEnabled: prefs.notifications,
        },
      }).catch(() => {
        // Ignore - user record might not exist yet
      });

      return prefs;
    } catch (error) {
      console.warn('[UserPreferences] Failed to load from DB:', error);
      return { ...DEFAULT_PREFERENCES };
    }
  }

  /**
   * Get user's preferred language
   */
  async getLanguage(userId: string): Promise<string> {
    return this.getPreference(userId, 'language');
  }

  /**
   * Invalidate cache for a user (call after external preference changes)
   */
  invalidateCache(userId: string): void {
    this.cache.delete(userId);
  }
}

// Singleton removed - use container.getUserPreferences() instead

export default UserPreferencesService;
