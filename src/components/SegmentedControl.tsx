import type { Choice } from '../types';

export function SegmentedControl<T extends string | number>({ label, options, value, onChange, describedBy, size = 'compact', disabledValues = [] }: {
  label: string; options: readonly Choice<T>[]; value: T; onChange: (value: T) => void;
  describedBy?: string; size?: 'summary' | 'compact' | 'results'; disabledValues?: readonly T[];
}) {
  return <div role="group" aria-label={label} aria-describedby={describedBy} className={`segmented-control segmented-${size}`}>
    {options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} disabled={disabledValues.includes(option.value)} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}
