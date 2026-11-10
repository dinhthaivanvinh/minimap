// Lets someone change their character's color and draw on its face.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import styled from 'styled-components';
import { MAX_DRAWING_POINTS, MAX_STROKES, WORN_ITEMS, type CharacterDesign, type Stroke, type WornItem } from '../../shared/look.ts';
import type { TeamUser } from '../../shared/types.ts';
import { clampToFace, countPoints, extendStroke, strokePath } from '../lib/drawing.ts';
import type { Message } from '../lib/hooks.ts';
import { defaultDesign, DEFAULT_COLORS, lookFor } from '../lib/look.ts';
import { theme } from '../styles/theme.ts';
import { Button, Chip, Chips, FieldLabel, PanelHint, Row, StackPanel } from '../styles/ui.ts';
import { MochiArt } from './Mochi.tsx';
import { StatusLine } from './SheetNav.tsx';

const SKIN_TONES = ['#ffe3cc', '#f6c9a0', '#dca477', '#a9714b', '#6f4a33'];
const BODY_COLORS = [...SKIN_TONES, ...DEFAULT_COLORS];

const PEN_COLORS = [
  { name: 'Ink', value: theme.ink },
  { name: 'White', value: '#ffffff' },
  { name: 'Red', value: '#e5383b' },
  { name: 'Orange', value: '#ff8c42' },
  { name: 'Yellow', value: '#ffd23f' },
  { name: 'Green', value: '#3fa34d' },
  { name: 'Blue', value: '#2f6bff' },
  { name: 'Purple', value: '#8e5bd6' },
  { name: 'Pink', value: '#ff5d9e' },
];

const PEN_SIZES = [
  { name: 'Thin', value: 2 },
  { name: 'Medium', value: 3.5 },
  { name: 'Thick', value: 6 },
];

const WORN_NAMES: Record<WornItem, string> = { hat: 'Hat', glasses: 'Glasses', mustache: 'Mustache' };

const Canvas = styled.svg`
  display: block;
  width: 100%;
  max-width: 320px;
  aspect-ratio: 1;
  margin: 0 auto;
  border: ${theme.thinLine};
  border-radius: 18px;
  background: radial-gradient(${theme.divider} 1px, transparent 1.5px) 0 0 / 14px 14px, ${theme.white};
  cursor: crosshair;
  touch-action: none;
  user-select: none;
`;

const ToolGroup = styled.div`
  display: grid;
  gap: 5px;
`;

const Swatches = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
`;

const Swatch = styled.button<{ $color: string }>`
  width: 32px;
  height: 32px;
  padding: 0;
  border: ${theme.thinLine};
  border-radius: 50%;
  background: ${({ $color }) => $color};
  cursor: pointer;

  &[aria-pressed='true'] { box-shadow: 0 0 0 2px ${theme.paper}, 0 0 0 5px ${theme.ink}; }
`;

const CustomColor = styled.input`
  width: 42px;
  height: 32px;
  padding: 0;
  border: ${theme.thinLine};
  border-radius: 10px;
  background: ${theme.white};
  cursor: pointer;
`;

const Actions = styled(Row)`
  flex-wrap: wrap;
`;

const Hint = styled(PanelHint)`
  margin: 0;
