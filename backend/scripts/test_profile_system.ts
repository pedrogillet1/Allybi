import 'dotenv/config';
import { profileService } from '../services/profile.service';

/**
 * Test script for the User Profile Knowledge Gathering System
 * Tests profile CRUD operations and AI-powered insights
 */

async function testProfileSystem() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              USER PROFILE KNOWLEDGE GATHERING SYSTEM TEST                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝\n');

  // Use a test user ID (you'll need to replace this with an actual user ID from your database)
  const testUserId = 'test-user-id-123';

  try {
    // Test 1: Create/Update Profile
    console.log('📝 Test 1: Creating user profile...');
    console.log('═'.repeat(80));

    const profile = await profileService.updateProfile(testUserId, {
      name: 'Alex Johnson',
      role: 'Software Developer',
      organization: 'TechCorp Inc.',
      expertiseLevel: 'intermediate',
      customInstructions: 'I prefer code examples with TypeScript. Always explain the reasoning behind design decisions.',
      writingStyle: 'detailed',
      preferredTone: 'professional',
      coreGoals: 'Building a scalable document management system with AI features. Learning about vector databases and RAG systems.',
    });

    console.log('✅ Profile created successfully!');
    console.log('Profile ID:', profile.id);
    console.log('User ID:', profile.userId);
    console.log('Name:', profile.name);
    console.log('Role:', profile.role);
    console.log('');

    // Test 2: Get Profile
    console.log('📖 Test 2: Retrieving user profile...');
    console.log('═'.repeat(80));

    const retrievedProfile = await profileService.getProfile(testUserId);
    console.log('✅ Profile retrieved successfully!');
    console.log('Writing Style:', retrievedProfile?.writingStyle);
    console.log('Preferred Tone:', retrievedProfile?.preferredTone);
    console.log('');

    // Test 3: Build System Prompt
    console.log('🤖 Test 3: Building personalized system prompt...');
    console.log('═'.repeat(80));

    const systemPrompt = profileService.buildProfileSystemPrompt(retrievedProfile);
    console.log('✅ System prompt generated!');
    console.log('\nGenerated System Prompt:');
    console.log('─'.repeat(80));
    console.log(systemPrompt);
    console.log('─'.repeat(80));
    console.log('');

    // Test 4: Get Profile Stats
    console.log('📊 Test 4: Analyzing profile completeness...');
    console.log('═'.repeat(80));

    const stats = await profileService.getProfileStats(testUserId);
    console.log('✅ Profile stats retrieved!');
    console.log(`Profile Completeness: ${stats.completeness}%`);
    console.log(`Filled Fields: ${stats.filledFields}/${stats.totalFields}`);
    console.log('');

    // Test 5: Analyze Conversation for Insights
    console.log('🔍 Test 5: Analyzing conversation for user insights...');
    console.log('═'.repeat(80));

    const sampleConversation = `
User: I'm working on a React application with TypeScript. Can you help me understand how to implement a custom hook for data fetching?

Koda: Sure! Let me explain how to create a custom data fetching hook in React with TypeScript...

User: That's great! I'm also interested in learning about error handling in hooks.

Koda: Error handling is crucial. Here's how you can implement it...

User: Perfect! I'm building this for a document management system. Do you have any suggestions for state management?

Koda: For a document management system, I'd recommend...
`;

    console.log('Analyzing conversation...');
    const insights = await profileService.analyzeConversationForInsights(sampleConversation);

    console.log('✅ Insights extracted!');
    console.log('\nExtracted Insights:');
    console.log('─'.repeat(80));
    console.log(insights);
    console.log('─'.repeat(80));
    console.log('');

    // Test 6: Suggest Profile Improvements
    console.log('💡 Test 6: Suggesting profile improvements...');
    console.log('═'.repeat(80));

    const suggestions = await profileService.suggestProfileImprovements(
      testUserId,
      sampleConversation
    );

    console.log('✅ Suggestions generated!');
    console.log('\nRecommendations:');
    console.log('─'.repeat(80));
    suggestions.recommendations.forEach((rec: any, index: number) => {
      console.log(`${index + 1}. ${rec.field}: ${rec.suggestion}`);
      console.log(`   Reason: ${rec.reason}`);
    });
    console.log('─'.repeat(80));
    console.log('');

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                            TEST SUMMARY                                       ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════════╝\n');

    console.log('✅ All tests completed successfully!');
    console.log(`✅ Profile completeness: ${stats.completeness}%`);
    console.log(`✅ System prompt length: ${systemPrompt.length} characters`);
    console.log(`✅ Insights extracted from conversation`);
    console.log(`✅ ${suggestions.recommendations.length} recommendations generated`);
    console.log('');

    console.log('🎉 User Profile Knowledge Gathering System is working correctly!');
    console.log('');

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
testProfileSystem()
  .then(() => {
    console.log('👋 Test suite finished. Exiting...\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
