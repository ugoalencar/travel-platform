import { useState } from 'react';

export interface TabItem {
  key: string;
  label: string;
}

interface TabsProps {
  tabs: readonly TabItem[];
  defaultKey?: string;
  children: (activeKey: string) => React.ReactNode;
}

// Small, generic pill tab-switcher -- no tab/pill component existed
// anywhere in the codebase before this. Local, uncontrolled state (no
// URL sync) since none of its current uses need deep-linking to a tab.
export function Tabs({ tabs, defaultKey, children }: TabsProps) {
  const [active, setActive] = useState(defaultKey ?? tabs[0]?.key ?? '');

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-full bg-slate-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={[
              'shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
              active === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{children(active)}</div>
    </div>
  );
}
