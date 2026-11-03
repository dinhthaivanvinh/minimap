// The home page's side panel: two clocks, office weather and the QR code.
import { useMemo, useRef } from 'react';
import qrcode from 'qrcode-generator';
import styled from 'styled-components';
import type { Clock, TeamState, Weather } from '../../shared/types.ts';
import { useNow } from '../lib/hooks.ts';
import { theme } from '../styles/theme.ts';
import { Button } from '../styles/ui.ts';

// Lets addresses with non-English letters scan correctly.
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']!;

const QUIET_ZONE = 4; // Blank modules around the code, which scanners need.

const Info = styled.section`
  flex: none;
  padding: 10px 14px 12px;
  border: ${theme.line};
  border-radius: 18px;
  background: ${theme.paper};
  box-shadow: 0 5px 0 ${theme.ink};
`;

const ClockGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
`;

const ClockCell = styled.div`
  display: grid;
  min-width: 0;

  & + & { padding-left: 10px; border-left: ${theme.dashedLine}; }
`;

const ClockLabel = styled.span`
  overflow: hidden;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.3;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const ClockTime = styled.span`
  font: 800 32px/1.05 ${theme.displayFont};
  font-variant-numeric: tabular-nums;
`;

const ClockDay = styled.span`
  color: ${theme.inkSoft};
  font-size: 13px;
  line-height: 1.25;
  white-space: nowrap;
`;

const InfoRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: ${theme.dashedLine};
`;

const WeatherBox = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const WeatherIcon = styled.span`
  flex: none;
  font-size: 34px;
  line-height: 1;
`;

const WeatherText = styled.div`
  display: grid;
  min-width: 0;
`;

const WeatherTemp = styled.span`
  font: 800 22px/1.1 ${theme.displayFont};
`;

const WeatherSummary = styled.span`
  overflow-wrap: anywhere;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
`;

const WeatherPlace = styled.span`
  overflow-wrap: anywhere;
  color: ${theme.inkSoft};
  font-size: 13px;
  line-height: 1.25;
`;

const WeatherCredit = styled.p`
  margin: 6px 0 0;
  color: ${theme.inkSoft};
  font-size: 12px;
  line-height: 1.2;
`;

const QrCaption = styled.p`
  flex: 1;
  margin: 0;
  font-weight: 800;
`;

const QrNote = styled.p`
  margin: 8px 0 0;
  padding-top: 8px;
  border-top: ${theme.dashedLine};
  color: ${theme.inkSoft};
  font-size: 13px;
  line-height: 1.3;
`;

const QrButton = styled.button`
  flex: none;
  width: 92px;
  height: 92px;
  padding: 0;
  border: ${theme.thinLine};
  border-radius: 10px;
  background: ${theme.white};
  overflow: hidden;
  cursor: zoom-in;

  svg { display: block; width: 100%; height: 100%; }
`;

const QrDialog = styled.dialog`
  width: min(460px, calc(100vw - 32px));
  padding: 18px 22px 20px;
  border: ${theme.line};
  border-radius: 22px;
  background: ${theme.paper};
  box-shadow: 0 6px 0 ${theme.ink};
  color: ${theme.ink};
  text-align: center;

  &::backdrop { background: rgba(42, 38, 87, .55); }

  h2 { font-size: 24px; }
`;

const QrUrl = styled.p`
  margin: 0 0 12px;
  font-weight: 800;
  overflow-wrap: anywhere;
