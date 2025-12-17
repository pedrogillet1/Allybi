import { PrismaClient } from '@prisma/client';
import geminiGateway from './geminiGateway.service';

const prisma = new PrismaClient();

/**
 * Profile Service for User Knowledge Gathering
 *
 * This service manages user profiles and personalizes AI interactions by:
 * 1. Storing custom instructions, preferences, and goals
 * 2. Building personalized system prompts from profile data
 * 3. Analyzing conversations to extract user insights automatically
 */
export class ProfileService {
  /**
   * Get a user's profile
   * @param userId - The user ID
   * @returns The user profile or null if not found
   */
  async getProfile(userId: string) {
    return prisma.userProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          }
        }
      }
    });
  }

  /**
   * Update a user's profile (creates if doesn't exist)
   * @param userId - The user ID
   * @param data - Profile data to update
   * @returns The updated profile
   */
  async updateProfile(userId: string, data: {
    name?: string;
    role?: string;
    organization?: string;
    expertiseLevel?: string;
    customInstructions?: string;
    writingStyle?: string;
    preferredTone?: string;
    coreGoals?: string;
  }) {
    return prisma.userProfile.upsert({
      where: { userId },
      update: {
        ...data,
        updatedAt: new Date(),
      },
      create: {
        userId,
        ...data,
      },
    });
  }

  /**
   * Delete a user's profile
   * @param userId - The user ID
   * @returns The deleted profile
   */
  async deleteProfile(userId: string) {
    return prisma.userProfile.delete({
      where: { userId },
    });
  }

  /**
   * Build a system prompt from user profile data
   * This injects personalization into AI responses
   *
   * @param profile - The user profile
   * @returns A formatted system prompt string
   */
  buildProfileSystemPrompt(profile: any | null): string {
    if (!profile) return '';

    const sections: string[] = [];
    sections.push('# User Profile Context\n');
    sections.push('The user has provided the following information about themselves:\n');

    // Basic profile info
    if (profile.name) {
      sections.push(`- Name: ${profile.name}`);
    }
    if (profile.role) {
      sections.push(`- Role/Profession: ${profile.role}`);
    }
    if (profile.organization) {
      sections.push(`- Organization: ${profile.organization}`);
    }
    if (profile.expertiseLevel) {
      sections.push(`- Expertise Level: ${profile.expertiseLevel}`);
    }

    // Preferences and instructions
    if (profile.customInstructions) {
      sections.push(`\n## Custom Instructions`);
      sections.push(profile.customInstructions);
    }

    if (profile.writingStyle) {
      sections.push(`\n## Preferred Writing Style`);
      sections.push(`Please respond in a ${profile.writingStyle} style.`);
    }

    if (profile.preferredTone) {
      sections.push(`\n## Preferred Tone`);
      sections.push(`Please use a ${profile.preferredTone} tone in your responses.`);
    }

    if (profile.coreGoals) {
      sections.push(`\n## Core Goals`);
      sections.push(profile.coreGoals);
    }

    sections.push('\nPlease take this context into account when responding to the user.\n');

    return sections.join('\n');
  }

  /**
   * Analyze conversation history to extract user insights
   * Uses LLM to identify preferences, goals, and facts about the user
   *
   * @param conversationHistory - The conversation text to analyze
   * @returns Extracted insights as a string
   */
  async analyzeConversationForInsights(conversationHistory: string): Promise<string> {
    const prompt = `Analyze the following conversation and extract key user preferences, goals, or facts that would be useful for personalizing future interactions.

Format your response as bullet points, focusing on:
- Professional role and expertise
- Work goals and projects
- Communication preferences (tone, style, format)
- Technical preferences (programming languages, tools, frameworks)
- Domain expertise and knowledge areas
- Any recurring patterns in their questions

Be specific and actionable. For example:
✓ "User is a software developer working on React applications"
✓ "User prefers concise, technical explanations with code examples"
✓ "User is learning about machine learning and neural networks"

Conversation:
${conversationHistory}

Insights:`;

    const insights = await geminiGateway.quickGenerate(prompt, { temperature: 0.3, maxTokens: 500 });

    return insights || 'No insights extracted.';
  }

  /**
   * Get profile statistics for a user
   * @param userId - The user ID
   * @returns Statistics about the user's profile completeness
   */
  async getProfileStats(userId: string) {
    const profile = await this.getProfile(userId);

    if (!profile) {
      return {
        exists: false,
        completeness: 0,
        filledFields: 0,
        totalFields: 8,
      };
    }

    const fields = [
      'name',
      'role',
      'organization',
      'expertiseLevel',
      'customInstructions',
      'writingStyle',
      'preferredTone',
      'coreGoals',
    ];

    const filledFields = fields.filter((field) => {
      const value = profile[field as keyof typeof profile];
      return value !== null && value !== undefined && value !== '';
    }).length;

    return {
      exists: true,
      completeness: Math.round((filledFields / fields.length) * 100),
      filledFields,
      totalFields: fields.length,
      lastUpdated: profile.updatedAt,
    };
  }

  /**
   * Suggest profile improvements based on conversation
   * @param userId - The user ID
   * @param conversationHistory - Recent conversation history
   * @returns Suggestions for profile updates
   */
  async suggestProfileImprovements(userId: string, conversationHistory: string) {
    const profile = await this.getProfile(userId);
    const insights = await this.analyzeConversationForInsights(conversationHistory);

    const suggestions: any = {
      insights,
      recommendations: [],
    };

    // Check what's missing and suggest based on insights
    const profileAny = profile as any;
    if (!profileAny?.writingStyle) {
      suggestions.recommendations.push({
        field: 'writingStyle',
        suggestion: 'Consider setting a preferred writing style (concise, detailed, bullet-points)',
        reason: 'Will help Koda tailor response length and format',
      });
    }

    if (!profileAny?.preferredTone) {
      suggestions.recommendations.push({
        field: 'preferredTone',
        suggestion: 'Consider setting a preferred tone (formal, casual, humorous)',
        reason: 'Will help Koda match your communication style',
      });
    }

    if (!profileAny?.coreGoals) {
      suggestions.recommendations.push({
        field: 'coreGoals',
        suggestion: 'Consider documenting your main goals or current projects',
        reason: 'Will help Koda provide more relevant and contextual assistance',
      });
    }

    if (!profileAny?.customInstructions) {
      suggestions.recommendations.push({
        field: 'customInstructions',
        suggestion: 'Consider adding custom instructions for how you want Koda to assist you',
        reason: 'Will personalize all interactions with Koda',
      });
    }

    return suggestions;
  }
}

// Singleton removed - use container.getProfile() instead

export default ProfileService;

