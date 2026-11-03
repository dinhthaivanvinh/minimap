# Team Minimap

A cute 2D and 3D map showing where your team is working today. It's a React and TypeScript frontend (built with Vite and styled with styled-components) and one small Node.js server with no dependencies. There's no database: data is kept in a JSON file.

| Page | Address | Who uses it |
|---|---|---|
| Map | `/` | Everyone. Add `?mode=3d` for a wall TV |
| My status | `/me` | Team members claim a username, then set their nickname, place and status |
| Admin | `/admin` | The admin creates usernames, and sets the team address, clocks and office location |

## Run on your own computer (no Docker)

You need [Node.js](https://nodejs.org) 24 or newer.

1. Copy `.env.example` to `.env` and set `ADMIN_PASSWORD`.
2. Install the dependencies:

   ```bash
   npm install
   ```

3. Build the pages and start the server:

   ```bash
   npm start
   ```

4. Open http://localhost:8080/admin, add some usernames, then claim one at http://localhost:8080/me.

Data is saved in `data/data.json`. Delete that file while the server is stopped to start over.

## Develop

Run the API and the Vite dev server in two terminals, then open http://localhost:5173. Page edits appear instantly, and server edits restart the API.

```bash
npm run dev:api
```

```bash
npm run dev
```

To try the map with a full team, add 20 pretend members (usernames `test01` to `test20`, PIN `1234`) to the running app. The morning reset moves them to Not checked in; run the command again to put them back.

```bash
npm run test-members
```

Remove them with:

```bash
npm run test-members -- remove
```

Check your changes with:

```bash
npm run typecheck
```

```bash
npm test
```

| Folder | What's in it |
|---|---|
| `server/` | The API, data file, daily reset and weather, plus their tests |
| `shared/` | Types used by both the server and the frontend |
| `src/pages/` | The Monitor, User and Admin pages |
| `src/components/` | Badge, detail card, characters and the clocks, weather and QR panel |
| `src/map/` | The 2D map, and the 3D map with its three.js scene |
| `src/lib/` | API calls, React hooks, and where rooms and seats go |
| `src/styles/` | Colors and fonts (`theme.ts`), page-wide styles, and shared buttons and form pieces. Other styles sit in the component that uses them |
| `public/` | Fonts, copied as they are into the build |

## Run on the office server (Docker)

1. Copy this folder to the server.
2. Copy `.env.example` to `.env` and set `ADMIN_PASSWORD`, `TZ`, `RESET_AT` and `PORT`.
3. Start it:

   ```bash
   docker compose up -d --build
   ```

4. Team members open `http://<server-ip>:8080`.

The container restarts by itself after a crash or reboot. Data is kept in the Docker volume `minimap-data`, so it survives rebuilds.

**First-run checklist**

- `docker compose ps` shows the service as `healthy`.
- After `docker compose restart`, your users are still there.
- After `docker compose up -d --build`, your users are still there.
- The server's firewall allows the port you chose.

**Back up the data**

```bash
docker compose cp minimap:/app/data/data.json ./backup.json
```

## Home page settings

Set these on the Admin page. They apply straight away and are saved with the rest of the data.

- **Team address:** the address the QR code opens, such as `http://192.168.1.20:8080`. Set it for each deployment. If it's empty, the QR code uses the address the map was opened on. On `localhost` there is no QR code, because a phone couldn't open that address.
- **Clocks:** a name and time zone for each of the two clocks.
- **Main office location:** search for a city and pick it to show its weather. Remove it to hide the weather.

## Settings

Set these in `.env`, then restart.

| Setting | Default | Meaning |
|---|---|---|
| `ADMIN_PASSWORD` | none, required | Password for the Admin page |
| `PORT` | `8080` | Port to open |
| `RESET_AT` | `05:00` | Time each day when everyone's place and status clear |
| `TZ` | `Asia/Ho_Chi_Minh` in Docker, the computer's own otherwise | Time zone for `RESET_AT` |

Avoid `$` in `ADMIN_PASSWORD` when using Docker, because Docker Compose treats it as a variable.

## Good to know

- **Room sizes:** rooms grow and shrink with how many people are in them, and each keeps a minimum size so its name still fits. Working rooms get most of the map; Not checked in and Off today stay small, with a park filling the space beside them. In 2D they glide to their new size; in 3D they change straight away.
- **Working and not working:** Main Office, Other Office and Work from home count as working. Off today and Out of Office count as not working, with Out of Office people strolling along the street through the middle of the map. The map's top buttons and the people list use the same groups.
- **Stopping early:** on the User page, **Leaving early** moves someone to Off with that reason in one tap. Choosing any place again clears the reason.
- **Decorating characters:** on the User page, anyone can change their character's body color, add a hat, glasses or a mustache, and draw on its face with a pen. A hat replaces the character's automatic accessory. Drawings are saved as lines (up to 40 lines and 600 points each person), wrap around the face in 3D, and stay through the morning reset.
- **Forgotten PIN:** the admin clicks Release on that username, and the person claims it again with a new PIN.
- **Morning reset:** clears place and status for everyone. Nicknames and PINs stay. If the server was off at reset time, the reset runs when it next starts.
- **More offices:** stop the server and add an entry to `places` in `data.json`. The first entry is the main office, and both maps make room for the rest. In Docker, copy the file out and back with `docker compose cp`.
- **Weather:** the server gets it from [Open-Meteo](https://open-meteo.com) every 15 minutes, sending only the office coordinates. Browsers never contact it. The server needs internet access for this, and everything else works without it. If updates fail, the last reading stays for up to 3 hours, then the map shows "Weather unavailable". Check [Open-Meteo's terms](https://open-meteo.com/en/terms) for your use, because its free service is for non-commercial use. Its data license requires the credit line shown under the weather, so keep that in place.
- **Working from home:** teammates can only update their status if they can reach the server, for example over your VPN.
- **Security:** this is built for a trusted office network. It uses plain HTTP, so passwords and PINs are not encrypted on the network. Put a reverse proxy with HTTPS in front before exposing it more widely.
