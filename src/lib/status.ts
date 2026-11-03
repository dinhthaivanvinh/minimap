// A one-tap way to stop working for the day, moving someone to Off with a reason.

export const STOP_WORK_REASONS = [
  { label: 'Leaving early', status: 'Left early', icon: '🏃' },
] as const;

export function isStopWorkStatus(status: string): boolean {
  return STOP_WORK_REASONS.some((reason) => reason.status === status);
}

/** Choosing any place by hand means the reason for stopping no longer applies. */
export function placeChange(place: string, currentStatus: string): { place: string; status?: string } {
  return isStopWorkStatus(currentStatus) ? { place, status: '' } : { place };
}