`;

// ---- Clocks -------------------------------------------------------------

function formatters(timeZone: string) {
  try {
    return {
      time: new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
      day: new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }),
    };
  } catch {
    return null; // This browser doesn't know the zone.
  }
}

function ClockFace({ clock, now }: { clock: Clock; now: Date }) {
  const format = useMemo(() => formatters(clock.timeZone), [clock.timeZone]);
  return (
    <ClockCell>
      <ClockLabel>{clock.label}</ClockLabel>
      <ClockTime>{format ? format.time.format(now) : '--:--'}</ClockTime>
      <ClockDay>{format ? format.day.format(now) : clock.timeZone}</ClockDay>
    </ClockCell>
  );
}

function Clocks({ clocks }: { clocks: Clock[] }) {
  const now = useNow(1000);
  return (
    <ClockGrid>
      {clocks.map((clock, i) => (
        <ClockFace key={i} clock={clock} now={now} />
      ))}
    </ClockGrid>
  );
}

// ---- Weather ------------------------------------------------------------

// WMO weather codes, as used by Open-Meteo.
function describeWeather(code: number, isDay: boolean): [icon: string, summary: string] {
  if (code === 0) return isDay ? ['☀️', 'Clear sky'] : ['🌙', 'Clear sky'];
  if (code === 1) return isDay ? ['🌤️', 'Mostly clear'] : ['🌙', 'Mostly clear'];
  if (code === 2) return isDay ? ['⛅', 'Partly cloudy'] : ['☁️', 'Partly cloudy'];
  if (code === 3) return ['☁️', 'Cloudy'];
  if (code === 45 || code === 48) return ['🌫️', 'Foggy'];
  if (code >= 51 && code <= 57) return ['🌦️', 'Drizzle'];
  if (code >= 61 && code <= 67) return ['🌧️', 'Rain'];
  if (code >= 71 && code <= 77) return ['🌨️', 'Snow'];
  if (code >= 80 && code <= 82) return ['🌧️', 'Showers'];
  if (code === 85 || code === 86) return ['🌨️', 'Snow showers'];
  if (code >= 95) return ['⛈️', 'Thunderstorm'];
  return ['🌡️', 'Weather'];
}

function WeatherCard({ weather, place }: { weather: Weather | null; place: string }) {
  const [icon, summary] = weather ? describeWeather(weather.code, weather.isDay) : ['🌡️', 'Weather unavailable'];
  return (
    <WeatherBox>
      <WeatherIcon aria-hidden="true">{icon}</WeatherIcon>
      <WeatherText>
        {weather && <WeatherTemp>{Math.round(weather.temperature)}°C</WeatherTemp>}
        <WeatherSummary>{summary}</WeatherSummary>
        <WeatherPlace>{place}</WeatherPlace>
      </WeatherText>
    </WeatherBox>
  );
}

// ---- QR code ------------------------------------------------------------

function QrImage({ url, className }: { url: string; className?: string }) {
  const { path, full } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const size = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (qr.isDark(row, col)) d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { path: d, full: size + QUIET_ZONE * 2 };
  }, [url]);

  return (
    <svg className={className} viewBox={`0 0 ${full} ${full}`} shapeRendering="crispEdges" role="img" aria-label="QR code">
      <rect width={full} height={full} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

const QrLarge = styled(QrImage)`
  display: block;
  width: 100%;
  margin: 10px 0 8px;
  aspect-ratio: 1;
`;

// A QR code for localhost would only open the phone's own address.
function teamAddress(publicUrl: string): string {
  if (publicUrl) return publicUrl;
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  return isLocal ? '' : `${location.origin}/`;
}

// ---- Panel --------------------------------------------------------------

export function InfoPanel({ state }: { state: TeamState }) {
  const { settings, weather } = state;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const url = teamAddress(settings.publicUrl);
  const hasOffice = Boolean(settings.officeName);

  return (
    <Info aria-label="Time, weather and QR code">
      <Clocks clocks={settings.clocks} />

      {(hasOffice || url) && (
        <InfoRow>
          {hasOffice ? (
            <WeatherCard weather={weather} place={settings.officeName} />
          ) : (
            <QrCaption>Scan to open this map on your phone</QrCaption>
          )}
          {url && (
            <QrButton
              type="button"
              title="Show a larger QR code"
              aria-label="Show a larger QR code"
              onClick={() => dialogRef.current?.showModal()}
            >
              <QrImage url={url} />
            </QrButton>
          )}
        </InfoRow>
      )}

      {hasOffice && (
        <WeatherCredit>
          Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a>
        </WeatherCredit>
      )}

      {!url && (
        <QrNote>
          To show a QR code, set the team address on the <a href="/admin">Admin page</a>.
        </QrNote>
      )}

      <QrDialog
        ref={dialogRef}
        aria-label="QR code for this map"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current.close(); // A click on the backdrop.
        }}
      >
        <h2>Scan to open the map</h2>
        {url && <QrLarge url={url} />}
        <QrUrl>{url}</QrUrl>
        <Button type="button" onClick={() => dialogRef.current?.close()}>Close</Button>
      </QrDialog>
    </Info>
  );
}
