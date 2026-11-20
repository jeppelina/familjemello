# Familje-Mello 🎤✨

**Your family's own music tournament, inspired by Melodifestivalen.**

Add songs as YouTube links, watch them together on the TV, vote with stars (on the
TV or on your phones), and reveal the points one voter at a time like the real show:
"…och mina 12 poäng går till…". Group rounds, a final, confetti and a fanfare.

**[Play → jesperlindmarker.com/familjemello](https://jesperlindmarker.com/familjemello/)**

## How a game goes

1. **Setup.** Start from a ready-made list (*Musikvideokvällen*: 16 classic music
   videos with "Visste du?" trivia for every song, or *Fler klassiker*), or paste
   YouTube links: title and artist fill in by themselves, and videos
   that refuse to play outside YouTube are caught here, not mid-show. Note who picked
   each song, and add your own "Visste du?" fact if you like. Add voters on the TV, or let everyone scan the QR code and join on their
   phone. Any voter can use *kid mode*: three big faces 😍 🙂 😴 instead of stars.
2. **Group rounds (deltävlingar).** Songs are dealt into 2 to 4 groups of at least 3,
   spreading each person's picks over different groups. Watch one song at a time; the
   next video starts by itself, with its "Visste du?" facts under the video and on the
   phones. Everyone gives 1 to 5 stars, and the stars stay secret.
3. **Recap.** Highlight clips of the round, timed by real playback (ads or buffering no
   longer eat the clip).
4. **Tiebreak.** Each voter's stars become their personal ranking. Gave two songs five
   stars? You get asked which one is best (on your phone or on the TV), or 🎲 draw lots.
5. **The reveal.** One voter at a time hands out 12, 10, 8 … points; the scoreboard
   re-sorts live, with a drumroll before each 12. Phone voters press their own
   "give my 12 points" button. Top 2 of each group reach the final.
6. **Final.** *Snabbfinal* (default): a 35-second clip per finalist, then vote. Or
   *Hela låtarna*: a recap, then every finalist in full. Same reveal, then the winner,
   and a *Bästa låtväljare* (best song picker) award.

Fewer than 6 songs skip the groups and go straight to the final.

**Ties** between songs are broken by: more points, then more 12s, more 10s, …, then
more stars in total, and only then by lot (the screen says which one decided it).

**Saved as you play.** Every change is saved on the TV device and in Supabase, so a
reload, a crash or a "let's finish tomorrow" resumes where you were, with the same game
code for the phones. *Fortsätta ett spel från en annan dator?* on the start screen
continues a game on another computer. Past winners are listed on the start screen.

Keyboard on the TV: ← → between songs, space or enter to step the reveal.

## Develop

`src/` is the source; `index.html` in the root is **generated** (it is what GitHub
Pages serves). After changing anything in `src/`:

```bash
npm install        # once: installs esbuild
npm run build      # src/ -> index.html
npm test           # game logic, a full simulated game, and "index.html is up to date"
```

`npm run watch` rebuilds on every save. To play locally, double-click `start.command`
(serves the built `index.html` on http://localhost:8000; YouTube needs http, not
`file://`).

```
familje-mello/
├── index.html        ← built by build.mjs; do not edit by hand
├── build.mjs         ← compiles src/ into one self-contained page
├── src/
│   ├── logic.js      ← pure rules: groups, rankings, scoring, ties, reveal beats
│   ├── state.js      ← reducer, saved snapshots, what phones are told
│   ├── host.jsx      ← the TV screens
│   ├── phone.jsx     ← the phone view (?game=CODE)
│   ├── youtube.jsx   ← YouTube player (autoplay, clip timing, errors)
│   ├── net.js        ← Supabase, local storage, YouTube lookups
│   ├── sfx.js        ← sound effects, synthesised (no audio files)
│   ├── playlists.js  ← ready-made lists with highlight times and trivia
│   ├── ui.jsx, main.jsx, style.css, index.html (template)
├── test/             ← node --test
├── supabase/schema.sql  ← the save table and its two functions
└── docs/             ← the original concept notes (March 2026)
```

`docs/` holds the planning notes the app started from. Some of it (Andra Chansen,
themed rounds, printable cards) is not built; this README describes what the app does.

## Tech

- React 18 (UMD from a CDN), JSX compiled ahead of time with esbuild: no in-browser
  Babel, so phones load the page in a fraction of the time.
- YouTube IFrame Player API; YouTube oEmbed for titles and embed checks.
- Supabase: Realtime broadcast for phones (no database needed for that), and one table,
  `mello_games`, reachable only through `mello_load_game` / `mello_save_game`.
- canvas-confetti, qrcode-generator, Web Audio for sound.

## Not built (yet)

- Andra Chansen (second-chance duels)
- Export/import of a tournament as a file
- Spotify playlist of the night's songs

## License

MIT, see [LICENSE](LICENSE).

*Built by the Lindmarker family. Inspired by Melodifestivalen.*
