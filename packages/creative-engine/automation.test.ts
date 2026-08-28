import { describe, it, expect } from 'vitest';
import { runMockAutomationStep, type Action, type Trigger } from './automation';

const trigger: Trigger = { id: 't1', type: 'pipeline.stage_changed', payload: { stage: 'won' } };

describe('runMockAutomationStep', () => {
  it('returns a success result when the handler resolves', async () => {
    const action: Action = { id: 'a1', type: 'noop' };
    const result = await runMockAutomationStep(trigger, action, () => Promise.resolve('ok'));

    expect(result).toEqual({ status: 'success', actionId: 'a1', output: 'ok' });
  });

  it('returns an error result with the thrown message when the handler rejects', async () => {
    const action: Action = { id: 'a2', type: 'failing' };
    const result = await runMockAutomationStep(trigger, action, () =>
      Promise.reject(new Error('boom')),
    );

    expect(result).toEqual({ status: 'error', actionId: 'a2', message: 'boom' });
  });

  it('stringifies a non-Error throw', async () => {
    const action: Action = { id: 'a3', type: 'failing-non-error' };
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- verifying non-Error throw stringification
    const result = await runMockAutomationStep(trigger, action, () => Promise.reject('raw string failure'));

    expect(result).toEqual({ status: 'error', actionId: 'a3', message: 'raw string failure' });
  });

  it('does not mutate the action across independent runs', async () => {
    const action: Action = { id: 'a4', type: 'noop', input: { count: 1 } };
    await runMockAutomationStep(trigger, action, (a) => Promise.resolve(a.input));
    expect(action.input).toEqual({ count: 1 });
  });
});
