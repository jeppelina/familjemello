# Technical Architecture — Familje-Mello

## Technology Choice

**Single-page React app (one .html or .jsx file)** — no backend needed for Phase 1.

All tournament data lives in the browser's state (React useState/useReducer). For persistence across sessions, we can use a simple JSON file export/import pattern — the family saves their tournament as a file and loads it next time.

Later phases could add a lightweight backend (e.g., a small Node/Express server or even just localStorage) if we want persistent history or multi-device voting.

---

## App Structure (Phase 1)

```
┌─────────────────────────────────────────────────┐
│                  Familje-Mello                   │
│                 ┌───────────┐                    │
│                 │  Header   │                    │
│                 │  + Logo   │                    │
│                 └───────────┘                    │
│  ┌─────────────────────────────────────────────┐ │
│  │              Navigation Tabs                │ │
│  │  [Setup] [Deltävling] [Andra Chansen]       │ │
│  │  [Final] [Resultat]                         │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │              Main Content                   │ │
│  │                                             │ │
│  │  Setup:     Configure songs, voters, groups │ │
│  │  Deltävling: Watch + vote on group songs    │ │
│  │  Andra Ch.: Head-to-head duels              │ │
│  │  Final:     Grand final voting              │ │
│  │  Resultat:  Scoreboard + winner reveal      │ │
│  │                                             │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │              Scoreboard Bar                 │ │
│  │  (persistent at bottom, shows standings)    │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## Data Model

```javascript
// The core tournament state
{
  tournament: {
    name: "Påsk-Mello 2026",
    createdAt: "2026-03-29",
    settings: {
      songCount: 16,          // 8, 16, or 24
      groupCount: 4,          // auto-calculated or manual
      songsPerGroup: 4,       // derived
      pointsSystem: "stars",  // "simple" | "stars" | "mello"
      spectacle: true,        // confetti, sounds, etc.
      postcards: true,        // show song info cards
    },
    voters: [
      { id: "v1", name: "Mamma", emoji: "👩" },
      { id: "v2", name: "Pappa", emoji: "👨" },
      { id: "v3", name: "Saga",  emoji: "⭐" },
      { id: "v4", name: "Elsa",  emoji: "🌟" },
      { id: "v5", name: "Lille", emoji: "🐻" },
    ],
    songs: [
      {
        id: "s1",
        title: "Dancing Queen",
        artist: "ABBA",
        youtubeId: "xFrGuyw1V8s",
        nominatedBy: "v1",        // who picked this song
        funFact: "Came out in 1976!",
        group: 1,                 // assigned group (1-4)
        status: "competing",      // "competing" | "direct_final" | "andra_chansen" | "eliminated" | "finalist" | "winner"
      },
      // ... more songs
    ],
  },

  // Voting state
  votes: {
    // Phase → Song → Voter → Points
    "deltavling_1": {
      "s1": { "v1": 10, "v2": 8, "v3": 4, "v4": 3, "v5": 5 },
      "s2": { "v1": 6,  "v2": 12, "v3": 5, "v4": 4, "v5": 3 },
    },
    "andra_chansen": { /* ... */ },
    "final": { /* ... */ },
  },

  // Derived/computed
  standings: {
    "deltavling_1": [
      { songId: "s2", total: 30, status: "direct_final" },
      { songId: "s1", total: 30, status: "direct_final" },
      { songId: "s3", total: 18, status: "andra_chansen" },
      { songId: "s4", total: 12, status: "eliminated" },
    ],
  },

  // App state
  currentPhase: "deltavling_1",  // tracks where we are in the show
  currentSong: null,             // which song is currently playing
}
```

---

## Tournament Flow

```
                    ┌──────────┐
                    │  SETUP   │
                    │ Add songs│
                    │ + voters │
                    └────┬─────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐  (and group 4)
    │Deltävling 1│ │Deltävling 2│ │Deltävling 3│
    │  4-6 songs │ │  4-6 songs │ │  4-6 songs │
    └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
          │              │              │
          ▼              ▼              ▼
    Top 2 → FINAL   Top 2 → FINAL  Top 2 → FINAL
    #3 → Andra Ch.  #3 → Andra Ch. #3 → Andra Ch.
    Rest eliminated  Rest eliminated Rest eliminated
                         │
                         ▼
                  ┌──────────────┐
                  │ ANDRA CHANSEN│
                  │  Head-to-head│
                  │    duels     │
                  └──────┬───────┘
                         │
                    Winners → FINAL
                         │
                         ▼
                  ┌──────────────┐
                  │  GRAND FINAL │
                  │  All finalists│
                  │  compete     │
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │   WINNER!    │
                  │  🎉 Confetti │
                  │  🏆 Trophy   │
                  └──────────────┘
