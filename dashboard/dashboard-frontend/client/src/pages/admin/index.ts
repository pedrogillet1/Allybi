/**
 * Admin Pages Index
 * Export all admin pages for routing
 */

// Main Dashboard
export { default as Overview } from "./Overview";

// Entity Management
export { default as Users } from "./Users";
export { default as UserDetail } from "./UserDetail";
export { default as Files } from "./Files";
export { default as FileDetail } from "./FileDetail";

// Query Analytics
export { default as Queries } from "./Queries";
export { default as Intents } from "./Intents";
export { default as Domains } from "./Domains";
export { default as Keywords } from "./Keywords";
export { default as Patterns } from "./Patterns";

// Performance & Quality
export { default as AnswerQuality } from "./AnswerQuality";
export { default as LLMCost } from "./LLMCost";
export { default as Reliability } from "./Reliability";
export { default as APIMetrics } from "./APIMetrics";

// Security & Monitoring
export { default as Security } from "./Security";
export { default as Interactions } from "./Interactions";
export { default as Live } from "./Live";
