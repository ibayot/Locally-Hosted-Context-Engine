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
                enum: ['planning', 'product_owner', 'architecture', 'scrum_master', 'development', 'qa'],
                description: 'Specific phase/role to get guidelines for (Product Owner, Analyst, Architect, Scrum Master, Developer, QA).',
            },
        },
    },
};

export async function handleGetBmadGuidelines(args: any): Promise<string> {
    const phase = args.phase as 'planning' | 'product_owner' | 'architecture' | 'scrum_master' | 'development' | 'qa' | undefined;
    return getGuidelines(phase);
}
