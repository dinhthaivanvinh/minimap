import test from 'node:test';
import assert from 'node:assert/strict';
import { basketballCast, pickTeammates, pickCrowd, MAX_TEAMMATES } from './basketballCast.ts';
import type { TeamUser } from '../../shared/types.ts';

const users: TeamUser[] = ['An','Binh','Chi'].map(username => ({
  username,nickname:username,look:{color:'#aa99ff',wearing:['hat'],strokes:[]},
  place:null,status:'',updatedAt:null,claimed:true,
}));
test('the authenticated member uses their saved character and cheers come from other members', () => {
  const cast = basketballCast(users,'binh');
  assert.equal(cast.player,users[1]);
  assert.deepEqual(cast.crowd.map(user=>user.username),['An','Chi']);
  assert.deepEqual(cast.player.look?.wearing,['hat']);
});
test('guests and missing members have a player without borrowing a teammate identity', () => {
  const guest = basketballCast(users,null);
  assert.equal(guest.player.username,'Guest');
  assert.equal(guest.player.look,null);
  assert.deepEqual(guest.crowd,users);
  assert.equal(basketballCast(users,'new-member').player.username,'new-member');
  assert.deepEqual(basketballCast([],null).crowd,[]);
  const namedGuest = { ...users[0]!, username: 'Guest' };
  assert.deepEqual(basketballCast([namedGuest],null).crowd,[namedGuest]);
});

test('each play samples at most six unique teammates and never includes the player', () => {
  const team = Array.from({length:40},(_,i)=>({...users[0]!,username:`member-${i}`}));
  const first = pickTeammates(team,'member-0',()=>0);
  const second = pickTeammates(team,'member-0',()=>.999);
  assert.equal(first.length,MAX_TEAMMATES);
  assert.equal(new Set(first).size,MAX_TEAMMATES);
  assert.ok(!first.includes('member-0'));
  assert.notDeepEqual(first,second);
  assert.equal(team[0]?.username,'member-0');
  assert.deepEqual(pickTeammates([],null),[]);
});
test('the sampled cast stays stable through team updates and uses current names and looks', () => {
  const selected = ['Chi','An'];
  const changed = [{...users[0]!,nickname:'New name'},users[2]!,users[1]!];
  const cast = basketballCast(changed,'Binh',selected);
  assert.deepEqual(cast.crowd.map(u=>u.username),selected);
  assert.equal(cast.crowd[1]?.nickname,'New name');
  assert.deepEqual(basketballCast([users[1]!],'Binh',selected).crowd,[]);
});


test('support banners belong to sampled teammates, use distinct poses and stay with the round', () => {
  const team = Array.from({length:20},(_,i)=>({...users[0]!,username:`member-${i}`}));
  const selection = pickCrowd(team,'member-0',()=>0);
  const holders=Object.keys(selection.banners);
  assert.equal(holders.length,2);
  assert.ok(holders.every(name=>selection.teammates.includes(name) && name!=='member-0'));
  assert.equal(new Set(Object.values(selection.banners).map(b=>b.pose)).size,2);
  const cast=basketballCast(team,'member-0',selection.teammates,selection.banners);
  assert.deepEqual(cast.banners,selection.banners);
  const changed=team.filter(u=>u.username!==holders[0]);
  assert.equal(Object.keys(basketballCast(changed,'member-0',selection.teammates,selection.banners).banners).length,1);
  assert.deepEqual(pickCrowd([],null).banners,{});
});
