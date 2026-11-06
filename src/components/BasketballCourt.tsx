import type { TeamUser } from '../../shared/types.ts';
import { Component, lazy, Suspense, useRef, type ReactNode } from 'react';
import styled from 'styled-components';
import { COURT, FREE_THROW_Z, courtMarkings, floorPath } from '../lib/basketballCourt.ts';
import { MochiArt } from './Mochi.tsx';
import { lookFor } from '../lib/look.ts';
import { crowdSpot, nameFontSize, bannerAngle, type SupportBanner, type BasketballCast } from '../lib/basketballCast.ts';
import { useElementSize } from '../lib/hooks.ts';

const Court3D = lazy(() => import('./BasketballCourt3D.tsx'));
export interface CourtProps {
  cast: BasketballCast;
  shot: { id: number; at: number; hit: boolean } | null;
  elapsed: number;
  reduced: boolean;
}
export interface BasketballCourtProps extends CourtProps {
  mode: '2d' | '3d';
  onFail: () => void;
}
const Host = styled.div`
  position: absolute; inset: 0; overflow: hidden;
  > svg { display: block; width: 100%; height: 100%; }
  .arcade-banner { width: 62px; height: 18px; border: 2px solid #25304a; border-radius: 4px; box-shadow: 0 2px 0 #090e1b80; color: #22314b; font: 900 9px/14px sans-serif; text-align: center; white-space: nowrap; }
  .arcade-name { width: max-content; max-width: 104px; margin: 0 auto; padding: 3px 6px; border: 1px solid #fff3; border-radius: 5px; background: #111c2ee8; color: #fff0d4; font: 800 11px/13px sans-serif; overflow-wrap: anywhere; text-align: center; }
`;

