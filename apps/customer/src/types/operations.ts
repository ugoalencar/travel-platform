// Mirrors packages/domain/types.ts Field Operations domain, as it comes
// back over the wire (JSON has no Date type, so date fields arrive as ISO
// strings).
//
// RoutePoint = PLAN. TransportOperation/OperationCheckpoint = EXECUTION.
// expectedAt is a derived field the API attaches to each checkpoint at
// read time (departure.departureAt + routePoint.plannedOffsetMinutes) --
// it is never persisted, and this frontend never invents its own copy of
// that computation beyond display-only "delay" arithmetic (see
// OperationDetailsPage.tsx).

import type { CheckpointType } from './transport';

export interface TransportOperation {
  id: string;
  agencyId: string;
  departureId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationCheckpoint {
  id: string;
  agencyId: string;
  operationId: string;
  routePointId: string;
  routePointName?: string;
  checkpointType: CheckpointType;
  arrivalCheckedAt?: string;
  departureCheckedAt?: string;
  notes?: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
  // Derived server-side, not a persisted column. Absent only if the
  // RoutePoint had no plannedOffsetMinutes.
  expectedAt?: string;
}

export interface CreateOperationInput {
  departureId: string;
}

export interface OperationWithCheckpoints {
  operation: TransportOperation;
  checkpoints: OperationCheckpoint[];
}
