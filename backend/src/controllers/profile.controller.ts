import { Request, Response } from 'express';
import { getContainer } from '../bootstrap/container';
import { ProfileService } from '../services/profile.service';

/**
 * Profile Controller - User Knowledge Gathering
 *
 * Provides endpoints for managing user profiles and personalizing AI interactions
 */
class ProfileController {
  /**
   * Get profile service from DI container (lazy loading)
   */
  private getProfileService(): ProfileService {
    return getContainer().getProfile();
  }

  /**
   * Get the current user's profile
   * GET /api/profile
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const profile = await this.getProfileService().getProfile(userId);

      res.json({
        success: true,
        profile,
      });
      return;
    } catch (error) {
      console.error('Error fetching profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch profile',
      });
      return;
    }
  }

  /**
   * Update the current user's profile
   * PUT /api/profile
   *
   * Body:
   * {
   *   name?: string,
   *   role?: string,
   *   organization?: string,
   *   expertiseLevel?: string,
   *   customInstructions?: string,
   *   writingStyle?: string,
   *   preferredTone?: string,
   *   coreGoals?: string
   * }
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const {
        name,
        role,
        organization,
        expertiseLevel,
        customInstructions,
        writingStyle,
        preferredTone,
        coreGoals,
      } = req.body;

      // Validate writingStyle if provided
      const validWritingStyles = ['concise', 'detailed', 'bullet-points', 'technical', 'narrative'];
      if (writingStyle && !validWritingStyles.includes(writingStyle)) {
        res.status(400).json({
          success: false,
          message: `Invalid writing style. Must be one of: ${validWritingStyles.join(', ')}`,
        });
        return;
      }

      // Validate preferredTone if provided
      const validTones = ['formal', 'casual', 'humorous', 'professional', 'friendly', 'academic'];
      if (preferredTone && !validTones.includes(preferredTone)) {
        res.status(400).json({
          success: false,
          message: `Invalid tone. Must be one of: ${validTones.join(', ')}`,
        });
        return;
      }

      // Validate expertiseLevel if provided
      const validExpertiseLevels = ['beginner', 'intermediate', 'expert'];
      if (expertiseLevel && !validExpertiseLevels.includes(expertiseLevel)) {
        res.status(400).json({
          success: false,
          message: `Invalid expertise level. Must be one of: ${validExpertiseLevels.join(', ')}`,
        });
        return;
      }

      const profile = await this.getProfileService().updateProfile(userId, {
        name,
        role,
        organization,
        expertiseLevel,
        customInstructions,
        writingStyle,
        preferredTone,
        coreGoals,
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        profile,
      });
      return;
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
      });
      return;
    }
  }

  /**
   * Delete the current user's profile
   * DELETE /api/profile
   */
  async deleteProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      await this.getProfileService().deleteProfile(userId);

      res.json({
        success: true,
        message: 'Profile deleted successfully',
      });
      return;
    } catch (error) {
      console.error('Error deleting profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete profile',
      });
      return;
    }
  }

  /**
   * Get profile statistics
   * GET /api/profile/stats
   */
  async getProfileStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const stats = await this.getProfileService().getProfileStats(userId);

      res.json({
        success: true,
        stats,
      });
      return;
    } catch (error) {
      console.error('Error fetching profile stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch profile stats',
      });
      return;
    }
  }

  /**
   * Analyze conversation and suggest profile improvements
   * POST /api/profile/analyze
   *
   * Body:
   * {
   *   conversationHistory: string
   * }
   */
  async analyzeConversation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const { conversationHistory } = req.body;

      if (!conversationHistory || typeof conversationHistory !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Conversation history is required',
        });
        return;
      }

      const suggestions = await this.getProfileService().suggestProfileImprovements(
        userId,
        conversationHistory
      );

      res.json({
        success: true,
        suggestions,
      });
      return;
    } catch (error) {
      console.error('Error analyzing conversation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to analyze conversation',
      });
      return;
    }
  }

  /**
   * Get the system prompt generated from user profile
   * GET /api/profile/system-prompt
   */
  async getSystemPrompt(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return;
      }

      const profileSvc = this.getProfileService();
      const profile = await profileSvc.getProfile(userId);
      const systemPrompt = profileSvc.buildProfileSystemPrompt(profile);

      res.json({
        success: true,
        systemPrompt,
        hasProfile: !!profile,
      });
      return;
    } catch (error) {
      console.error('Error generating system prompt:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate system prompt',
      });
      return;
    }
  }

  /**
   * Get available options for profile fields
   * GET /api/profile/options
   */
  async getProfileOptions(req: Request, res: Response): Promise<void> {
    try {
      const options = {
        writingStyles: [
          { value: 'concise', label: 'Concise', description: 'Brief, to-the-point responses' },
          { value: 'detailed', label: 'Detailed', description: 'Comprehensive, thorough explanations' },
          { value: 'bullet-points', label: 'Bullet Points', description: 'Structured list format' },
          { value: 'technical', label: 'Technical', description: 'Technical documentation style' },
          { value: 'narrative', label: 'Narrative', description: 'Story-like, flowing text' },
        ],
        tones: [
          { value: 'formal', label: 'Formal', description: 'Professional and structured' },
          { value: 'casual', label: 'Casual', description: 'Relaxed and conversational' },
          { value: 'humorous', label: 'Humorous', description: 'Light-hearted and witty' },
          { value: 'professional', label: 'Professional', description: 'Business-appropriate' },
          { value: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
          { value: 'academic', label: 'Academic', description: 'Scholarly and analytical' },
        ],
        expertiseLevels: [
          { value: 'beginner', label: 'Beginner', description: 'New to the field' },
          { value: 'intermediate', label: 'Intermediate', description: 'Some experience' },
          { value: 'expert', label: 'Expert', description: 'Advanced knowledge' },
        ],
      };

      res.json({
        success: true,
        options,
      });
      return;
    } catch (error) {
      console.error('Error fetching profile options:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch profile options',
      });
      return;
    }
  }

  // ============================================================================
  // SIMPLIFIED METHODS (Accept userId from URL params - for admin/testing)
  // ============================================================================

  /**
   * Get profile by userId parameter (simplified version)
   * GET /api/profiles/:userId
   */
  async getProfileByParam(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'userId parameter is required',
        });
        return;
      }

      const profile = await this.getProfileService().getProfile(userId);

      res.json(profile);
      return;
    } catch (error) {
      console.error('Error fetching profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch profile',
      });
      return;
    }
  }

  /**
   * Update profile by userId parameter (simplified version)
   * PUT /api/profiles/:userId
   */
  async updateProfileByParam(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'userId parameter is required',
        });
        return;
      }

      const profile = await this.getProfileService().updateProfile(userId, req.body);

      res.json(profile);
      return;
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
      });
      return;
    }
  }
}

export const profileController = new ProfileController();
export default profileController;
