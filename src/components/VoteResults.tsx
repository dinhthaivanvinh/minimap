// A vote's results as bars, most votes first, with the viewer's own picks marked. Once the
// vote has closed, the winner is highlighted, or a tie is shown. Named votes list who picked each option.
import styled, { css } from 'styled-components';
import { results, type VoteView } from '../../shared/vote.ts';
import { media, theme } from '../styles/theme.ts';

const List = styled.ol`
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Item = styled.li<{ $won: boolean }>`
  padding: 6px 10px;
  border: ${theme.thinLine};
  border-radius: 12px;
  background: ${theme.white};

  ${({ $won }) => $won && css`
    background: ${theme.butter};
    box-shadow: 0 3px 0 ${theme.ink};
  `}
`;

const Line = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-weight: 800;
`;

const Text = styled.span`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
`;

const Numbers = styled.span`
  flex: none;
  color: ${theme.inkSoft};
  font-size: 14px;
`;

const Mine = styled.span`
  flex: none;
  padding: 0 7px;
  border-radius: 8px;
  background: ${theme.mint};
  font-size: 12px;
`;

const Track = styled.div`
  height: 10px;
  margin-top: 4px;
  border: 2px solid ${theme.ink};
  border-radius: 6px;
  background: ${theme.paper};
  overflow: hidden;
`;

const Bar = styled.div`
  height: 100%;
  background: ${theme.bubblegum};
  transition: width .5s ease-out;

  ${media.reducedMotion} { transition: none; }
`;

const Names = styled.p`
  margin: 4px 0 0;
  color: ${theme.inkSoft};
  font-size: 13px;
  font-weight: 700;
  overflow-wrap: anywhere;
`;

export const Outcome = styled.p`
  margin: 0 0 8px;
  font-family: ${theme.displayFont};
  font-size: 18px;
  font-weight: 800;
`;

/** Who won, or a tie, once the vote has closed. */
function ResultOutcome({ vote, closed }: { vote: VoteView; closed: boolean }) {
  const { winners } = results(vote);
  if (!closed) return null;
  if (winners.length === 1) return <Outcome>🏆 {winners[0]!.text} wins</Outcome>;
  if (winners.length > 1) return <Outcome>Tie: {winners.map((w) => w.text).join(', ')}</Outcome>;
  return <Outcome>Nobody voted.</Outcome>;
}

export function VoteResults({ vote, mine, closed, nameOf }: {
  vote: VoteView;
  mine: string[] | undefined;
  closed: boolean;
  nameOf: (username: string) => string;
}) {
  const { options, winners, turnout } = results(vote);
  const won = new Set(closed ? winners.map((w) => w.id) : []);
  return (
    <div>
      <ResultOutcome vote={vote} closed={closed} />
      <List>
        {options.map((option) => {
          const share = turnout ? Math.round((option.count / turnout) * 100) : 0;
          return (
            <Item key={option.id} $won={won.has(option.id)}>
              <Line>
                <Text>{option.text}</Text>
                {mine?.includes(option.id) && <Mine>Your pick</Mine>}
                <Numbers>
                  {option.count} · {share}%
                </Numbers>
              </Line>
              <Track aria-hidden="true">
                <Bar style={{ width: `${share}%` }} />
              </Track>
              {option.pickedBy && option.pickedBy.length > 0 && <Names>{option.pickedBy.map(nameOf).join(', ')}</Names>}
            </Item>
          );
        })}
      </List>
    </div>
  );
}
