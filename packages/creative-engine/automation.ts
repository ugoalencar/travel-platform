// ============================================================
// Automation primitives -- abstract, non-persisted types only.
//
// NO database table, NO persisted status enum, NO real automation engine.
// See docs/offer-growth/DATABASE-IMPACT-PLAN.md (Automation/
// AutomationExecution as prospective entities) and
// docs/offer-growth/SECURITY-THREAT-MAP.md (automation-loop risk) for what
// a real implementation still needs to address.
// ============================================================

/** What can cause an automation to run. Deliberately abstract: this package
 *  does not decide the real set of trigger sources (pipeline stage change?
 *  scheduled time? webhook?) -- that's a Stream A / implementation
 *  decision. `payload` carries whatever data the trigger source provides. */
export interface Trigger {
  id: string;
  /** Freeform trigger-source label, e.g. "pipeline.stage_changed". Not an
   *  enum on purpose -- no real trigger catalog exists yet. */
  type: string;
  payload?: unknown;
}

/** A single step an automation performs when triggered. Not tied to any
 *  concrete side effect (send message, publish content, move pipeline
 *  stage, etc.) -- `type` is a freeform label for the same reason as
 *  Trigger.type above. */
export interface Action {
  id: string;
  type: string;
  input?: unknown;
}

export type ExecutionResult =
  | { status: 'success'; actionId: string; output?: unknown }
  | { status: 'error'; actionId: string; message: string }
  | { status: 'skipped'; actionId: string; reason: string };

/** Runs a single action against a trigger, in memory, with no persistence
 *  and no real side effects -- exists only to prove the Trigger/Action/
 *  ExecutionResult shapes compose, for testing. Not an automation engine:
 *  it does not implement retries, scheduling, cycle detection, or rate
 *  limiting (all flagged as required before a real implementation ships --
 *  see SECURITY-THREAT-MAP.md "Automation loops"). */
export async function runMockAutomationStep(
  _trigger: Trigger,
  action: Action,
  handler: (action: Action) => Promise<unknown>,
): Promise<ExecutionResult> {
  try {
    const output = await handler(action);
    return { status: 'success', actionId: action.id, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', actionId: action.id, message };
  }
}
