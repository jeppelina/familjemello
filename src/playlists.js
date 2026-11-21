// Ready-made song lists for the start screen. Each song can carry `facts`, shown as
// "Visste du?" on the TV and the phones while the song plays, and `released` plus
// `people` (name, born, died) so the song card can say how old the artist was.
//
// Checked 2026-11-20: every video is an official upload, plays outside YouTube
// (playableInEmbed) and is marked family-safe by YouTube. highlightStart is set a
// couple of seconds before the video's "most replayed" peak, so recap clips land on
// the moment people rewatch. Facts were checked against public sources. Birth and
// release dates checked against Wikidata on 2026-11-21; `released` is left out where
// the month is unclear (the card then says "ca").

const GAME_NIGHT = [
  {
    title: 'Smooth Criminal', artist: 'Michael Jackson', year: '1988', youtubeId: 'sFvENQBc-F8', highlightStart: 60,
    released: '1988-10', people: [{ name: 'Michael Jackson', born: '1958-08-29', died: '2009-06-25' }],
    facts: [
      'Den berömda lutningen framåt är ett trick: Michael hade skor med en skåra i hälen som hakades fast i spikar i golvet. Han fick patent på skorna!',
      'Videon kommer från Michaels film Moonwalker och utspelar sig på en nattklubb på 1930-talet.',
      'Det här är en kortare version. Hela videon är över nio minuter lång.',
    ],
  },
  {
    title: 'Thriller', artist: 'Michael Jackson', year: '1983', youtubeId: '4V90AmXnguw', highlightStart: 45,
    released: '1983-12-02', people: [{ name: 'Michael Jackson', born: '1958-08-29', died: '2009-06-25' }],
    facts: [
      'Den riktiga Thriller-filmen är nästan 14 minuter lång, som en liten skräckfilm. Här ser ni en kortare version.',
      'Thriller är det mest sålda albumet i hela världen, någonsin.',
      'Den läskiga rösten och skrattet i låten gör skräckfilmsskådespelaren Vincent Price.',
    ],
  },
  {
    title: 'Rhythm Nation', artist: 'Janet Jackson', year: '1989', youtubeId: 'OAwaNWGLM0c', highlightStart: 33,
    released: '1989-10-23', people: [{ name: 'Janet Jackson', born: '1966-05-16' }],
    facts: [
      'Janet är Michael Jacksons lillasyster, den yngsta av alla syskonen Jackson.',
      'Låten handlar om att människor ska hålla ihop, var de än kommer ifrån.',
      'Låten kan krascha gamla datorer på riktigt! En ton i den fick hårddisken i vissa bärbara datorer att skaka så mycket att de slutade fungera.',
    ],
  },
  {
    title: 'Intergalactic', artist: 'Beastie Boys', year: '1998', youtubeId: 'qORYO0atB6g', highlightStart: 37,
    released: '1998-06', people: [{ name: 'Mike D', born: '1965-11-20' }, { name: 'Adam Yauch', born: '1964-08-05', died: '2012-05-04' }, { name: 'Ad-Rock', born: '1966-10-31' }],
    facts: [
      'En jättelik robot slåss mot ett bläckfiskmonster på Tokyos gator, som i gamla japanska monsterfilmer.',
      'Bandet filmade på riktiga tågstationer i Tokyo, mitt bland vanliga människor.',
      'Videon regisserades av Adam Yauch från bandet, under ett låtsasnamn. Låten vann en Grammy 1999.',
    ],
  },
  {
    title: 'Around the World', artist: 'Daft Punk', year: '1997', youtubeId: 'K0HSD_i2DvA', highlightStart: 54,
    released: '1997-03', people: [{ name: 'Thomas Bangalter', born: '1975-01-03' }, { name: 'Guy-Manuel', born: '1974-02-08' }],
    facts: [
      'I den långa versionen sjungs "around the world" hela 144 gånger!',
      'Varje gäng dansare är ett instrument: robotarna är sången, skeletten är gitarren och mumierna är trummorna. Ser du det?',
      'Daft Punk är två fransmän som nästan alltid uppträdde i robothjälmar.',
    ],
  },
  {
    title: 'Hey Ya!', artist: 'OutKast', year: '2003', youtubeId: 'PWgvGjAhvIw', highlightStart: 64,
    released: '2003-08-25', people: [{ name: 'André 3000', born: '1975-05-27' }],
    facts: [
      'André 3000 spelar alla åtta medlemmar i bandet, med hjälp av filmtrick!',
      'Videon härmar när The Beatles var med i amerikansk tv 1964 och publiken skrek som galningar.',
      'Han sjunger "skaka det som en polaroidbild", men Polaroid sa själva att man inte ska skaka bilderna. Det kan förstöra dem!',
    ],
  },
  {
    title: 'Single Ladies (Put a Ring on It)', artist: 'Beyoncé', year: '2008', youtubeId: '4m1EFMoRFvY', highlightStart: 3,
    released: '2008-10', people: [{ name: 'Beyoncé', born: '1981-09-04' }],
    facts: [
      'Bara Beyoncé och två dansare i svartvitt, och ändå blev dansen en av de mest härmade någonsin.',
      'Dansen inspirerades av en dans som Bob Fosse gjorde i amerikansk tv 1969.',
      'Titta på Beyoncés ena hand: hon har en blank metallhandske, som en robothand.',
    ],
  },
  {
    title: 'Take On Me', artist: 'a-ha', year: '1985', youtubeId: 'djV11Xbc914', highlightStart: 49,
    people: [{ name: 'Morten Harket', born: '1959-09-14' }],
    facts: [
      'a-ha kommer från Norge, vårt grannland!',
      'Den tecknade delen gjordes genom att rita över filmen bild för bild. Tecknarna gjorde tusentals teckningar för hand.',
      'Låten floppade först. Den blev en världshit först när den här videon kom.',
    ],
  },
  {
    title: 'Feel Good Inc.', artist: 'Gorillaz', year: '2005', youtubeId: 'HyHNuVaZJ-k', highlightStart: 18,
    released: '2005-05-09', people: [{ name: 'Damon Albarn', born: '1968-03-23' }],
    facts: [
      'Gorillaz är ett band med tecknade medlemmar: 2-D, Murdoc, Noodle och Russel.',
      'Bakom bandet finns musikern Damon Albarn och tecknaren Jamie Hewlett.',
      'Det galna skrattet i början gör Maseo från rapgruppen De La Soul.',
    ],
  },
  {
    title: 'Sledgehammer', artist: 'Peter Gabriel', year: '1986', youtubeId: 'OJWJE0x7T4Q', highlightStart: 177,
    released: '1986-04-25', people: [{ name: 'Peter Gabriel', born: '1950-02-13' }],
    facts: [
      'Videon är gjord med stop motion, en bild i taget. Peter Gabriel lär ha legat under en glasskiva i 16 timmar!',
      'De dansande kycklingarna animerades av Nick Park, han som senare gjorde Wallace & Gromit och Fåret Shaun.',
      'Videon vann nio priser på MTV:s stora prisgala 1987.',
    ],
  },
  {
    title: 'Virtual Insanity', artist: 'Jamiroquai', year: '1996', youtubeId: '4JkIs37a2JE', highlightStart: 156,
    released: '1996-08-21', people: [{ name: 'Jay Kay', born: '1969-12-30' }],
    facts: [
      'Golvet ser ut att röra sig, men det är väggarna som rör sig! Kameran satt fast i väggarna.',
      'Sångaren Jay Kay är känd för sina stora, galna hattar.',
      'Videon vann priset för årets video på MTV:s prisgala 1997.',
    ],
  },
  {
    title: 'This Too Shall Pass', artist: 'OK Go', year: '2010', youtubeId: 'qybUFnY7Y8w', highlightStart: 198,
    released: '2010-03', people: [{ name: 'Damian Kulash', born: '1975-10-07' }],
    facts: [
      'Hela videon är en enda jättelång kedjereaktion, en så kallad Rube Goldberg-maskin, filmad i en enda tagning.',
      'Bland byggarna fanns ingenjörer från NASA, och en liten Mars-bil är med i maskinen.',
      'Över 30 personer behövdes för att ställa tillbaka allt efter varje misslyckat försök. Kolla slutet: bandet blir beskjutet med färg!',
    ],
  },
  {
    title: "U Can't Touch This", artist: 'MC Hammer', year: '1990', youtubeId: 'otCpCn0l4Wo', highlightStart: 11,
    released: '1990-01-13', people: [{ name: 'MC Hammer', born: '1962-03-30' }],
    facts: [
      'MC Hammers jättevida byxor blev så kända att de fick ett eget namn: Hammer-byxor.',
      'Låten bygger på en bit av en äldre låt, Super Freak av Rick James.',
      'Han fick smeknamnet Hammer för att han liknade basebollstjärnan Hank "Hammer" Aaron. Testa dansen: fötterna glider från sida till sida!',
    ],
  },
  {
    title: 'Fell in Love with a Girl', artist: 'The White Stripes', year: '2002', youtubeId: 'fTH71AAxXmM', highlightStart: 8,
    released: '2002-04', people: [{ name: 'Jack White', born: '1975-07-09' }, { name: 'Meg White', born: '1974-12-10' }],
    facts: [
      'Hela videon är gjord av riktiga LEGO-bitar som flyttades lite i taget, bild för bild!',
      'Den är gjord av Michel Gondry, samma regissör som gjorde Daft Punks Around the World.',
      'The White Stripes var bara två: Jack White på gitarr och sång, Meg White på trummor. Låten är inte ens två minuter lång!',
    ],
  },
  {
    title: "It's Oh So Quiet", artist: 'Björk', year: '1995', youtubeId: 'htobTBlCvUU', highlightStart: 208,
    released: '1995-11-13', people: [{ name: 'Björk', born: '1965-11-21' }],
    facts: [
      'Björk kommer från Island.',
      'Låten är mycket äldre än videon: den kom redan på 1940-talet, och Björk gjorde en ny version.',
      'Lyssna: det är tyst, tyst, tyst... och plötsligt JÄTTEHÖGT, och hela gatan börjar dansa som i en musikal!',
    ],
  },
  {
    title: 'Gangnam Style', artist: 'PSY', year: '2012', youtubeId: '9bZkp7q19f0', highlightStart: 61,
    released: '2012-07-15', people: [{ name: 'PSY', born: '1977-12-31' }],
    facts: [
      'Den första videon på YouTube som setts över en miljard gånger.',
      'Den blev så populär att YouTubes räkneverk inte räckte till och fick byggas om.',
      'Gangnam är en fin stadsdel i Seoul i Sydkorea. Dansen ska se ut som att man rider på en osynlig häst!',
    ],
  },
];

