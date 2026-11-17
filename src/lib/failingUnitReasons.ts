import type { UnitStatusItem } from './api/unitStatus';

export interface FailingUnitReasonGroup {
  key: 'recovery_available' | 'no_viable_recovery' | 'no_usable_extra_ports' | 'other_saved_result' | 'analysis_out_of_date' | 'no_saved_analysis';
  title: string;
  description: string;
  color: string;
  count: number;
  share: number;
  width: number;
  resultStatuses: string[];
}

type GroupDefinition = Pick<FailingUnitReasonGroup, 'key' | 'title' | 'description' | 'color'> & {
  matches: (unit: UnitStatusItem) => boolean;
};

const GROUPS: readonly GroupDefinition[] = [
  {
    key: 'recovery_available',
    title: 'Recovery available',
    description: 'The latest current analysis has recommended swaps not yet recorded.',
    color: 'var(--o2)',
    matches: unit => unit.status === 'failing_recovery_available',
  },
  {
    key: 'no_viable_recovery',
    title: 'No viable recovery found',
    description: 'The latest current analysis found no measured extra port that brings the failing channels under the limit.',
    color: 'var(--o3)',
    matches: unit => unit.status === 'failing_no_measured_recovery' && unit.latest_analysis?.result_status === 'fail_no_viable_recovery',
  },
  {
    key: 'no_usable_extra_ports',
    title: 'No usable extra ports',
    description: 'The latest current analysis had no measured extra ports to use.',
    color: 'var(--o1)',
    matches: unit => unit.status === 'failing_no_measured_recovery' && unit.latest_analysis?.result_status === 'not_applicable_no_extra_ports',
  },
  {
    key: 'other_saved_result',
    title: 'Other saved result',
    description: 'The latest current analysis ended with another result and no unused recommendations.',
    color: 'var(--muted)',
    matches: unit => unit.status === 'failing_no_measured_recovery'
      && unit.latest_analysis?.result_status !== 'fail_no_viable_recovery'
      && unit.latest_analysis?.result_status !== 'not_applicable_no_extra_ports',
  },
  {
    key: 'analysis_out_of_date',
    title: 'Analysis out of date',
    description: 'Measurements changed after the latest saved analysis.',
    color: 'color-mix(in srgb,var(--o1) 68%,var(--panel))',
    matches: unit => unit.status === 'failing_needs_analysis' && unit.latest_analysis !== null,
  },
  {
    key: 'no_saved_analysis',
    title: 'No saved analysis',
    description: 'No replacement analysis has been saved for this unit.',
    color: 'var(--line)',
    matches: unit => unit.status === 'failing_needs_analysis' && unit.latest_analysis === null,
  },
];

export interface FailingUnitReasons {
  total: number;
  groups: FailingUnitReasonGroup[];
}

export function groupFailingUnitReasons(units: readonly UnitStatusItem[]): FailingUnitReasons {
  const failing = units.filter(unit => unit.status.startsWith('failing_'));
  const grouped = GROUPS.map(definition => {
    const members = failing.filter(definition.matches);
    return {
      key: definition.key,
      title: definition.title,
      description: definition.description,
      color: definition.color,
      count: members.length,
      resultStatuses: [...new Set(members.flatMap(unit => unit.latest_analysis ? [unit.latest_analysis.result_status] : []))].sort(),
    };
  }).filter(group => group.count > 0);
  const largest = Math.max(...grouped.map(group => group.count), 1);

  return {
    total: failing.length,
    groups: grouped.map(group => ({
      ...group,
      share: Math.round(group.count / failing.length * 100),
      width: group.count / largest * 100,
    })),
  };
}
