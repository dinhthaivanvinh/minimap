import type { ReactNode } from 'react';
import styled, { css } from 'styled-components';
import type { TeamUser } from '../../shared/types.ts';
import { statusKind } from '../lib/look.ts';
import { BallotMark } from './BallotMark.tsx';
import { shownStatus } from '../lib/status.ts';
import { theme } from '../styles/theme.ts';
import { DeskSvg, MochiSvg } from './Mochi.tsx';

export type SelectHandler = (username: string, anchor: HTMLElement) => void;

const BadgeButton = styled.button<{ $floating?: boolean; $dimmed?: boolean }>`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  position: relative;

  ${({ $floating, $dimmed }) => $floating && css`
    pointer-events: auto;
    transition: opacity .25s;
    ${$dimmed && 'opacity: .25;'}
  `}
`;

export const BadgeFigure = styled.span<{ $selected?: boolean }>`
  position: relative;
  display: block;
  width: 52px;
  height: 52px;

  ${MochiSvg} { position: relative; z-index: 1; }
  ${DeskSvg} { z-index: 2; }

  ${({ $selected }) => $selected && css`
    &::before {
      content: '';
      position: absolute;
      inset: -6px;
      border: 3px dashed ${theme.focus};
      border-radius: 50%;
    }
  `}
`;

export const BadgeName = styled.span<{ $selected?: boolean }>`
  position: relative;
  z-index: 3;
  max-width: 110px;
  padding: 0 8px;
  overflow: hidden;
  border: ${theme.thinLine};
  border-radius: 10px;
  background: ${({ $selected }) => ($selected ? theme.butter : theme.paper)};
  font-family: ${theme.displayFont};
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const BadgeStatus = styled.span`
  max-width: 120px;
  margin-bottom: 2px;
  padding: 0 7px;
  border: ${theme.thinLine};
  border-radius: 10px 10px 10px 2px;
  background: ${theme.butter};
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
  white-space: nowrap;
`;

const BadgeTip = styled.span`
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  z-index: 5;
  display: none;
  width: max-content;
  max-width: 220px;
  padding: 5px 10px;
  transform: translateX(-50%);
  border: ${theme.thinLine};
  border-radius: 10px;
  background: ${theme.ink};
  color: ${theme.paper};
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  text-align: left;
  white-space: normal;
`;

const BadgeAlert = styled.span<{ $floating?: boolean }>`
  position: absolute;
  top: -2px;
  right: 50%;
  margin-right: -32px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: ${theme.thinLine};
  border-radius: 50%;
  background: ${theme.bubblegum};
  font-family: ${theme.displayFont};
  font-size: 15px;
  font-weight: 800;
  line-height: 1;

  &:hover ${BadgeTip} { display: block; }

  ${({ $floating }) => $floating && css`
    position: relative;
    top: auto;
    right: auto;
    margin: 0 0 2px;
  `}
`;

interface BadgeProps {
  user: TeamUser;
  figure?: ReactNode;
  /** A badge floating over the 3D scene, rather than part of the 2D map. */
  floating?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  /** Invited to a vote shown on the map, and hasn't voted yet. */
  waiting?: boolean;
  onSelect: SelectHandler;
}

// A person's name with their status: shown if short, behind a "!" if long.
export function Badge({ user, figure, floating, selected, dimmed, waiting = false, onSelect }: BadgeProps) {
  const status = shownStatus(user);
  const kind = statusKind(status);
  return (
    <BadgeButton
      type="button"
      $floating={floating}
      $dimmed={dimmed}
      data-badge
      data-username={user.username}
      aria-label={`${status ? `${user.nickname}: ${status}` : user.nickname}${waiting ? ", hasn't voted yet" : ''}`}
      onClick={(event) => onSelect(user.username, event.currentTarget)}
    >
      {kind === 'short' && <BadgeStatus>{status}</BadgeStatus>}
      {kind === 'long' && (
        <BadgeAlert $floating={floating}>
          !<BadgeTip>{status}</BadgeTip>
        </BadgeAlert>
      )}
      <BallotMark on={waiting} />
      {figure}
      <BadgeName $selected={selected}>{user.nickname}</BadgeName>
    </BadgeButton>
  );
}
