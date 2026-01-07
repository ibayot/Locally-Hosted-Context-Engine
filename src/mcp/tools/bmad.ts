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
                enum: ['planning', 'product_owner', 'ui_ux', 'architecture', 'security', 'scrum_master', 'development', 'qa', 'devops'],
                description: 'Specific phase/role to get guidelines for.',
            },
        },
    },
};

export async function handleGetBmadGuidelines(args: any): Promise<string> {
    const phase = args.phase as 'planning' | 'product_owner' | 'ui_ux' | 'architecture' | 'security' | 'scrum_master' | 'development' | 'qa' | 'devops' | undefined;
    return getGuidelines(phase);
}
