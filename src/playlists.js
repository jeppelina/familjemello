// Ready-made song lists for the start screen. Each song can carry `facts`, shown as
// "Visste du?" on the TV and the phones while the song plays.
//
// Checked 2026-11-20: every video is an official upload, plays outside YouTube
// (playableInEmbed) and is marked family-safe by YouTube. highlightStart is set a
// couple of seconds before the video's "most replayed" peak, so recap clips land on
// the moment people rewatch. Facts were checked against public sources.

const GAME_NIGHT = [
  {
    title: 'Smooth Criminal', artist: 'Michael Jackson', year: '1988', youtubeId: 'sFvENQBc-F8', highlightStart: 60,
    facts: [
      'Den berömda lutningen framåt är ett trick: Michael hade skor med en skåra i hälen som hakades fast i spikar i golvet. Han fick patent på skorna!',
      'Videon kommer från Michaels film Moonwalker och utspelar sig på en nattklubb på 1930-talet.',
      'Det här är en kortare version. Hela videon är över nio minuter lång.',
    ],
  },
  {
    title: 'Thriller', artist: 'Michael Jackson', year: '1983', youtubeId: '4V90AmXnguw', highlightStart: 45,
    facts: [
      'Den riktiga Thriller-filmen är nästan 14 minuter lång, som en liten skräckfilm. Här ser ni en kortare version.',
      'Thriller är det mest sålda albumet i hela världen, någonsin.',
      'Den läskiga rösten och skrattet i låten gör skräckfilmsskådespelaren Vincent Price.',
    ],
  },
  {
    title: 'Rhythm Nation', artist: 'Janet Jackson', year: '1989', youtubeId: 'OAwaNWGLM0c', highlightStart: 33,
    facts: [
      'Janet är Michael Jacksons lillasyster, den yngsta av alla syskonen Jackson.',
      'Låten handlar om att människor ska hålla ihop, var de än kommer ifrån.',
      'Låten kan krascha gamla datorer på riktigt! En ton i den fick hårddisken i vissa bärbara datorer att skaka så mycket att de slutade fungera.',
    ],
  },
  {
    title: 'Intergalactic', artist: 'Beastie Boys', year: '1998', youtubeId: 'qORYO0atB6g', highlightStart: 37,
    facts: [
      'En jättelik robot slåss mot ett bläckfiskmonster på Tokyos gator, som i gamla japanska monsterfilmer.',
      'Bandet filmade på riktiga tågstationer i Tokyo, mitt bland vanliga människor.',
      'Videon regisserades av Adam Yauch från bandet, under ett låtsasnamn. Låten vann en Grammy 1999.',
    ],
  },
  {
    title: 'Around the World', artist: 'Daft Punk', year: '1997', youtubeId: 'K0HSD_i2DvA', highlightStart: 54,
    facts: [
      'I den långa versionen sjungs "around the world" hela 144 gånger!',
      'Varje gäng dansare är ett instrument: robotarna är sången, skeletten är gitarren och mumierna är trummorna. Ser du det?',
      'Daft Punk är två fransmän som nästan alltid uppträdde i robothjälmar.',
    ],
  },
  {
    title: 'Hey Ya!', artist: 'OutKast', year: '2003', youtubeId: 'PWgvGjAhvIw', highlightStart: 64,
    facts: [
      'André 3000 spelar alla åtta medlemmar i bandet, med hjälp av filmtrick!',
      'Videon härmar när The Beatles var med i amerikansk tv 1964 och publiken skrek som galningar.',
      'Han sjunger "skaka det som en polaroidbild", men Polaroid sa själva att man inte ska skaka bilderna. Det kan förstöra dem!',
    ],
  },
  {
    title: 'Single Ladies (Put a Ring on It)', artist: 'Beyoncé', year: '2008', youtubeId: '4m1EFMoRFvY', highlightStart: 3,
    facts: [
      'Bara Beyoncé och två dansare i svartvitt, och ändå blev dansen en av de mest härmade någonsin.',
      'Dansen inspirerades av en dans som Bob Fosse gjorde i amerikansk tv 1969.',
      'Titta på Beyoncés ena hand: hon har en blank metallhandske, som en robothand.',
    ],
  },
  {
    title: 'Take On Me', artist: 'a-ha', year: '1985', youtubeId: 'djV11Xbc914', highlightStart: 49,
    facts: [
      'a-ha kommer från Norge, vårt grannland!',
      'Den tecknade delen gjordes genom att rita över filmen bild för bild. Tecknarna gjorde tusentals teckningar för hand.',
      'Låten floppade först. Den blev en världshit först när den här videon kom.',
    ],
  },
  {
    title: 'Feel Good Inc.', artist: 'Gorillaz', year: '2005', youtubeId: 'HyHNuVaZJ-k', highlightStart: 18,
    facts: [
      'Gorillaz är ett band med tecknade medlemmar: 2-D, Murdoc, Noodle och Russel.',
      'Bakom bandet finns musikern Damon Albarn och tecknaren Jamie Hewlett.',
      'Det galna skrattet i början gör Maseo från rapgruppen De La Soul.',
    ],
  },
  {
    title: 'Sledgehammer', artist: 'Peter Gabriel', year: '1986', youtubeId: 'OJWJE0x7T4Q', highlightStart: 177,
    facts: [
      'Videon är gjord med stop motion, en bild i taget. Peter Gabriel lär ha legat under en glasskiva i 16 timmar!',
      'De dansande kycklingarna animerades av Nick Park, han som senare gjorde Wallace & Gromit och Fåret Shaun.',
      'Videon vann nio priser på MTV:s stora prisgala 1987.',
    ],
  },
  {
    title: 'Virtual Insanity', artist: 'Jamiroquai', year: '1996', youtubeId: '4JkIs37a2JE', highlightStart: 156,
    facts: [
      'Golvet ser ut att röra sig, men det är väggarna som rör sig! Kameran satt fast i väggarna.',
      'Sångaren Jay Kay är känd för sina stora, galna hattar.',
      'Videon vann priset för årets video på MTV:s prisgala 1997.',
    ],
  },
  {
    title: 'This Too Shall Pass', artist: 'OK Go', year: '2010', youtubeId: 'qybUFnY7Y8w', highlightStart: 198,
    facts: [
      'Hela videon är en enda jättelång kedjereaktion, en så kallad Rube Goldberg-maskin, filmad i en enda tagning.',
      'Bland byggarna fanns ingenjörer från NASA, och en liten Mars-bil är med i maskinen.',
      'Över 30 personer behövdes för att ställa tillbaka allt efter varje misslyckat försök. Kolla slutet: bandet blir beskjutet med färg!',
    ],
  },
  {
    title: "U Can't Touch This", artist: 'MC Hammer', year: '1990', youtubeId: 'otCpCn0l4Wo', highlightStart: 11,
    facts: [
      'MC Hammers jättevida byxor blev så kända att de fick ett eget namn: Hammer-byxor.',
      'Låten bygger på en bit av en äldre låt, Super Freak av Rick James.',
      'Han fick smeknamnet Hammer för att han liknade basebollstjärnan Hank "Hammer" Aaron. Testa dansen: fötterna glider från sida till sida!',
    ],
  },
  {
    title: 'Fell in Love with a Girl', artist: 'The White Stripes', year: '2002', youtubeId: 'fTH71AAxXmM', highlightStart: 8,
    facts: [
      'Hela videon är gjord av riktiga LEGO-bitar som flyttades lite i taget, bild för bild!',
      'Den är gjord av Michel Gondry, samma regissör som gjorde Daft Punks Around the World.',
      'The White Stripes var bara två: Jack White på gitarr och sång, Meg White på trummor. Låten är inte ens två minuter lång!',
    ],
  },
  {
    title: "It's Oh So Quiet", artist: 'Björk', year: '1995', youtubeId: 'htobTBlCvUU', highlightStart: 208,
    facts: [
      'Björk kommer från Island.',
      'Låten är mycket äldre än videon: den kom redan på 1940-talet, och Björk gjorde en ny version.',
      'Lyssna: det är tyst, tyst, tyst... och plötsligt JÄTTEHÖGT, och hela gatan börjar dansa som i en musikal!',
    ],
  },
  {
    title: 'Gangnam Style', artist: 'PSY', year: '2012', youtubeId: '9bZkp7q19f0', highlightStart: 61,
    facts: [
      'Den första videon på YouTube som setts över en miljard gånger.',
      'Den blev så populär att YouTubes räkneverk inte räckte till och fick byggas om.',
      'Gangnam är en fin stadsdel i Seoul i Sydkorea. Dansen ska se ut som att man rider på en osynlig häst!',
    ],
  },
];

