import { searchTool } from './search.tool';
import { codeInterpreterTool } from './codeInterpreter.tool';

// Define the structure for a tool
export interface Tool {
  name: string;
  description: string;
  execute: (input: string) => Promise<string>;
}

// Define structured tool call for agent use
export interface ToolCall {
  tool: string;
  input: string;
}

// Define tool execution result
export interface ToolResult {
  tool: string;
  input: string;
  output: string;
  success: boolean;
  executionTimeMs: number;
}

class MasterToolbox {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools() {
    // Web search tool for finding up-to-date information
    this.registerTool({
      name: 'web_search',
      description:
        'Performs a web search to find up-to-date information on a topic. Use this when you need current information, facts, or data that may not be in your training data. Input should be a clear search query.',
      execute: async (input: string) => {
        const results = await searchTool.search(input, 5);
        if (results.length === 0) {
          return 'No search results found. Try rephrasing your query.';
        }
        return JSON.stringify(results, null, 2);
      },
    });

    // Code interpreter tool for running JavaScript
    this.registerTool({
      name: 'code_interpreter',
      description:
        'Executes JavaScript code in a sandboxed environment. Use this for calculations, data processing, or algorithmic tasks. Input should be valid JavaScript code that uses console.log() to output results.',
      execute: async (input: string) => {
        return codeInterpreterTool.execute(input);
      },
    });

    // Calculation tool for simple math
    this.registerTool({
      name: 'calculator',
      description:
        'Performs mathematical calculations. Input should be a mathematical expression like "2 + 2" or "Math.sqrt(16) * 5". Use this for simple calculations.',
      execute: async (input: string) => {
        try {
          // Safe math evaluation using Function constructor with restricted scope
          const mathFunctions = {
            abs: Math.abs,
            ceil: Math.ceil,
            floor: Math.floor,
            round: Math.round,
            sqrt: Math.sqrt,
            pow: Math.pow,
            min: Math.min,
            max: Math.max,
            sin: Math.sin,
            cos: Math.cos,
            tan: Math.tan,
            log: Math.log,
            exp: Math.exp,
            PI: Math.PI,
            E: Math.E,
          };

          // Replace Math.x with just x for easier parsing
          let expression = input.replace(/Math\./g, '');

          // Create a function with only math operations in scope
          const fn = new Function(
            ...Object.keys(mathFunctions),
            `return (${expression})`
          );
          const result = fn(...Object.values(mathFunctions));

          return `Result: ${result}`;
        } catch (error: any) {
          return `Calculation error: ${error.message}`;
        }
      },
    });
  }

  registerTool(tool: Tool): void {
    console.log(`[MasterToolbox] Registering tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  getToolDescriptions(): string {
    return Array.from(this.tools.values())
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');
  }

  getToolDescriptionsForPrompt(): string {
    return Array.from(this.tools.values())
      .map(
        (t) =>
          `Tool: ${t.name}\nDescription: ${t.description}\nUsage: To use this tool, respond with:\n<tool>${t.name}</tool>\n<input>your input here</input>`
      )
      .join('\n\n');
  }

  async executeTool(name: string, input: string): Promise<ToolResult> {
    const startTime = Date.now();
    const tool = this.getTool(name);

    if (!tool) {
      return {
        tool: name,
        input,
        output: `Error: Tool "${name}" not found. Available tools: ${this.getToolNames().join(', ')}`,
        success: false,
        executionTimeMs: Date.now() - startTime,
      };
    }

    try {
      console.log(`[MasterToolbox] Executing tool: ${name} with input: ${input.substring(0, 100)}...`);
      const output = await tool.execute(input);
      const executionTimeMs = Date.now() - startTime;
      console.log(`[MasterToolbox] Tool ${name} completed in ${executionTimeMs}ms`);

      return {
        tool: name,
        input,
        output,
        success: true,
        executionTimeMs,
      };
    } catch (error: any) {
      console.error(`[MasterToolbox] Tool ${name} failed:`, error.message);
      return {
        tool: name,
        input,
        output: `Error executing tool: ${error.message}`,
        success: false,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }
}

export const masterToolbox = new MasterToolbox();
