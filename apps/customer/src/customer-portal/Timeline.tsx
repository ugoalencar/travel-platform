// Minimal vertical timeline for the customer portal (e.g. trip lifecycle,
// itinerary steps). Scoped to apps/customer only -- Wave 1's Agency
// Timeline concept was never built, and this is a fresh, small component
// rather than a shared design-system primitive, so it makes no
// cross-app assumptions.
export interface TimelineStep {
  key: string;
  label: string;
  detail?: string;
  state: 'done' | 'current' | 'upcoming';
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="flex flex-col gap-0">
      {steps.map((step, index) => (
        <li key={step.key} className="relative flex gap-3 pb-6 last:pb-0">
          {index < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={`absolute left-[11px] top-6 h-full w-0.5 ${
                step.state === 'done' ? 'bg-teal-400' : 'bg-slate-200'
              }`}
            />
          )}
          <span
            aria-hidden="true"
            className={`z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              step.state === 'done'
                ? 'bg-teal-500 text-white'
                : step.state === 'current'
                  ? 'bg-amber-400 text-amber-950 ring-4 ring-amber-100'
                  : 'bg-slate-200 text-slate-500'
            }`}
          >
            {step.state === 'done' ? '✓' : index + 1}
          </span>
          <div className="flex-1 pt-0.5">
            <p
              className={`text-sm font-semibold ${
                step.state === 'upcoming' ? 'text-slate-400' : 'text-slate-900'
              }`}
            >
              {step.label}
            </p>
            {step.detail && (
              <p className={`text-xs ${step.state === 'upcoming' ? 'text-slate-400' : 'text-slate-600'}`}>
                {step.detail}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