// The original 16 demo classics (no facts).
const CLASSICS = [
  { title: 'Thriller', artist: 'Michael Jackson', youtubeId: 'sOnqjkJTMaA', highlightStart: 438, year: '1982' },
  { title: 'Smooth Criminal', artist: 'Michael Jackson', youtubeId: 'h_D3VFfhvs4', highlightStart: 250, year: '1988' },
  { title: 'Bohemian Rhapsody', artist: 'Queen', youtubeId: 'fJ9rUzIMcZQ', highlightStart: 180, year: '1975' },
  { title: 'Seven Nation Army', artist: 'The White Stripes', youtubeId: '0J2QdDbelmY', highlightStart: 20, year: '2003' },
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana', youtubeId: 'hTWKbfoikeg', highlightStart: 33, year: '1991' },
  { title: 'Around the World', artist: 'Daft Punk', youtubeId: 'K0HSD_i2DvA', highlightStart: 54, year: '1997' },
  { title: 'Virtual Insanity', artist: 'Jamiroquai', youtubeId: '4JkIs37a2JE', highlightStart: 156, year: '1996' },
  { title: 'Weapon of Choice', artist: 'Fatboy Slim', youtubeId: 'wCDIYvFmgW8', highlightStart: 117, year: '2001' },
  { title: 'Take On Me', artist: 'a-ha', youtubeId: 'djV11Xbc914', highlightStart: 49, year: '1985' },
  { title: 'Sledgehammer', artist: 'Peter Gabriel', youtubeId: 'OJWJE0x7T4Q', highlightStart: 177, year: '1986' },
  { title: 'Here It Goes Again', artist: 'OK Go', youtubeId: 'dTAAsCNK7RA', highlightStart: 38, year: '2006' },
  { title: 'Feel Good Inc', artist: 'Gorillaz', youtubeId: 'HyHNuVaZJ-k', highlightStart: 18, year: '2005' },
  { title: 'Intergalactic', artist: 'Beastie Boys', youtubeId: 'qORYO0atB6g', highlightStart: 37, year: '1998' },
  { title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', youtubeId: 'OPf0YbXqDm0', highlightStart: 60, year: '2014' },
  { title: 'Gangnam Style', artist: 'PSY', youtubeId: '9bZkp7q19f0', highlightStart: 61, year: '2012' },
  { title: 'Happy', artist: 'Pharrell Williams', youtubeId: 'ZbZSe6N_BXs', highlightStart: 100, year: '2013' },
];

export const PLAYLISTS = [
  { id: 'musikvideokvall', emoji: '🎬', name: 'Musikvideokvällen', blurb: '16 av världens häftigaste musikvideor, 1983 till 2012, med "Visste du?"-fakta till varje låt.', songs: GAME_NIGHT },
  { id: 'klassiker', emoji: '🎵', name: 'Fler klassiker', blurb: '16 klassiker, utan fakta.', songs: CLASSICS },
];

export const getPlaylist = (id) => PLAYLISTS.find((p) => p.id === id) || null;
