# Planning Poker

Real-time Scrum estimation tool for agile teams. No sign-up required.

## Features

- **Instant rooms** -- Create a room and share the link with your team
- **Real-time voting** -- Everyone votes simultaneously using WebSockets
- **Configurable card deck** -- Default Fibonacci-like scale (1, 2, 3, 5, 8, 13, 20, 40), customizable in settings
- **Countdown timer** -- Default 15s, configurable to 30s or 45s, with audio signal on expiry
- **Smart average** -- After reveal, average is rounded to the nearest card value in the deck
- **Vote toggle** -- Click a selected card again to deselect
- **Admin controls** -- Reveal cards, start new rounds, manage settings, remove participants
- **Separate admin/participant links** -- Admin link (`/room/ROOMID/admin`) vs. participant link (`/room/ROOMID`)
- **Auto-room creation** -- Participants opening a link for a non-existent room get it created automatically
- **Reconnection handling** -- Participants and admins can reconnect after temporary disconnects
- **Room expiry** -- Rooms auto-expire after 24 hours; room IDs are reserved for 48h to prevent reuse
- **Max 10 participants per room**
- **No database required** -- All state is held in-memory

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS v4
- **Real-time**: Socket.io 4
- **Server**: Custom Node.js HTTP server (required because Next.js App Router can't access `res.socket`)
- **Testing**: Vitest (unit/integration), Playwright (E2E)
- **Deployment**: Docker-ready (multi-stage Dockerfile included)

## Getting Started

### Prerequisites

- Node.js 22+
- npm

### Install

```bash
npm install
```

### Development

```bash
PORT=3001 npx tsx server.ts
```

The app will be available at `http://localhost:3001`.

> **Note:** `PORT=3001` is recommended if port 3000 is occupied on your machine.

### Production Build

```bash
npm run build
NODE_ENV=production PORT=3000 node dist-server/server.js
```

### Docker

```bash
docker build -t planning-poker .
docker run -p 3000:3000 planning-poker
```

## Usage

1. **Create a room** -- Enter your name on the homepage and click "Create Room"
2. **Share the link** -- Copy the participant link (without `/admin`) and send it to your team
3. **Vote** -- Each participant selects a card. Click again to deselect.
4. **Reveal** -- The admin clicks "Reveal Cards" to show all votes
5. **New Round** -- Click "New Round" to reset and start the next estimation

### URL Scheme

| URL | Purpose |
|-----|---------|
| `/` | Homepage -- create a new room |
| `/room/ROOMID` | Participant link -- join an existing room (auto-creates if needed) |
| `/room/ROOMID/admin` | Admin link -- create/claim room as admin |

When an admin opens an admin link for a room that already has an active admin, a **new room** is automatically created and a notice is displayed.

## Room Settings (Admin)

- **Estimate options** -- Customize the card values
- **Timer duration** -- 15s, 30s, or 45s countdown
- **Show timer** -- Toggle timer visibility
- **Show average** -- Toggle average display after reveal
- **Show user presence** -- Toggle online/offline indicators
- **Allow others to reveal** -- Let non-admins reveal cards
- **Allow others to delete estimates** -- Let non-admins clear votes
- **Allow others to clear users** -- Let non-admins remove participants

## Project Structure

```
planning-poker/
  server.ts                          # Custom HTTP + Socket.io server
  src/
    app/
      page.tsx                       # Homepage (create room)
      layout.tsx                     # Root layout
      globals.css                    # Tailwind imports
      room/
        [roomId]/
          page.tsx                   # Participant room page
          admin/
            page.tsx                 # Admin room page
    components/
      CreateRoomForm.tsx             # Homepage form
      JoinRoomForm.tsx               # Join room form (participant)
      RoomView.tsx                   # Main room UI (cards, participants, controls)
      CardDeck.tsx                   # Card selection grid
      EstimationCard.tsx             # Individual card component
      ParticipantList.tsx            # Participant avatars grid
      ParticipantAvatar.tsx          # Single participant avatar
      AverageDisplay.tsx             # Average calculation after reveal
      Timer.tsx                      # Countdown timer with audio
      SettingsPanel.tsx              # Admin settings panel
      ShareLink.tsx                  # Room ID display + copy link
      RevealButton.tsx               # Reveal/New Round button
    hooks/
      useSocket.ts                   # Socket.io client singleton
      useRoom.ts                     # Room state management (reducer)
    lib/
      socket.ts                      # Socket.io client instance
      constants.ts                   # Storage keys
      cardThemes.ts                  # Card emoji themes
    types/
      shared.ts                      # Shared types (client + server)
    server/
      socketHandlers.ts              # All Socket.io event handlers
      roomStore.ts                   # In-memory room storage
      types.ts                       # Server-only types
      __tests__/
        roomStore.test.ts            # Unit tests
        socketHandlers.test.ts       # Integration tests
    tests/
      e2e/
        planning-poker.e2e.ts        # Playwright E2E tests
```

## Testing

### Unit & Integration Tests

```bash
npm test
```

Runs 32 tests with Vitest:
- **15 unit tests** -- Room store (creation, IDs, tokens, socket registration, cleanup)
- **17 integration tests** -- Socket.io handlers (create/join rooms, voting flow, admin permissions, timer, settings)

### E2E Tests

```bash
# Server must be running first
PORT=3001 npx tsx server.ts &

npm run test:e2e
```

Runs 11 Playwright tests with real browser automation:
- Room creation and navigation
- Participant joining via link
- Auto-room creation for non-existent rooms
- Full vote/reveal/new-round cycle
- Vote toggle (select/deselect)
- Admin-only controls
- Occupied room redirect with notice
- Timer start/reset
- 3 participants voting simultaneously
- Clear all participants
- Feedback link

### All Tests

```bash
npm run test:all
```

## Architecture

### Real-time Communication

All real-time state synchronization happens via Socket.io events. The server is the single source of truth.

**Client-to-Server events:** `create-room`, `join-as-admin`, `ensure-room`, `join-room`, `vote`, `reveal`, `reset`, `update-settings`, `delete-estimate`, `clear-user`, `clear-all-participants`, `start-timer`, `stop-timer`

**Server-to-Client events:** `room-state`, `participant-joined`, `participant-left`, `participant-updated`, `vote-cast`, `votes-revealed`, `votes-reset`, `settings-updated`, `timer-started`, `timer-stopped`, `room-closed`, `error`

### Authentication

- Admin authentication uses a randomly generated `adminToken` stored in `localStorage`
- Session tracking uses a `sessionId` stored in `sessionStorage`
- No login, no passwords, no database

### Room Lifecycle

1. Admin creates room via homepage or admin link
2. Participants join via participant link
3. Voting rounds repeat (vote, reveal, new round)
4. If admin disconnects, a 60-second grace period starts
5. If admin doesn't reconnect within 60s, room is closed
6. Rooms auto-expire after 24 hours
7. Used room IDs are reserved for 48 hours to prevent link collisions

## Deployment

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

# Optional
ALLOWED_ORIGINS=https://yourdomain.com
LOG_LEVEL=info
```

### Docker (Recommended)

```bash
# Build
docker build -t planning-poker .

# Run
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  --name planning-poker \
  planning-poker

# Health check
curl http://localhost:3000/
```

### Railway / Render / Fly.io

1. Connect your GitHub repository
2. Set environment variable: `NODE_ENV=production`
3. Build command: `npm run build`
4. Start command: `npm start`
5. Port: Auto-detected from `$PORT`

### Vercel (Not Recommended)

Vercel's serverless architecture doesn't support Socket.io well. Use a containerized platform instead.

### Self-Hosted (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Build
npm run build

# Start with PM2
pm2 start dist-server/server.js --name planning-poker

# Save PM2 configuration
pm2 save

# Setup auto-restart on reboot
pm2 startup
```

### Important Notes

- **In-memory storage**: Rooms are lost on restart. Not suitable for high-availability setups without session persistence.
- **No horizontal scaling**: Rooms are stored in memory and not shared between instances.
- **WebSocket support**: Ensure your reverse proxy (nginx, Cloudflare, etc.) supports WebSocket connections.

## License

ISC
