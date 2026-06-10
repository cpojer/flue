// Prompt copied to the user's clipboard by the "Copy Prompt" CTA in the hero.
export const COPY_PROMPT = `Read https://flueframework.com/start.md then help create my first agent...`;

export const HERO = `import { createAgent } from '@flue/runtime';
import { local } from '@flue/runtime/node';

export default createAgent(() => ({
  model: 'anthropic/claude-fable-5',
  sandbox: local(),
  instructions: \`
    Help customers by reading the workspace,
    investigating issues, and proposing fixes.
  \`,
}));`;
