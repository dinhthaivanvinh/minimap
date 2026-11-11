// Apply server-confirmed member edits without adding a person who has since left the roster.
import type { TeamUser } from '../../shared/types.ts';
import type { FundPerson } from '../../shared/fund.ts';

export interface MemberUpdates {
  onUserSaved: (user: TeamUser) => void;
  onFundSaved: (people: FundPerson[]) => void;
}

export function replaceSavedMember(users: TeamUser[], saved: TeamUser): TeamUser[] {
  if (!users.some((user) => user.username === saved.username)) return users;
  return users.map((user) => (user.username === saved.username ? saved : user));
}
