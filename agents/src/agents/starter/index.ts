import type { Agent } from '../../shared/types.ts';

export const starterAgent: Agent<void, { status: 'ready' }> = {
  name: 'starter',
  async run(_input, context) {
    context.logger.info('LegalRoute agent runtime is ready.');
    return { status: 'ready' };
  },
};
