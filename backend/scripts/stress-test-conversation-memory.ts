/**
 * CONVERSATION MEMORY STRESS TEST
 *
 * PURPOSE: Push the infinite conversation memory system to its limits
 * TESTS:
 * - Long conversations (100+ messages)
 * - Context retrieval from distant past
 * - Multiple topic switches
 * - Specific detail recall
 * - Cross-reference understanding
 * - Token limit handling
 * - Compression effectiveness
 * - Semantic search accuracy
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const API_BASE_URL = 'http://localhost:5000/api';
const TEST_EMAIL = 'localhost@koda.com';
const TEST_PASSWORD = 'localhost123';

let accessToken: string;
let userId: string;
let conversationId: string;

// ═══════════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════════

async function setup() {
  console.log('🔧 [SETUP] Finding existing user and creating test conversation...');

  // Find existing user
  const user = await prisma.user.findUnique({
    where: { email: TEST_EMAIL }
  });

  if (!user) {
    throw new Error(`User ${TEST_EMAIL} not found. Please create the user first.`);
  }

  userId = user.id;
  console.log(`✅ Found test user: ${userId}`);

  // Create conversation
  const conversation = await prisma.conversation.create({
    data: {
      userId,
      title: 'Memory Stress Test Conversation'
    }
  });

  conversationId = conversation.id;
  console.log(`✅ Created conversation: ${conversationId}`);

  // Login to get token
  try {
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    // Response has accessToken directly on data, not under tokens
    accessToken = loginResponse.data.accessToken;
    console.log(`✅ Login successful, got access token`);
  } catch (error: any) {
    console.log(`⚠️ Login failed: ${error.response?.data?.message || error.message}`);
    throw new Error('Cannot run stress test without valid authentication');
  }

  console.log('✅ Setup complete\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST DATA GENERATION
// ═══════════════════════════════════════════════════════════════════════════

interface TestMessage {
  role: 'user' | 'assistant';
  content: string;
  topic: string;
  keyInfo?: string; // Information that should be recalled later
}

function generateStressTestMessages(): TestMessage[] {
  return [
    // TOPIC 1: Project Planning (Messages 1-15)
    { role: 'user', content: 'I need to plan a new project called "Phoenix Initiative"', topic: 'project', keyInfo: 'project name: Phoenix Initiative' },
    { role: 'assistant', content: 'I\'d be happy to help you plan the Phoenix Initiative. What\'s the project about?', topic: 'project' },
    { role: 'user', content: 'It\'s a mobile app for fitness tracking. The budget is $250,000 and we have 6 months.', topic: 'project', keyInfo: 'budget: $250,000, timeline: 6 months' },
    { role: 'assistant', content: 'Great! A fitness tracking app with a $250k budget over 6 months. What features are you planning?', topic: 'project' },
    { role: 'user', content: 'We want GPS tracking, calorie counting, social features, and AI workout recommendations.', topic: 'project', keyInfo: 'features: GPS, calories, social, AI workouts' },
    { role: 'assistant', content: 'Excellent feature set. Have you identified your target market?', topic: 'project' },
    { role: 'user', content: 'Yes, primarily millennials aged 25-35 who are fitness enthusiasts. Market size is about 2 million users.', topic: 'project', keyInfo: 'target: millennials 25-35, market: 2M users' },
    { role: 'assistant', content: 'That\'s a solid target market. What about the technology stack?', topic: 'project' },
    { role: 'user', content: 'We\'re using React Native for the app, Node.js backend, PostgreSQL database, and AWS for hosting.', topic: 'project', keyInfo: 'tech: React Native, Node.js, PostgreSQL, AWS' },
    { role: 'assistant', content: 'Good choices. Have you assembled your team?', topic: 'project' },
    { role: 'user', content: 'Yes, we have 5 developers, 2 designers, 1 PM, and 1 QA engineer. Team lead is Sarah Johnson.', topic: 'project', keyInfo: 'team: 9 people, lead: Sarah Johnson' },
    { role: 'assistant', content: 'Strong team. What\'s your go-to-market strategy?', topic: 'project' },
    { role: 'user', content: 'Soft launch in Q2 2024, followed by a major marketing push in Q3. We\'re targeting 50k users in year 1.', topic: 'project', keyInfo: 'launch: Q2 2024, target: 50k users year 1' },
    { role: 'assistant', content: 'Ambitious but achievable. Any concerns about competition?', topic: 'project' },
    { role: 'user', content: 'Our main competitors are Strava and MyFitnessPal, but we differentiate with AI-powered recommendations.', topic: 'project', keyInfo: 'competitors: Strava, MyFitnessPal' },

    // TOPIC 2: Financial Analysis (Messages 16-30)
    { role: 'user', content: 'Let me switch topics. I need to analyze our Q4 2023 financial results.', topic: 'finance' },
    { role: 'assistant', content: 'Of course! What financial metrics would you like to review?', topic: 'finance' },
    { role: 'user', content: 'Revenue was $1.2M, up 35% from Q3. Operating expenses were $850k.', topic: 'finance', keyInfo: 'Q4 revenue: $1.2M, growth: 35%, expenses: $850k' },
    { role: 'assistant', content: 'Strong revenue growth! That gives you a profit of $350k. What were the main revenue drivers?', topic: 'finance' },
    { role: 'user', content: 'Enterprise contracts contributed $700k, SaaS subscriptions $400k, and consulting $100k.', topic: 'finance', keyInfo: 'revenue breakdown: enterprise $700k, SaaS $400k, consulting $100k' },
    { role: 'assistant', content: 'Enterprise is clearly your biggest segment. How many customers do you have?', topic: 'finance' },
    { role: 'user', content: 'We have 12 enterprise clients, 450 SaaS subscribers, and completed 8 consulting projects.', topic: 'finance', keyInfo: 'customers: 12 enterprise, 450 SaaS, 8 consulting' },
    { role: 'assistant', content: 'Good diversification. What\'s your customer acquisition cost?', topic: 'finance' },
    { role: 'user', content: 'CAC is $1,200 for enterprise, $150 for SaaS, and we don\'t track it for consulting.', topic: 'finance', keyInfo: 'CAC: enterprise $1,200, SaaS $150' },
    { role: 'assistant', content: 'And what about customer lifetime value?', topic: 'finance' },
    { role: 'user', content: 'LTV is $45,000 for enterprise (3-year contracts) and $900 for SaaS (average 12-month retention).', topic: 'finance', keyInfo: 'LTV: enterprise $45k, SaaS $900' },
    { role: 'assistant', content: 'Excellent LTV:CAC ratios. What are your projections for 2024?', topic: 'finance' },
    { role: 'user', content: 'We\'re projecting $6M revenue for 2024, with 60% from enterprise, 30% SaaS, 10% consulting.', topic: 'finance', keyInfo: '2024 projection: $6M total, 60% enterprise, 30% SaaS, 10% consulting' },
    { role: 'assistant', content: 'That\'s 5x growth from Q4 run rate. What\'s driving that optimism?', topic: 'finance' },
    { role: 'user', content: 'We have a strong pipeline of 25 enterprise prospects and we\'re launching a new product tier in March.', topic: 'finance', keyInfo: 'pipeline: 25 enterprise prospects, new tier: March' },

    // TOPIC 3: Team Management (Messages 31-45)
    { role: 'user', content: 'Now I want to discuss team management. We\'re having some challenges.', topic: 'team' },
    { role: 'assistant', content: 'I\'m here to help. What challenges are you facing with your team?', topic: 'team' },
    { role: 'user', content: 'Our engineering team is burned out. They\'ve been working 60-hour weeks for 3 months.', topic: 'team', keyInfo: 'problem: burnout, hours: 60/week, duration: 3 months' },
    { role: 'assistant', content: 'That\'s concerning. What\'s causing the excessive workload?', topic: 'team' },
    { role: 'user', content: 'We took on too many client projects simultaneously. We have 8 active projects with only 12 engineers.', topic: 'team', keyInfo: 'workload: 8 projects, 12 engineers' },
    { role: 'assistant', content: 'That\'s definitely unsustainable. Have you considered hiring more engineers?', topic: 'team' },
    { role: 'user', content: 'Yes, we\'re hiring 5 more engineers. We\'ve made offers to 3 candidates - Alex Chen, Maria Rodriguez, and James Kim.', topic: 'team', keyInfo: 'hiring: 5 engineers, offers: Alex Chen, Maria Rodriguez, James Kim' },
    { role: 'assistant', content: 'Good move. When do they start?', topic: 'team' },
    { role: 'user', content: 'Alex starts February 1st, Maria on February 15th, and James on March 1st. Still interviewing for the other 2 positions.', topic: 'team', keyInfo: 'start dates: Alex Feb 1, Maria Feb 15, James Mar 1' },
    { role: 'assistant', content: 'What about retention of your current team?', topic: 'team' },
    { role: 'user', content: 'We\'ve lost 2 engineers this quarter - Tom Wilson and Lisa Park. Both cited burnout as the reason.', topic: 'team', keyInfo: 'attrition: Tom Wilson, Lisa Park, reason: burnout' },
    { role: 'assistant', content: 'That\'s a red flag. What are you doing to improve morale?', topic: 'team' },
    { role: 'user', content: 'We\'re implementing mandatory PTO, reducing meeting load by 50%, and giving everyone a $5k bonus.', topic: 'team', keyInfo: 'initiatives: mandatory PTO, 50% fewer meetings, $5k bonus' },
    { role: 'assistant', content: 'Those are positive steps. How is the team responding?', topic: 'team' },
    { role: 'user', content: 'Mixed. Senior engineers like it, but junior engineers want more mentorship time instead of bonuses.', topic: 'team', keyInfo: 'feedback: seniors positive, juniors want mentorship' },

    // TOPIC 4: Product Development (Messages 46-60)
    { role: 'user', content: 'Let\'s talk about our product roadmap for the next quarter.', topic: 'product' },
    { role: 'assistant', content: 'Sure! What features are you planning to ship?', topic: 'product' },
    { role: 'user', content: 'We have 3 major features: real-time collaboration, advanced analytics dashboard, and API v2.', topic: 'product', keyInfo: 'Q1 features: real-time collab, analytics dashboard, API v2' },
    { role: 'assistant', content: 'Ambitious roadmap. What\'s the priority order?', topic: 'product' },
    { role: 'user', content: 'API v2 is top priority (due Feb 28), then analytics (Mar 15), then collaboration (Mar 31).', topic: 'product', keyInfo: 'priorities: API v2 Feb 28, analytics Mar 15, collab Mar 31' },
    { role: 'assistant', content: 'What\'s driving the API v2 priority?', topic: 'product' },
    { role: 'user', content: 'We have 5 enterprise clients waiting for webhooks and better rate limits. It\'s blocking $500k in deals.', topic: 'product', keyInfo: 'API v2 reason: 5 clients waiting, $500k blocked' },
    { role: 'assistant', content: 'That\'s significant revenue at stake. Who\'s leading the API v2 work?', topic: 'product' },
    { role: 'user', content: 'David Kumar is the tech lead, with Emily Zhang and Robert Lee as developers. QA is handled by Jessica Brown.', topic: 'product', keyInfo: 'API v2 team: David Kumar (lead), Emily Zhang, Robert Lee, Jessica Brown (QA)' },
    { role: 'assistant', content: 'What about the analytics dashboard?', topic: 'product' },
    { role: 'user', content: 'That\'s led by Michelle Chen. We\'re using D3.js for visualizations and targeting 15 different chart types.', topic: 'product', keyInfo: 'analytics lead: Michelle Chen, tech: D3.js, charts: 15 types' },
    { role: 'assistant', content: 'Sounds comprehensive. Any technical risks?', topic: 'product' },
    { role: 'user', content: 'Yes, performance with large datasets. We\'re testing with 10M records and seeing 8-second load times.', topic: 'product', keyInfo: 'risk: performance, test: 10M records, load time: 8 seconds' },
    { role: 'assistant', content: 'That\'s too slow. What\'s your target?', topic: 'product' },
    { role: 'user', content: 'We need sub-2-second loads. We\'re exploring data aggregation and caching strategies.', topic: 'product', keyInfo: 'target: <2 seconds, solution: aggregation + caching' },

    // TOPIC 5: Marketing Strategy (Messages 61-75)
    { role: 'user', content: 'I need to finalize our marketing strategy for Q1.', topic: 'marketing' },
    { role: 'assistant', content: 'Let\'s dive into it. What channels are you focusing on?', topic: 'marketing' },
    { role: 'user', content: 'Content marketing, paid ads, and partnerships. Budget is $150k split 40/40/20.', topic: 'marketing', keyInfo: 'channels: content, ads, partnerships; budget: $150k (40/40/20)' },
    { role: 'assistant', content: 'What\'s your content strategy?', topic: 'marketing' },
    { role: 'user', content: 'Publishing 3 blog posts per week, 2 case studies per month, and 1 whitepaper per quarter.', topic: 'marketing', keyInfo: 'content: 3 blogs/week, 2 case studies/month, 1 whitepaper/quarter' },
    { role: 'assistant', content: 'Who\'s creating all that content?', topic: 'marketing' },
    { role: 'user', content: 'We hired 2 content writers - Amanda Foster and Brian Mitchell. Plus we\'re working with 3 freelancers.', topic: 'marketing', keyInfo: 'content team: Amanda Foster, Brian Mitchell, 3 freelancers' },
    { role: 'assistant', content: 'What about paid advertising?', topic: 'marketing' },
    { role: 'user', content: 'Running Google Ads ($40k), LinkedIn Ads ($15k), and Facebook Ads ($5k). Target CPA is $80.', topic: 'marketing', keyInfo: 'ads: Google $40k, LinkedIn $15k, Facebook $5k; CPA target: $80' },
    { role: 'assistant', content: 'What\'s your current CPA?', topic: 'marketing' },
    { role: 'user', content: 'Google is at $72, LinkedIn at $95, and Facebook at $110. We\'re pausing Facebook to reallocate budget.', topic: 'marketing', keyInfo: 'current CPA: Google $72, LinkedIn $95, Facebook $110; action: pause Facebook' },
    { role: 'assistant', content: 'Smart move. What partnerships are you pursuing?', topic: 'marketing' },
    { role: 'user', content: 'We\'re partnering with TechCrunch for a sponsored article and attending 3 conferences: SaaStr, WebSummit, and TechCrunch Disrupt.', topic: 'marketing', keyInfo: 'partnerships: TechCrunch article, conferences: SaaStr, WebSummit, TC Disrupt' },
    { role: 'assistant', content: 'What\'s your expected ROI on these initiatives?', topic: 'marketing' },
    { role: 'user', content: 'Targeting 3:1 ROI overall. Content should drive 200 MQLs, ads 300 MQLs, partnerships 100 MQLs.', topic: 'marketing', keyInfo: 'ROI target: 3:1, MQLs: content 200, ads 300, partnerships 100' },

    // TOPIC 6: Customer Success (Messages 76-90)
    { role: 'user', content: 'Let\'s review our customer success metrics.', topic: 'customer' },
    { role: 'assistant', content: 'Absolutely. What metrics are you tracking?', topic: 'customer' },
    { role: 'user', content: 'NPS is 42, churn rate is 5% monthly, and CSAT is 4.2/5. We want to improve all three.', topic: 'customer', keyInfo: 'metrics: NPS 42, churn 5%, CSAT 4.2/5' },
    { role: 'assistant', content: 'What\'s causing the churn?', topic: 'customer' },
    { role: 'user', content: 'Top 3 reasons: lack of features (40%), poor onboarding (30%), and pricing (30%).', topic: 'customer', keyInfo: 'churn reasons: features 40%, onboarding 30%, pricing 30%' },
    { role: 'assistant', content: 'How are you addressing these issues?', topic: 'customer' },
    { role: 'user', content: 'Accelerating feature development, redesigning onboarding, and introducing a cheaper starter tier at $29/month.', topic: 'customer', keyInfo: 'solutions: faster features, new onboarding, starter tier $29/mo' },
    { role: 'assistant', content: 'What\'s your current pricing structure?', topic: 'customer' },
    { role: 'user', content: 'Starter $29, Professional $99, Enterprise $499. We\'re adding a Team plan at $199 for 5-10 users.', topic: 'customer', keyInfo: 'pricing: Starter $29, Pro $99, Team $199, Enterprise $499' },
    { role: 'assistant', content: 'How many customers are on each tier?', topic: 'customer' },
    { role: 'user', content: 'Starter: 200, Professional: 180, Enterprise: 12. We expect Team to attract 50 customers in Q1.', topic: 'customer', keyInfo: 'distribution: Starter 200, Pro 180, Enterprise 12, Team target 50' },
    { role: 'assistant', content: 'What\'s your customer support setup?', topic: 'customer' },
    { role: 'user', content: 'We have 4 support agents: Karen White (lead), Mike Johnson, Sarah Davis, and Chris Anderson. Average response time is 4 hours.', topic: 'customer', keyInfo: 'support: 4 agents (Karen White lead), response time: 4 hours' },
    { role: 'assistant', content: 'Is 4 hours meeting customer expectations?', topic: 'customer' },
    { role: 'user', content: 'No, enterprise clients expect <1 hour. We\'re hiring 2 more agents and implementing a chatbot for tier 1 support.', topic: 'customer', keyInfo: 'enterprise SLA: <1 hour, hiring: 2 agents, adding: chatbot' },

    // TOPIC 7: Technical Infrastructure (Messages 91-105)
    { role: 'user', content: 'I need to discuss our infrastructure and scaling plans.', topic: 'infrastructure' },
    { role: 'assistant', content: 'Sure! What\'s your current infrastructure setup?', topic: 'infrastructure' },
    { role: 'user', content: 'We\'re on AWS using EC2, RDS PostgreSQL, S3, and CloudFront. Monthly cost is $12,000.', topic: 'infrastructure', keyInfo: 'AWS services: EC2, RDS, S3, CloudFront; cost: $12k/month' },
    { role: 'assistant', content: 'What\'s your current traffic volume?', topic: 'infrastructure' },
    { role: 'user', content: '500k monthly active users, 5M API requests per day, 200GB database, 2TB S3 storage.', topic: 'infrastructure', keyInfo: 'traffic: 500k MAU, 5M API req/day, DB: 200GB, S3: 2TB' },
    { role: 'assistant', content: 'Are you experiencing any performance issues?', topic: 'infrastructure' },
    { role: 'user', content: 'Yes, database queries are slow during peak hours (9am-11am EST). P95 latency is 2.5 seconds.', topic: 'infrastructure', keyInfo: 'issue: slow DB, peak: 9-11am EST, P95: 2.5s' },
    { role: 'assistant', content: 'What\'s your target latency?', topic: 'infrastructure' },
    { role: 'user', content: 'P95 should be under 500ms. We\'re adding read replicas and implementing Redis caching.', topic: 'infrastructure', keyInfo: 'target: P95 <500ms, solution: read replicas + Redis' },
    { role: 'assistant', content: 'What about disaster recovery?', topic: 'infrastructure' },
    { role: 'user', content: 'We have daily backups with 30-day retention, but RTO is 4 hours and RPO is 24 hours. Not acceptable for enterprise.', topic: 'infrastructure', keyInfo: 'backups: daily, 30-day retention; RTO: 4h, RPO: 24h' },
    { role: 'assistant', content: 'What are enterprise clients expecting?', topic: 'infrastructure' },
    { role: 'user', content: 'RTO <1 hour, RPO <1 hour. We\'re implementing continuous replication to a secondary region.', topic: 'infrastructure', keyInfo: 'enterprise SLA: RTO <1h, RPO <1h; solution: continuous replication' },
    { role: 'assistant', content: 'What\'s your monitoring setup?', topic: 'infrastructure' },
    { role: 'user', content: 'Using DataDog for APM, PagerDuty for alerts, and Sentry for error tracking. On-call rotation is 4 engineers.', topic: 'infrastructure', keyInfo: 'monitoring: DataDog, PagerDuty, Sentry; on-call: 4 engineers' },

    // FINAL MESSAGES: Cross-topic questions (Messages 106-110)
    { role: 'user', content: 'Quick question - what was the budget for the Phoenix Initiative again?', topic: 'recall' },
    { role: 'assistant', content: 'The Phoenix Initiative budget was $250,000 with a 6-month timeline.', topic: 'recall' },
    { role: 'user', content: 'And who was leading the API v2 development?', topic: 'recall' },
    { role: 'assistant', content: 'David Kumar is the tech lead for API v2, with Emily Zhang and Robert Lee as developers.', topic: 'recall' },
    { role: 'user', content: 'What was our Q4 2023 revenue again?', topic: 'recall' }
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE MESSAGES IN DATABASE
// ═══════════════════════════════════════════════════════════════════════════

async function createMessages(messages: TestMessage[]) {
  console.log(`📝 [MESSAGES] Creating ${messages.length} test messages...`);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    await prisma.message.create({
      data: {
        conversationId,
        role: msg.role,
        content: msg.content,
        createdAt: new Date(Date.now() + i * 1000) // 1 second apart
      }
    });

    if ((i + 1) % 20 === 0) {
      console.log(`   Created ${i + 1}/${messages.length} messages...`);
    }
  }

  console.log(`✅ Created all ${messages.length} messages\n`);
}

// ═══════════════════════════════════════════════════════════════════════════
// STRESS TESTS
// ═══════════════════════════════════════════════════════════════════════════

interface StressTest {
  name: string;
  query: string;
  expectedInfo: string[];
  description: string;
}

function getStressTests(): StressTest[] {
  return [
    {
      name: 'Distant Past Recall (Message 3)',
      query: 'What was the budget and timeline for the Phoenix Initiative?',
      expectedInfo: ['$250,000', '250000', '6 months', 'six months'],
      description: 'Tests recall of specific details from 100+ messages ago'
    },
    {
      name: 'Multi-Detail Recall (Message 5)',
      query: 'What features were planned for the Phoenix Initiative app?',
      expectedInfo: ['GPS', 'calorie', 'social', 'AI', 'workout'],
      description: 'Tests recall of multiple details from distant past'
    },
    {
      name: 'Person Name Recall (Message 11)',
      query: 'Who is the team lead for the Phoenix Initiative?',
      expectedInfo: ['Sarah Johnson', 'Sarah', 'Johnson'],
      description: 'Tests recall of specific person names'
    },
    {
      name: 'Financial Data Recall (Message 18)',
      query: 'What was our Q4 2023 revenue and how was it broken down?',
      expectedInfo: ['1.2M', '$1.2', 'enterprise', '$700k', 'SaaS', '$400k'],
      description: 'Tests recall of financial figures from 90+ messages ago'
    },
    {
      name: 'Customer Metrics Recall (Message 22)',
      query: 'How many customers do we have in each segment?',
      expectedInfo: ['12 enterprise', '450 SaaS', '8 consulting'],
      description: 'Tests recall of specific numbers across categories'
    },
    {
      name: 'Team Problem Recall (Message 33)',
      query: 'What team management issues are we facing?',
      expectedInfo: ['burnout', '60', 'hour', 'weeks', '3 months'],
      description: 'Tests understanding of problems discussed'
    },
    {
      name: 'New Hire Recall (Message 37)',
      query: 'Who are the three engineers we made offers to?',
      expectedInfo: ['Alex Chen', 'Maria Rodriguez', 'James Kim'],
      description: 'Tests recall of multiple person names'
    },
    {
      name: 'Start Date Recall (Message 39)',
      query: 'When does Alex Chen start?',
      expectedInfo: ['February 1', 'Feb 1', '2/1', 'February 1st'],
      description: 'Tests recall of specific dates'
    },
    {
      name: 'Product Priority Recall (Message 49)',
      query: 'What are our Q1 feature priorities and their deadlines?',
      expectedInfo: ['API v2', 'Feb 28', 'analytics', 'Mar 15', 'collaboration', 'Mar 31'],
      description: 'Tests recall of ordered list with dates'
    },
    {
      name: 'Technical Team Recall (Message 53)',
      query: 'Who is working on the API v2 project?',
      expectedInfo: ['David Kumar', 'Emily Zhang', 'Robert Lee', 'Jessica Brown'],
      description: 'Tests recall of team composition'
    },
    {
      name: 'Performance Issue Recall (Message 57)',
      query: 'What performance problem are we seeing with the analytics dashboard?',
      expectedInfo: ['8 second', '8-second', '10M records', 'large datasets'],
      description: 'Tests understanding of technical problems'
    },
    {
      name: 'Marketing Budget Recall (Message 62)',
      query: 'What is our Q1 marketing budget and how is it allocated?',
      expectedInfo: ['$150k', '150000', '40', 'content', 'ads', 'partnerships'],
      description: 'Tests recall of budget allocation'
    },
    {
      name: 'Content Team Recall (Message 66)',
      query: 'Who are our content writers?',
      expectedInfo: ['Amanda Foster', 'Brian Mitchell'],
      description: 'Tests recall of specific team members'
    },
    {
      name: 'Churn Analysis Recall (Message 78)',
      query: 'What are the top reasons for customer churn?',
      expectedInfo: ['features', '40%', 'onboarding', '30%', 'pricing'],
      description: 'Tests recall of categorized data with percentages'
    },
    {
      name: 'Pricing Structure Recall (Message 81)',
      query: 'What are our pricing tiers?',
      expectedInfo: ['$29', '$99', '$199', '$499', 'Starter', 'Professional', 'Team', 'Enterprise'],
      description: 'Tests recall of complete pricing structure'
    },
    {
      name: 'Support Team Recall (Message 84)',
      query: 'Who are our support agents and what is the average response time?',
      expectedInfo: ['Karen White', 'Mike Johnson', 'Sarah Davis', 'Chris Anderson', '4 hours'],
      description: 'Tests recall of team and metrics'
    },
    {
      name: 'Infrastructure Cost Recall (Message 92)',
      query: 'What is our monthly AWS cost and what services are we using?',
      expectedInfo: ['$12,000', '12000', 'EC2', 'RDS', 'S3', 'CloudFront'],
      description: 'Tests recall of costs and technical details'
    },
    {
      name: 'Traffic Volume Recall (Message 94)',
      query: 'What is our current traffic volume?',
      expectedInfo: ['500k', 'MAU', '5M', 'API', 'day', '200GB', '2TB'],
      description: 'Tests recall of multiple metrics'
    },
    {
      name: 'Performance Target Recall (Message 96)',
      query: 'What is our database latency target and current performance?',
      expectedInfo: ['500ms', 'P95', '2.5', 'seconds', 'peak'],
      description: 'Tests recall of technical metrics'
    },
    {
      name: 'Cross-Topic Connection',
      query: 'How do our team burnout issues relate to our product delivery timeline?',
      expectedInfo: ['burnout', 'API v2', 'Feb 28', '60 hour', 'weeks'],
      description: 'Tests ability to connect information across topics'
    },
    {
      name: 'Financial Impact Analysis',
      query: 'How much revenue is blocked by the API v2 delay?',
      expectedInfo: ['$500k', '500000', '5 enterprise', 'clients', 'waiting'],
      description: 'Tests understanding of business impact'
    },
    {
      name: 'Complete Context Synthesis',
      query: 'Give me a complete summary of all the projects, issues, and metrics we discussed.',
      expectedInfo: ['Phoenix Initiative', 'Q4 revenue', 'burnout', 'API v2', 'churn', 'AWS'],
      description: 'Tests ability to synthesize entire conversation'
    }
  ];
}

async function runStressTest(test: StressTest, testNumber: number, totalTests: number) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`TEST ${testNumber}/${totalTests}: ${test.name}`);
  console.log(`${'═'.repeat(80)}`);
  console.log(`📋 Description: ${test.description}`);
  console.log(`❓ Query: "${test.query}"`);
  console.log(`🎯 Expected Info: ${test.expectedInfo.join(', ')}`);
  console.log('');

  try {
    const startTime = Date.now();

    // Make RAG query
    const response = await axios.post(
      `${API_BASE_URL}/rag/query`,
      {
        conversationId,
        query: test.query,
        stream: false
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        timeout: 60000 // 60 second timeout
      }
    );

    const duration = Date.now() - startTime;
    const answer = response.data.response || response.data.answer || '';

    console.log(`⏱️  Response Time: ${duration}ms`);
    console.log(`\n💬 Response:\n${answer}\n`);

    // Check if expected information is in the response
    const foundInfo: string[] = [];
    const missingInfo: string[] = [];

    for (const info of test.expectedInfo) {
      if (answer.toLowerCase().includes(info.toLowerCase())) {
        foundInfo.push(info);
      } else {
        missingInfo.push(info);
      }
    }

    const accuracy = (foundInfo.length / test.expectedInfo.length) * 100;

    console.log(`✅ Found: ${foundInfo.join(', ')}`);
    if (missingInfo.length > 0) {
      console.log(`❌ Missing: ${missingInfo.join(', ')}`);
    }
    console.log(`\n📊 Accuracy: ${accuracy.toFixed(1)}% (${foundInfo.length}/${test.expectedInfo.length})`);

    return {
      name: test.name,
      passed: accuracy >= 50, // Pass if at least 50% of expected info is present
      accuracy,
      duration,
      foundInfo,
      missingInfo
    };
  } catch (error: any) {
    console.log(`❌ ERROR: ${error.message}`);

    return {
      name: test.name,
      passed: false,
      accuracy: 0,
      duration: 0,
      foundInfo: [],
      missingInfo: test.expectedInfo,
      error: error.message
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║     CONVERSATION MEMORY STRESS TEST - MAXIMUM DIFFICULTY                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  // Setup
  await setup();

  // Generate and create messages
  const messages = generateStressTestMessages();
  await createMessages(messages);

  console.log('⏳ Waiting 5 seconds for chunking and embedding to process...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Run stress tests
  const tests = getStressTests();
  const results = [];

  for (let i = 0; i < tests.length; i++) {
    const result = await runStressTest(tests[i], i + 1, tests.length);
    results.push(result);

    // Wait 2 seconds between tests
    if (i < tests.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Summary
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              TEST SUMMARY                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

  console.log(`📊 Overall Statistics:`);
  console.log(`   Total Tests: ${results.length}`);
  console.log(`   ✅ Passed: ${passed} (${((passed / results.length) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Failed: ${failed} (${((failed / results.length) * 100).toFixed(1)}%)`);
  console.log(`   📈 Average Accuracy: ${avgAccuracy.toFixed(1)}%`);
  console.log(`   ⏱️  Average Response Time: ${avgDuration.toFixed(0)}ms\n`);

  console.log(`📋 Detailed Results:\n`);

  for (const result of results) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`   ${status} | ${result.accuracy.toFixed(1)}% | ${result.duration}ms | ${result.name}`);
  }

  console.log('\n');

  if (avgAccuracy >= 80) {
    console.log('🎉 EXCELLENT! The conversation memory system is working exceptionally well!\n');
  } else if (avgAccuracy >= 60) {
    console.log('👍 GOOD! The conversation memory system is working well with room for improvement.\n');
  } else if (avgAccuracy >= 40) {
    console.log('⚠️  FAIR! The conversation memory system needs optimization.\n');
  } else {
    console.log('❌ POOR! The conversation memory system needs significant improvement.\n');
  }

  // Cleanup
  console.log('🧹 Cleaning up test data...');
  await prisma.message.deleteMany({ where: { conversationId } });
  await prisma.conversation.delete({ where: { id: conversationId } });
  // Don't delete the user - it's an existing account
  console.log('✅ Cleanup complete\n');
}

// Run tests
runAllTests()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