export function ballPose({ shot, elapsed, reduced }: CourtProps) {
  const flight = shot ? Math.max(0, (elapsed - shot.at) / 650) : 1;
  const flying = !!shot && flight < 1;
  const p = flying && !reduced ? flight : 0;
  return {
    x: flying ? 320 + (shot.hit ? 0 : (shot.id % 2 ? 175 : -175)) * p : 320,
    y: flying ? 440 - 225 * p - Math.sin(Math.PI * p) * 205 : 440,
    scale: flying ? 1 - p * 0.52 : 1,
    rotation: reduced ? 0 : p * 270,
    visible: !reduced || !flying,
  };
}
function CharacterName({ user, x, bottom, scale }: { user: TeamUser; x: number; bottom: number; scale: number }) {
  return <foreignObject x={x-56*scale} y={bottom-52*scale} width={112*scale} height={52*scale}>
    <div style={{height:'100%',display:'flex',alignItems:'end'}}>
      <div className="arcade-name" data-arcade-name={user.username} title={user.username}
        style={{fontSize:nameFontSize(user)*scale,lineHeight:`${(nameFontSize(user)+2)*scale}px`,maxWidth:104*scale,padding:`${3*scale}px ${6*scale}px`}}>{user.nickname || user.username}</div>
    </div>
  </foreignObject>;
}
function SupportSign({ banner, scale }: { banner: SupportBanner; scale: number }) {
  const x=banner.pose==='left' ? -5*scale : banner.pose==='right' ? 5*scale : 0;
  return <g transform={`translate(${x} ${-3*scale}) rotate(${bannerAngle(banner)})`} aria-hidden="true">
    <rect x={-31*scale} y={-9*scale} width={62*scale} height={18*scale} rx={4*scale} fill={banner.color} stroke="#25304a" strokeWidth={2*scale}/>
    <text textAnchor="middle" y={3*scale} fill="#22314b" fontFamily="sans-serif" fontSize={9*scale} fontWeight="900">{banner.text}</text>
  </g>;
}
function Court2D(props: CourtProps & { viewWidth: number; nameScale: number; hidden: boolean }) {
  const ball = ballPose(props);
  const recent = props.shot ? Math.max(0,props.elapsed-props.shot.at) : 2000;
  const release = props.reduced || recent > 650 ? 0 : Math.sin(Math.PI * Math.min(1,recent/500));
  const basketCheer = props.shot?.hit && recent < 1400 ? 1 : 0;
  const playerLook = lookFor(props.cast.player.username,props.cast.player.look);
  return <svg viewBox={`${320 - props.viewWidth / 2} 0 ${props.viewWidth} 520`} role="img" aria-label="2D basketball arcade court" aria-hidden={props.hidden}>
    <defs>
      <linearGradient id="hoop-wall" x2="0" y2="1"><stop stopColor="#192446"/><stop offset="1" stopColor="#34435b"/></linearGradient>
      <linearGradient id="hoop-floor" x2="0" y2="1"><stop stopColor="#cc7952"/><stop offset="1" stopColor="#f4be7b"/></linearGradient>
      <radialGradient id="hoop-ball"><stop offset="0" stopColor="#ffbf68"/><stop offset="1" stopColor="#ef6b32"/></radialGradient>
      <filter id="hoop-glow"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    <rect x="-640" width="1920" height="520" fill="url(#hoop-wall)"/>
    <path d="m18 0 68 265M622 0l-68 265" stroke="#65e7df" strokeOpacity=".12" strokeWidth="45"/>
    <path d="M-640 266h1920v254H-640z" fill="url(#hoop-floor)"/>
    <path d={floorPath([
      {x:-COURT.laneHalfWidth,z:COURT.baseline}, {x:COURT.laneHalfWidth,z:COURT.baseline},
      {x:COURT.laneHalfWidth,z:FREE_THROW_Z}, {x:-COURT.laneHalfWidth,z:FREE_THROW_Z},
    ]) + ' Z'} fill="#b56c54" />
    <g stroke="#fff2cd" strokeWidth="2.2" fill="none" strokeLinejoin="round" strokeLinecap="round">
      {courtMarkings().map((mark,i) => <path key={i} d={floorPath(mark.points)} strokeDasharray={mark.dashed ? '5 6' : undefined} />)}
    </g>
    <path d="M320 34v116" stroke="#101b32" strokeWidth="16"/>
    <rect x="205" y="76" width="230" height="142" rx="12" fill="#091c30" opacity=".5" transform="translate(0 8)"/>
    <rect x="205" y="76" width="230" height="142" rx="12" fill="#d9f5ee" fillOpacity=".9" stroke="#6fe8dd" strokeWidth="5"/>
    <path d="M285 146h70v62h-70z" fill="none" stroke="#f36d4d" strokeWidth="5"/>
    <path d="m271 223 18 66h62l18-66M278 241l73 48m11-48-73 48m-3-24h69m-48-39 5 62m21-62-5 62" stroke="#fff5de" strokeWidth="2" fill="none"/>
    <ellipse cx="320" cy="220" rx="51" ry="10" fill="none" stroke="#fb7c4b" strokeWidth="8"/>
    <ellipse cx="320" cy="220" rx="53" ry="11" fill="none" stroke="#ff9760" strokeWidth="3" filter="url(#hoop-glow)"/>
    <text x="320" y="48" textAnchor="middle" fill="#a5fff0" fontSize="16" fontWeight="900" letterSpacing="8">MINIMAP ARENA</text>
    <rect x="20" y="246" width="136" height="34" rx="3" fill="#183c49"/><text x="88" y="269" textAnchor="middle" fill="#95ecda" fontSize="15" fontWeight="900">HOOP TIME</text>
    <rect x="484" y="246" width="136" height="34" rx="3" fill="#3d2545"/><text x="552" y="269" textAnchor="middle" fill="#ffc3dd" fontSize="15" fontWeight="900">MAKE IT RAIN</text>
    <g>
      {props.cast.crowd.map((user,i) => {
        const spot = crowdSpot(i);
        const x = 320+spot.side*Math.min(props.viewWidth/2-60*props.nameScale,205+spot.row*35);
        const bob = props.reduced ? 0 : Math.max(0,Math.sin(props.elapsed/(basketCheer ? 95 : 260)+i*1.9))*(basketCheer ? 8 : 2);
        const y = [280,385,500][spot.row]!-bob;
        const look = lookFor(user.username,user.look);
        const banner=props.cast.banners[user.username];
        const lean=banner ? bannerAngle(banner)*.6 : 0;
        return <g key={user.username} data-arcade-fan={user.username} transform={`translate(${x} ${y})`}>
          <ellipse cy="2" rx="21" ry="5" fill="#24182b" opacity=".2"/>
          <g transform={`translate(-24 -47) scale(.75) rotate(${lean} 32 58)`}><MochiArt look={look}/></g>
          {banner && <g data-arcade-banner={user.username} data-banner-pose={banner.pose}><SupportSign banner={banner} scale={props.nameScale}/></g>}
          <CharacterName user={user} x={0} bottom={-50} scale={props.nameScale}/>

        </g>;
      })}
    </g>
    <g data-arcade-player={props.cast.player.username} transform={`translate(0 ${-release*8})`}>

      <ellipse cx="260" cy="491" rx="40" ry="10" fill="#24182b" opacity=".22"/>
      <g transform={`translate(216 398) rotate(${-release*6} 48 82) scale(1.4)`}>
        <MochiArt look={playerLook}/>
      </g>
    </g>
    <CharacterName user={props.cast.player} x={260} bottom={515} scale={props.nameScale}/>
    <ellipse cx={ball.x} cy="486" rx={32 * ball.scale} ry={9 * ball.scale} fill="#24182b" opacity=".22"/>
    {ball.visible && <g transform={`translate(${ball.x} ${ball.y}) scale(${ball.scale}) rotate(${ball.rotation})`}>
      <circle r="32" fill="url(#hoop-ball)" stroke="#572f2b" strokeWidth="2.5"/>
      <path d="M-32 0h64M0-32v64M-22-23q30 23 0 46m44-46q-30 23 0 46" stroke="#572f2b" strokeWidth="2" fill="none"/>
      <path d="M-19-19q6-9 18-9" stroke="#ffdc99" strokeWidth="4" strokeLinecap="round" fill="none"/>
    </g>}
  </svg>;
}
class CourtGuard extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}
export function BasketballCourt({ mode, onFail, ...props }: BasketballCourtProps) {
  const host = useRef<HTMLDivElement>(null);
  const size = useElementSize(host);
  const viewWidth = size.height ? size.width / size.height * 520 : 640;
  return <Host ref={host}>
    <Court2D {...props} viewWidth={viewWidth} nameScale={size.height ? 520/size.height : 1} hidden={mode === '3d'} />
    {mode === '3d' && <CourtGuard onFail={onFail}><Suspense fallback={null}><Court3D {...props} onFail={onFail} /></Suspense></CourtGuard>}
  </Host>;
}
