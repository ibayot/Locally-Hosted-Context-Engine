/**
 * Guardrails Module - Public API
 *
 * Security guardrails for the Reactive AI Code Review Engine.
 */

export {
    SecretScrubber,
    createSecretScrubber,
    scrubSecrets,
    type DetectedSecret,
    type SecretType,
    type ScrubResult,
    type SecretScrubberOptions,
    type SecretPattern,
} from './secretScrubber.js';
