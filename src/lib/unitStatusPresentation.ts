import type { UnitStatus } from './api/unitStatus';

export const UNIT_STATUS_OUTCOME_ORDER: readonly UnitStatus[] = [
  'passing',
  'failing_recovery_available',
  'failing_needs_analysis',
  'failing_no_measured_recovery',
  'review_required',
  'not_evaluated',
];

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  review_required: 'Review required',
  not_evaluated: 'Not evaluated',
  passing: 'Passing',
  failing_recovery_available: 'Recovery available',
  failing_needs_analysis: 'Needs analysis',
  failing_no_measured_recovery: 'No measured recovery',
};

export const UNIT_STATUS_OUTCOME_COLOR: Record<UnitStatus, string> = {
  passing: 'var(--ok-fg)',
  failing_recovery_available: 'var(--o2)',
  failing_needs_analysis: 'color-mix(in srgb,var(--o1) 68%,var(--panel))',
  failing_no_measured_recovery: 'var(--o1)',
  review_required: 'var(--ink2)',
  not_evaluated: 'var(--line)',
};
