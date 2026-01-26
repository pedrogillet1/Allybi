/**
 * Test Script: Problem-Solving Framework
 *
 * This script tests the AgentService's ability to solve multi-step problems
 * using the ReAct (Reasoning + Acting) framework.
 *
 * The agent will:
 * 1. Create a plan to solve the goal
 * 2. Use tools (web_search, calculator, code_interpreter) to gather information
 * 3. Reason about observations and adjust its approach
 * 4. Provide a final answer
 *
 * Run: npx ts-node src/scripts/test_problem_solving.ts
 */

// Ensure environment variables are loaded
import dotenv from 'dotenv';
dotenv.config();

// Check for required API key
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ ERROR: GEMINI_API_KEY is not set in environment variables');
  console.error('Please ensure your .env file contains GEMINI_API_KEY');
  process.exit(1);
}

console.log('✅ GEMINI_API_KEY found');

import { agentService } from '../services/agent.service';

async function runTest() {
  console.log('--- Testing Problem-Solving Framework ---\n');

  // Test 1: Simple knowledge + calculation problem
  const goal = 'What is the capital of France, and what is its population multiplied by 2?';
  const systemPrompt = 'You are Koda, a helpful AI assistant that solves problems step-by-step.';

  console.log(`Goal: ${goal}\n`);
  console.log('Starting agent execution...\n');

  try {
    // Use the detailed execution method to see the full process
    const result = await agentService.executeTask(
      {
        task: goal,
        context: systemPrompt,
        maxSteps: 10,
      },
      // Streaming callback to show progress
      (event) => {
        switch (event.type) {
          case 'plan':
            console.log('📋 PLAN CREATED:');
            try {
              const plan = JSON.parse(event.content);
              plan.steps.forEach((step: string, i: number) => {
                console.log(`   ${i + 1}. ${step}`);
              });
            } catch {
              console.log(`   ${event.content}`);
            }
            console.log('');
            break;
          case 'thought':
            console.log(`💭 THOUGHT (Step ${event.step}):`);
            console.log(`   ${event.content.substring(0, 200)}${event.content.length > 200 ? '...' : ''}`);
            console.log('');
            break;
          case 'action':
            console.log(`🔧 ACTION (Step ${event.step}):`);
            console.log(`   ${event.content}`);
            console.log('');
            break;
          case 'observation':
            console.log(`👁️ OBSERVATION (Step ${event.step}):`);
            console.log(`   ${event.content.substring(0, 300)}${event.content.length > 300 ? '...' : ''}`);
            console.log('');
            break;
          case 'answer':
            console.log('✅ FINAL ANSWER:');
            console.log(`   ${event.content}`);
            console.log('');
            break;
          case 'error':
            console.log(`❌ ERROR (Step ${event.step}):`);
            console.log(`   ${event.content}`);
            console.log('');
            break;
        }
      }
    );

    // Print summary
    console.log('\n--- Execution Summary ---');
    console.log(`Success: ${result.success}`);
    console.log(`Total Steps: ${result.totalSteps}`);
    console.log(`Total Time: ${result.totalTimeMs}ms`);
    console.log(`Tools Used: ${result.toolsUsed.join(', ') || 'None'}`);

    console.log('\n--- Koda Final Answer ---');
    console.log(result.finalAnswer);

    // Validate the answer
    const answer = result.finalAnswer.toLowerCase();
    const hasParis = answer.includes('paris');
    const hasPopulationCalc = /\d/.test(answer); // Contains numbers

    console.log('\n--- Validation ---');
    if (hasParis) {
      console.log('✅ SUCCESS: Answer mentions Paris (capital of France)');
    } else {
      console.log('⚠️ WARNING: Answer does not mention Paris');
    }

    if (hasPopulationCalc) {
      console.log('✅ SUCCESS: Answer includes numerical data');
    } else {
      console.log('⚠️ WARNING: Answer does not include numerical calculation');
    }

    if (result.toolsUsed.length > 0) {
      console.log(`✅ SUCCESS: Agent used tools: ${result.toolsUsed.join(', ')}`);
    } else {
      console.log('⚠️ WARNING: Agent did not use any tools');
    }

  } catch (error) {
    console.error('\n❌ FAILED: The test encountered an error:', error);
  }

  // Test 2: Simple solve method
  console.log('\n\n--- Test 2: Simple solve() method ---\n');
  try {
    const simpleGoal = 'Calculate 15% of 250';
    console.log(`Goal: ${simpleGoal}\n`);

    const simpleAnswer = await agentService.solve(simpleGoal, systemPrompt);
    console.log('Answer:', simpleAnswer);

    if (simpleAnswer.includes('37.5') || simpleAnswer.includes('37,5')) {
      console.log('\n✅ SUCCESS: Calculation is correct (15% of 250 = 37.5)');
    } else {
      console.log('\n⚠️ WARNING: Expected answer to include 37.5');
    }
  } catch (error) {
    console.error('\n❌ FAILED: Simple solve test error:', error);
  }

  console.log('\n--- End Test ---');
}

// Run the test
runTest()
  .then(() => {
    console.log('\n🎉 Test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });
