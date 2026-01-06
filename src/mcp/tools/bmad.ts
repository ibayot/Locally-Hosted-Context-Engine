import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getGuidelines } from '../../bmad/guidelines.js';

export const getBmadGuidelinesTool: Tool = {
    name: 'get_bmad_guidelines',
    description: 'Get guidelines for the BMAD (Breakthrough Method for Agile AI-Driven Development) workflow.',
    inputSchema: {
        type: 'object',
        properties: {
            phase: {
                type: 'string',
                enum: ['planning', 'architecture', 'development'],
                description: 'Specific phase to get guidelines for. If omitted, returns overview.',
            },
        },
    },
};

export async function handleGetBmadGuidelines(args: any): Promise<string> {
    const phase = args.phase as 'planning' | 'architecture' | 'development' | undefined;
    return getGuidelines(phase);
}
