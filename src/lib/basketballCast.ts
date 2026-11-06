import type { TeamUser } from '../../shared/types.ts';

export const MAX_TEAMMATES = 6;
export interface BasketballCast { player: TeamUser; crowd: TeamUser[]; banners: Record<string,SupportBanner> }

/** Sample without replacement; callers keep these identities for the whole round. */
export function pickTeammates(users: TeamUser[], username: string | null, random = Math.random): string[] {
  const pool = users.filter(u => !username || u.username.toLowerCase() !== username.toLowerCase());
  const count = Math.min(MAX_TEAMMATES,pool.length);
  for (let i=0;i<count;i++) {
    const j = i+Math.floor(random()*(pool.length-i));
    [pool[i],pool[j]] = [pool[j]!,pool[i]!];
  }
  return pool.slice(0,count).map(user=>user.username);
}
export function basketballCast(users: TeamUser[], username: string | null, teammates?: readonly string[], banners: Record<string,SupportBanner> = {}): BasketballCast {
  const player = users.find(u => u.username.toLowerCase() === username?.toLowerCase()) ?? {
    username: username ?? 'Guest', nickname: username ?? 'Guest', look: null,
    place: null, status: '', updatedAt: null, claimed: false,
  };
  const eligible = users.filter(u => !username || u.username.toLowerCase() !== player.username.toLowerCase());
  const crowd = teammates === undefined ? eligible.slice(0,MAX_TEAMMATES) :
    [...new Set(teammates.map(name=>name.toLowerCase()))].slice(0,MAX_TEAMMATES)
      .flatMap(name=>eligible.filter(user=>user.username.toLowerCase()===name));
  return { player, crowd, banners: Object.fromEntries(crowd.flatMap(user=>banners[user.username] ? [[user.username,banners[user.username]!]] : [])) };
}
/** Standing spots alternate between the sidelines, keeping the hoop and shooter clear. */
export function crowdSpot(index: number): { side: number; row: number; x: number; z: number } {
  const side = index%2 ? 1 : -1, row = Math.floor(index/2);
  return {side,row,x:side*8,z:-5.8+row*4.4};
}

export function nameFontSize(user: TeamUser): number {
  const length = [...(user.nickname || user.username)].length;
  return length > 24 ? 9 : length > 16 ? 10 : 11;
}

export interface SupportBanner { pose: 'front' | 'left' | 'right'; text: string; color: string }
export interface CrowdSelection { teammates: string[]; banners: Record<string,SupportBanner> }
export function pickCrowd(users: TeamUser[], username: string | null, random = Math.random): CrowdSelection {
  const teammates = pickTeammates(users,username,random);
  const poses: SupportBanner['pose'][] = ['front','left','right'];
  const messages = ['LET’S GO!','GO TEAM!','SWISH!','YOU GOT IT!'];
  const colors = ['#a5ebce','#ffb8d2','#ffe39b'];
  const banners: Record<string,SupportBanner> = {};
  // One randomly chosen supporter on each sideline keeps the signs well spaced.
  for (const side of [0,1]) {
    const candidates=teammates.filter((_,i)=>i%2===side);
    if (!candidates.length) continue;
    const holder=candidates[Math.floor(random()*candidates.length)]!;
    const poseIndex=Math.floor(random()*poses.length);
    const pose=poses.splice(poseIndex,1)[0]!;
    banners[holder]={pose,text:messages[Math.floor(random()*messages.length)]!,color:colors[side]!};
  }
  return {teammates,banners};
}
export function bannerAngle(banner: SupportBanner): number {
  return banner.pose==='left' ? -7 : banner.pose==='right' ? 7 : 0;
}