// The original 16 demo classics (no facts).
const CLASSICS = [
  { title: 'Thriller', artist: 'Michael Jackson', youtubeId: 'sOnqjkJTMaA', highlightStart: 438, year: '1983', released: '1983-12-02', people: [{ name: 'Michael Jackson', born: '1958-08-29', died: '2009-06-25' }] },
  { title: 'Smooth Criminal', artist: 'Michael Jackson', youtubeId: 'h_D3VFfhvs4', highlightStart: 250, year: '1988', released: '1988-10', people: [{ name: 'Michael Jackson', born: '1958-08-29', died: '2009-06-25' }] },
  { title: 'Bohemian Rhapsody', artist: 'Queen', youtubeId: 'fJ9rUzIMcZQ', highlightStart: 180, year: '1975', released: '1975-10-31', people: [{ name: 'Freddie Mercury', born: '1946-09-05', died: '1991-11-24' }] },
  { title: 'Seven Nation Army', artist: 'The White Stripes', youtubeId: '0J2QdDbelmY', highlightStart: 20, year: '2003', released: '2003-03-07', people: [{ name: 'Jack White', born: '1975-07-09' }, { name: 'Meg White', born: '1974-12-10' }] },
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana', youtubeId: 'hTWKbfoikeg', highlightStart: 33, year: '1991', released: '1991-09', people: [{ name: 'Kurt Cobain', born: '1967-02-20', died: '1994-04-05' }] },
  { title: 'Around the World', artist: 'Daft Punk', youtubeId: 'K0HSD_i2DvA', highlightStart: 54, year: '1997', released: '1997-03', people: [{ name: 'Thomas Bangalter', born: '1975-01-03' }, { name: 'Guy-Manuel', born: '1974-02-08' }] },
  { title: 'Virtual Insanity', artist: 'Jamiroquai', youtubeId: '4JkIs37a2JE', highlightStart: 156, year: '1996', released: '1996-08-21', people: [{ name: 'Jay Kay', born: '1969-12-30' }] },
  { title: 'Weapon of Choice', artist: 'Fatboy Slim', youtubeId: 'wCDIYvFmgW8', highlightStart: 117, year: '2001', released: '2001-04-23', people: [{ name: 'Fatboy Slim', born: '1963-07-16' }] },
  { title: 'Take On Me', artist: 'a-ha', youtubeId: 'djV11Xbc914', highlightStart: 49, year: '1985', people: [{ name: 'Morten Harket', born: '1959-09-14' }] },
  { title: 'Sledgehammer', artist: 'Peter Gabriel', youtubeId: 'OJWJE0x7T4Q', highlightStart: 177, year: '1986', released: '1986-04-25', people: [{ name: 'Peter Gabriel', born: '1950-02-13' }] },
  { title: 'Here It Goes Again', artist: 'OK Go', youtubeId: 'dTAAsCNK7RA', highlightStart: 38, year: '2006', people: [{ name: 'Damian Kulash', born: '1975-10-07' }] },
  { title: 'Feel Good Inc', artist: 'Gorillaz', youtubeId: 'HyHNuVaZJ-k', highlightStart: 18, year: '2005', released: '2005-05-09', people: [{ name: 'Damon Albarn', born: '1968-03-23' }] },
  { title: 'Intergalactic', artist: 'Beastie Boys', youtubeId: 'qORYO0atB6g', highlightStart: 37, year: '1998', released: '1998-06', people: [{ name: 'Mike D', born: '1965-11-20' }, { name: 'Adam Yauch', born: '1964-08-05', died: '2012-05-04' }, { name: 'Ad-Rock', born: '1966-10-31' }] },
  { title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', youtubeId: 'OPf0YbXqDm0', highlightStart: 60, year: '2014', released: '2014-11-10', people: [{ name: 'Mark Ronson', born: '1975-09-04' }, { name: 'Bruno Mars', born: '1985-10-08' }] },
  { title: 'Gangnam Style', artist: 'PSY', youtubeId: '9bZkp7q19f0', highlightStart: 61, year: '2012', released: '2012-07-15', people: [{ name: 'PSY', born: '1977-12-31' }] },
  { title: 'Happy', artist: 'Pharrell Williams', youtubeId: 'ZbZSe6N_BXs', highlightStart: 100, year: '2013', released: '2013-11-21', people: [{ name: 'Pharrell Williams', born: '1973-04-05' }] },
];

export const PLAYLISTS = [
  { id: 'musikvideokvall', emoji: '🎬', name: 'Musikvideokvällen', blurb: '16 av världens häftigaste musikvideor, 1983 till 2012, med "Visste du?"-fakta till varje låt.', songs: GAME_NIGHT },
  { id: 'klassiker', emoji: '🎵', name: 'Fler klassiker', blurb: '16 klassiker, utan fakta.', songs: CLASSICS },
];

export const getPlaylist = (id) => PLAYLISTS.find((p) => p.id === id) || null;