```

---

## Voting Systems

### Simple (for the 4-year-old)
- 👍 (3 points) / 😐 (1 point) / 👎 (0 points)
- Big, colorful buttons

### Stars (recommended default)
- 1–5 stars per song
- Tap/click stars, very intuitive

### Full Mello
- Each voter distributes: 1, 2, 4, 6, 8, 10, 12 points across songs
- More strategic, better for older kids/adults
- Cannot give the same points to two songs

---

## YouTube Integration

Using YouTube's IFrame Player API (no API key needed for embedding):

```html
<iframe
  src="https://www.youtube.com/embed/{videoId}?autoplay=1"
  allow="autoplay; encrypted-media"
  allowfullscreen
/>
```

Key features:
- Auto-play when a song is selected
- Stop when voting starts (so kids focus on voting, not the video)
- Optional: start/end timestamps to play just a portion of a song

---

## Visual Design Direction

Inspired by Melodifestivalen's look:

- **Background:** Deep purple/navy gradient (like the Mello stage)
- **Accents:** Hot pink, electric blue, gold
- **Typography:** Bold, rounded sans-serif (fun but readable for 7-year-olds)
- **Cards:** Glassmorphism effect (frosted glass look) for song cards
- **Animations:** Subtle glow effects, star particles in background
- **Winner reveal:** Confetti burst using canvas-confetti library

```
Color palette:
  Primary:    #6B21A8 (deep purple)
  Secondary:  #EC4899 (hot pink)
  Accent:     #3B82F6 (electric blue)
  Gold:       #F59E0B (for winners/highlights)
  Background: #1E1044 (dark purple)
  Text:       #FFFFFF
  Card bg:    rgba(255,255,255,0.1)
```

---

## Phase Plan

### Phase 1 — MVP ("Kvällens Mello")
- [ ] Single React file (.jsx)
- [ ] Setup screen: add songs (YouTube URL + title), add voters
- [ ] Auto-assign songs to groups
- [ ] Group stage: play video → vote (stars) → show results
- [ ] Simple final: all qualifiers compete
- [ ] Winner announcement with confetti
- [ ] Mello-inspired color scheme

### Phase 2 — Discovery ("Upptäckaren")
- [ ] Song postcards (nominated by, fun fact)
- [ ] Themed round labels
- [ ] "Upptäckarpriset" special vote
- [ ] Export results as shareable image
- [ ] Save tournament as JSON (for reload)

### Phase 3 — Spectacle ("Showtime")
- [ ] Andra Chansen round (head-to-head duels)
- [ ] Sound effects (fanfare, drumroll)
- [ ] Green room sidebar
- [ ] Printable voting cards (PDF)
- [ ] Animated score reveal (one voter at a time, like real Mello)

### Phase 4 — Pro ("Familje-Mello Pro")
- [ ] Tournament history / Hall of Fame
- [ ] Multi-device voting (QR code to join on phone)
- [ ] Animated stage background
- [ ] Interval act prompts
- [ ] Spotify playlist integration
- [ ] Commentator text-to-speech
