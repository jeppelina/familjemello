# Familje-Mello 🎤✨

**Your family's own music tournament, inspired by Melodifestivalen.**

Add songs as YouTube links, watch them together on the TV, vote with 1 to 10 stars (on
the TV or on your phones), and watch the points fly in: every 6, then every 8, every 12
and last every 10. Nobody sees who gave what. Group rounds, a final, confetti and a fanfare.

**[Play → jesperlindmarker.com/familjemello](https://jesperlindmarker.com/familjemello/)**

## How a game goes

1. **Setup.** Start from a ready-made list (*Musikvideokvällen*: 16 classic music
   videos with "Visste du?" trivia for every song, or *Fler klassiker*), or paste
   YouTube links: title, artist and year fill in by themselves (the year and the
   artist's birth date come from Wikidata), and videos that refuse to play outside
   YouTube are caught here, not mid-show. Note who picked
   each song, and add your own "Visste du?" fact if you like. Add voters on the TV, or let everyone scan the QR code and join on their
   phone. Any voter can use *kid mode*: three big faces 😍 🙂 😴 instead of stars.
2. **The draw (lottningen).** Songs are dealt into 2 to 4 groups of at least 3,
   spreading each person's picks over different groups. Before the first song you see
   the draw and can change it: tap two songs to swap them, or draw again.
3. **Group rounds (deltävlingar).** Watch one song at a time; the next video starts by
   itself. The song card shows the year, how many years ago that was, and how old the
   artist was then (and is today), with "Visste du?" facts under the video and on the
   phones. Everyone gives 1 to 10 stars, and the stars stay secret.
4. **Recap.** Highlight clips of the round, timed by real playback (ads or buffering no
   longer eat the clip).
5. **The reveal.** Each voter's stars become Mello points: 12 for their favourite, then
   10, 8, 6 … Equal stars share the place and both get its points. The points come out
   one score at a time for everyone at once: all the 6s fly in as chips and land on their
   songs, then the 8s, then the 12s (with a drumroll), and last the 10s. Only the counts
   show, never who gave what. Every voter gives every song exactly one score, so the last
   score is always predictable from what is left; that is why the 12s come second to
   last and the 10s fill up the rest. Top 2 of each group reach the final.
6. **Final.** *Snabbfinal* (default): a 35-second clip per finalist, then vote. Or
   *Hela låtarna*: a recap, then every finalist in full. Same reveal, then the winner,
   and a *Bästa låtväljare* (best song picker) award.

Fewer than 6 songs skip the groups and go straight to the final.

**Ties** are ties: songs with equal points share their place. Only when a tie decides
something (who takes the last final spot, or who wins the final) is there a
*utslagsröstning*: everyone picks their favourite of the tied songs, on the phone or the
TV, and only the number of hearts per song is shown. If that is level too, the lot decides.

**Saved as you play.** Every change is saved on the TV device and in Supabase, so a
reload, a crash or a "let's finish tomorrow" resumes where you were, with the same game
code for the phones. *Fortsätta ett spel från en annan dator?* on the start screen
continues a game on another computer. Past winners are listed on the start screen.

Keyboard on the TV: ← → between songs, space or enter to step the reveal.

Phones are never sent anyone's stars: the TV tells each phone that its vote arrived with
a short code that only matches that phone's own vote. (That keeps votes out of sight; it
is not encryption.)

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
│   ├── logic.js      ← pure rules: groups, points, ties, reveal steps, ages
│   ├── state.js      ← reducer, saved snapshots, what phones are told
│   ├── host.jsx      ← the TV screens
│   ├── phone.jsx     ← the phone view (?game=CODE)
│   ├── youtube.jsx   ← YouTube player (autoplay, clip timing, errors)
│   ├── net.js        ← Supabase, local storage, YouTube and Wikidata lookups
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
- YouTube IFrame Player API; YouTube oEmbed for titles and embed checks; Wikidata for
  a song's year and the artist's birth date (or the year a band was formed).
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
