import * as fs from 'fs/promises';

export interface SecurityIssue {
    file: string;
    line: number;
    type: 'secret' | 'vulnerability';
    message: string;
    severity: 'low' | 'medium' | 'high';
}

export class SecurityScanner {

    private secretPatterns = [
        { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/, severity: 'high' },
        { name: 'Generic Private Key', regex: /-----BEGIN PRIVATE KEY-----/, severity: 'high' },
        { name: 'GitHub Token', regex: /ghp_[0-9a-zA-Z]{36}/, severity: 'high' },
        { name: 'Stripe Secret Key', regex: /sk_live_[0-9a-zA-Z]{24}/, severity: 'high' },
        // Simple heuristic for generic API keys (long alphanumeric strings assigned to variables)
        // { name: 'Possible API Key', regex: /api_key\s*=\s*['"][a-zA-Z0-9]{32,}['"]/, severity: 'medium' }
    ];

    private codePatterns = [
        { name: 'Eval Usage', regex: /\beval\(/, severity: 'medium', message: 'Avoid using eval() as it poses security risks.' },
        { name: 'Exec Usage', regex: /\bexec\(/, severity: 'medium', message: 'Check input sanitization when using exec().' },
    ];

    async scanFile(filePath: string): Promise<SecurityIssue[]> {
        const issues: SecurityIssue[] = [];
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');

            lines.forEach((line, index) => {
                const lineNumber = index + 1;

                // Check Secrets
                this.secretPatterns.forEach(pattern => {
                    if (pattern.regex.test(line)) {
                        issues.push({
                            file: filePath,
                            line: lineNumber,
                            type: 'secret',
                            message: `Potential ${pattern.name} found.`,
                            severity: pattern.severity as any
                        });
                    }
                });

                // Check Code Vulnerabilities
                this.codePatterns.forEach(pattern => {
                    if (pattern.regex.test(line)) {
                        issues.push({
                            file: filePath,
                            line: lineNumber,
                            type: 'vulnerability',
                            message: pattern.message,
                            severity: pattern.severity as any
                        });
                    }
                });
            });

        } catch (error) {
            console.error(`Failed to scan file ${filePath}:`, error);
        }
        return issues;
    }
}
