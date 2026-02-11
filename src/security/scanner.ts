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
        // Cloud Provider Keys
        { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/, severity: 'high' },
        { name: 'AWS Secret Key', regex: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/, severity: 'high' },
        { name: 'Google Cloud API Key', regex: /AIza[0-9A-Za-z\-_]{35}/, severity: 'high' },
        { name: 'Azure Storage Key', regex: /AccountKey=[A-Za-z0-9+/=]{88}/, severity: 'high' },

        // AI / LLM Keys
        { name: 'OpenAI API Key', regex: /sk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,}/, severity: 'high' },
        { name: 'OpenAI API Key (new format)', regex: /sk-proj-[A-Za-z0-9\-_]{40,}/, severity: 'high' },
        { name: 'Anthropic API Key', regex: /sk-ant-[A-Za-z0-9\-_]{40,}/, severity: 'high' },

        // Code / Version Control
        { name: 'GitHub Token', regex: /ghp_[0-9a-zA-Z]{36}/, severity: 'high' },
        { name: 'GitHub OAuth', regex: /gho_[0-9a-zA-Z]{36}/, severity: 'high' },
        { name: 'GitHub App Token', regex: /ghu_[0-9a-zA-Z]{36}/, severity: 'high' },
        { name: 'GitLab Token', regex: /glpat-[0-9a-zA-Z\-_]{20,}/, severity: 'high' },

        // Payment / Finance
        { name: 'Stripe Secret Key', regex: /sk_live_[0-9a-zA-Z]{24,}/, severity: 'high' },
        { name: 'Stripe Publishable Key', regex: /pk_live_[0-9a-zA-Z]{24,}/, severity: 'medium' },

        // Communication
        { name: 'Slack Token', regex: /xox[bpors]-[0-9a-zA-Z\-]{10,}/, severity: 'high' },
        { name: 'Slack Webhook', regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[a-zA-Z0-9]+/, severity: 'high' },
        { name: 'Twilio API Key', regex: /SK[0-9a-fA-F]{32}/, severity: 'high' },
        { name: 'SendGrid API Key', regex: /SG\.[0-9A-Za-z\-_]{22,}\.[0-9A-Za-z\-_]{43,}/, severity: 'high' },

        // Backend / Database
        { name: 'Firebase API Key', regex: /AIza[0-9A-Za-z\-_]{35}/, severity: 'medium' },
        { name: 'Supabase Key', regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/, severity: 'high' },
        { name: 'Database Connection String', regex: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^\s'"]{10,}/, severity: 'high' },

        // Cryptographic Material
        { name: 'Generic Private Key', regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/, severity: 'high' },
        { name: 'PGP Private Key', regex: /-----BEGIN PGP PRIVATE KEY BLOCK-----/, severity: 'high' },

        // JWT (long tokens that look like credentials)
        { name: 'JWT Token (hardcoded)', regex: /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/=]+/, severity: 'medium' },

        // Generic Patterns
        { name: 'Generic API Key Assignment', regex: /(?:api_key|apikey|api_secret|secret_key|access_token)\s*[=:]\s*['"][a-zA-Z0-9]{32,}['"]/, severity: 'medium' },
        { name: 'Password Assignment', regex: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{8,}['"]/, severity: 'medium' },
        { name: 'Bearer Token (hardcoded)', regex: /['"]Bearer\s+[A-Za-z0-9\-_.]{20,}['"]/, severity: 'medium' },
    ];

    private codePatterns = [
        { name: 'Eval Usage', regex: /\beval\(/, severity: 'medium', message: 'Avoid using eval() as it poses security risks.' },
        { name: 'Exec Usage', regex: /\bexec\(/, severity: 'medium', message: 'Check input sanitization when using exec().' },
        { name: 'innerHTML Assignment', regex: /\.innerHTML\s*=/, severity: 'medium', message: 'innerHTML can lead to XSS vulnerabilities. Consider using textContent or a sanitizer.' },
        { name: 'document.write', regex: /document\.write\(/, severity: 'medium', message: 'document.write() can lead to XSS vulnerabilities.' },
        { name: 'Unsafe Deserialization (Python)', regex: /pickle\.loads?\(/, severity: 'high', message: 'pickle deserialization can execute arbitrary code. Use safer alternatives.' },
        { name: 'SQL Injection Risk', regex: /(?:execute|query)\s*\(\s*['"`].*\$\{/, severity: 'high', message: 'Potential SQL injection via string interpolation. Use parameterized queries.' },
        { name: 'Hardcoded IP Address', regex: /['"](?:\d{1,3}\.){3}\d{1,3}(?::\d+)?['"]/, severity: 'low', message: 'Hardcoded IP address detected. Consider using environment variables.' },
        { name: 'Disabled SSL Verification', regex: /(?:rejectUnauthorized|verify_ssl|VERIFY_SSL)\s*[=:]\s*(?:false|False|0)/, severity: 'high', message: 'SSL verification is disabled. This is insecure in production.' },
    ];

    async scanFile(filePath: string): Promise<SecurityIssue[]> {
        const issues: SecurityIssue[] = [];
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split('\n');

            lines.forEach((line, index) => {
                const lineNumber = index + 1;

                // Skip comment lines that are clearly documentation
                const trimmed = line.trim();
                if (trimmed.startsWith('//') && trimmed.includes('example') && !trimmed.includes('=')) return;

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