`;

interface CharacterEditorProps {
  user: TeamUser;
  /** Whether the last save worked, shown under the Save button. */
  message: Message;
  onSave: (design: CharacterDesign) => void;
}

export function CharacterEditor({ user, message, onSave }: CharacterEditorProps) {
  const saved = user.look ?? defaultDesign(user.username);
  const savedKey = JSON.stringify(saved);
  const [draft, setDraft] = useState<CharacterDesign>(saved);
  const [penColor, setPenColor] = useState<string>(theme.ink);
  const [penSize, setPenSize] = useState(3.5);
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const [full, setFull] = useState(false);
  const canvasRef = useRef<SVGSVGElement>(null);

  // Take on changes saved from another device, unless there are unsaved edits here.
  const lastSaved = useRef(savedKey);
  useEffect(() => {
    if (lastSaved.current === savedKey) return;
    setDraft((current) => (JSON.stringify(current) === lastSaved.current ? (JSON.parse(savedKey) as CharacterDesign) : current));
    lastSaved.current = savedKey;
  }, [savedKey]);

  const isDirty = JSON.stringify(draft) !== savedKey;
  const pointsLeft = MAX_DRAWING_POINTS - countPoints(draft.strokes);

  function toDrawingSpace(event: ReactPointerEvent): [number, number] | null {
    const matrix = canvasRef.current?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return clampToFace(point.x, point.y);
  }

  function startDrawing(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    if (draft.strokes.length >= MAX_STROKES || pointsLeft < 1) {
      setFull(true);
      return;
    }
    const point = toDrawingSpace(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawing({ color: penColor, width: penSize, points: point });
  }

  function continueDrawing(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drawing) return;
    const point = toDrawingSpace(event);
    if (!point) return;
    if (drawing.points.length / 2 >= pointsLeft) {
      setFull(true);
      return;
    }
    setDrawing(extendStroke(drawing, point[0], point[1]));
  }

  function finishDrawing() {
    if (!drawing) return;
    setDraft({ ...draft, strokes: [...draft.strokes, drawing] });
    setDrawing(null);
  }

  function toggleWorn(item: WornItem) {
    const wearing = WORN_ITEMS.filter((other) => (other === item ? !draft.wearing.includes(item) : draft.wearing.includes(other)));
    setDraft({ ...draft, wearing });
  }

  function changeStrokes(strokes: Stroke[]) {
    setFull(false);
    setDraft({ ...draft, strokes });
  }

  return (
    <StackPanel>
      <h2>Your character</h2>
      <Hint>Change the body color, add accessories and draw on the face. It shows on the map in 2D and 3D.</Hint>

      <Canvas
        ref={canvasRef}
        viewBox="-2 -3 68 68"
        role="img"
        aria-label="Your character. Drag to draw on the face."
        data-drawing-canvas
        onPointerDown={startDrawing}
        onPointerMove={continueDrawing}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
      >
        <MochiArt look={lookFor(user.username, draft)} />
        {drawing && (
          <path
            d={strokePath(drawing)}
            fill="none"
            stroke={drawing.color}
            strokeWidth={drawing.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Canvas>

      {full && <Hint role="status">Your drawing is full. Undo a line or clear the drawing to add more.</Hint>}

      <ToolGroup>
        <FieldLabel>Pen</FieldLabel>
        <Swatches>
          {PEN_COLORS.map(({ name, value }) => (
            <Swatch key={value} type="button" $color={value} aria-label={`${name} pen`} aria-pressed={penColor === value} onClick={() => setPenColor(value)} />
          ))}
          <CustomColor type="color" aria-label="Custom pen color" value={penColor} onChange={(event) => setPenColor(event.target.value)} />
        </Swatches>
        <Chips>
          {PEN_SIZES.map(({ name, value }) => (
            <Chip key={value} type="button" aria-pressed={penSize === value} onClick={() => setPenSize(value)}>{name}</Chip>
          ))}
        </Chips>
      </ToolGroup>

      <Actions>
        <Button $small type="button" disabled={!draft.strokes.length} onClick={() => changeStrokes(draft.strokes.slice(0, -1))}>Undo line</Button>
        <Button $small type="button" disabled={!draft.strokes.length} onClick={() => changeStrokes([])}>Clear drawing</Button>
      </Actions>

      <ToolGroup>
        <FieldLabel>Body color</FieldLabel>
        <Swatches>
          {BODY_COLORS.map((value) => (
            <Swatch key={value} type="button" $color={value} aria-label={`Body color ${value}`} aria-pressed={draft.color === value} onClick={() => setDraft({ ...draft, color: value })} />
          ))}
          <CustomColor type="color" aria-label="Custom body color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} />
        </Swatches>
      </ToolGroup>

      <ToolGroup>
        <FieldLabel>Accessories</FieldLabel>
        <Chips>
          {WORN_ITEMS.map((item) => (
            <Chip key={item} type="button" aria-pressed={draft.wearing.includes(item)} onClick={() => toggleWorn(item)}>{WORN_NAMES[item]}</Chip>
          ))}
        </Chips>
      </ToolGroup>

      <Actions>
        <Button $primary type="button" disabled={!isDirty} onClick={() => onSave(draft)}>Save character</Button>
        <Button
          type="button"
          onClick={() => {
            setFull(false);
            setDraft(defaultDesign(user.username));
          }}
        >
          Start over
        </Button>
      </Actions>
      <StatusLine message={message} />
    </StackPanel>
  );
}
