/* =====================================================
   NOCT PLM - Player Controller
   Synchronized with Audio Buffer Delay
   ===================================================== */

document.addEventListener('DOMContentLoaded', function () {

  const PROXY_BASE = 'https://corsproxy.io/?';

  // Audio streams are typically 30-60 seconds behind the FM broadcast
  // We compensate by looking for songs that started 45 seconds ago
  const AUDIO_BUFFER_DELAY = 20; // seconds

  const audio = document.getElementById('audio');
  const player = document.getElementById('player');
  const playerImg = document.getElementById('playerImg');
  const playerName = document.getElementById('playerName');
  const volumeSlider = document.getElementById('volume');
  const volumeFill = document.getElementById('volumeFill');
  const volumeIcon = document.getElementById('volumeIcon');

  let currentCard = null;
  let isPlaying = false;
  let metadataInterval = null;
  let trackHistory = []; // Store last 10 tracks
  let lastTrackKey = ''; // To avoid duplicates
  let currentRadioName = ''; // Current playing radio name

  const radioAPIs = {
    'skyrock': {
      url: 'https://onlineradiobox.com/fr/skyrock/playlist/',
      isHtmlScrape: true,
      jsonPath: parseOnlineRadioBox
    },
    'mouv': {
      url: 'https://api.radiofrance.fr/livemeta/pull/6',
      isHtmlScrape: false,
      jsonPath: (data) => {
        let result = null;
        const now = Math.floor(Date.now() / 1000);

        if (data.steps) {
          // Get all songs, sorted by start time descending
          const songs = Object.values(data.steps)
            .filter(step => step.embedType === 'song')
            .sort((a, b) => b.start - a.start);

          if (songs.length > 0) {
            const song = songs[0];
            result = {
              title: song.title,
              artist: song.highlightedArtists?.[0] || song.authors || '',
              cover: song.visual
            };
          } else {
            // Fallback: show current program name
            const programs = Object.values(data.steps)
              .filter(step => step.start <= now && step.end >= now)
              .sort((a, b) => b.start - a.start);

            if (programs.length > 0) {
              result = {
                title: programs[0].titleConcept || programs[0].title || 'Mouv\'',
                artist: 'En direct',
                cover: null
              };
            }
          }
        }
        return result;
      }
    },
    'skyrockplm': {
      url: 'https://onlineradiobox.com/fr/skyrockplm/playlist/',
      isHtmlScrape: true,
      jsonPath: parseOnlineRadioBox
    },
    'funradio': {
      // Fun Radio Belgium RadioPlayer API
      url: 'https://core-search.radioplayer.cloud/056/qp/v4/onair?rpIds=3',
      isHtmlScrape: false,
      jsonPath: (data) => {
        let result = null;
        if (data.results && data.results['3']) {
          // Find the song entry (type PE_E means currently playing)
          const song = data.results['3'].find(item => item.song === true && item.name);
          if (song) {
            result = {
              title: song.name,
              artist: song.artistName,
              cover: song.imageUrl
            };
          } else {
            // Fallback when no song is playing
            const info = data.results['3'].find(item => item.description);
            result = {
              title: info?.description || 'Fun Radio',
              artist: 'En direct',
              cover: info?.imageUrl || null
            };
          }
        }
        return result;
      }
    }
  };

  // Shared parser function for OnlineRadioBox
  function parseOnlineRadioBox(html) {
    let result = null;
    try {
      // Parse HTML to find track links
      // Format: <a href="/track/...">Artist - Title</a>
      const trackRegex = /<a[^>]*href="\/track\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
      const matches = [...html.matchAll(trackRegex)];

      if (matches.length > 0) {
        // First match is the most recent track
        const trackText = matches[0][1].trim();
        const parts = trackText.split(' - ');

        if (parts.length >= 2) {
          result = {
            title: parts.slice(1).join(' - '), // Title (everything after first dash)
            artist: parts[0], // Artist (before first dash)
            cover: null // Will use iTunes fallback
          };
        } else {
          result = {
            title: trackText,
            artist: '',
            cover: null
          };
        }
      }
    } catch (e) {
      console.warn('Scraping error:', e);
    }
    return result;
  }

  window.playRadio = function (card) {
    const radioId = card.dataset.radio;
    const name = card.dataset.name;
    const url = card.dataset.url;
    const img = card.dataset.img;
    const gradient = card.dataset.gradient;

    if (currentCard === card && isPlaying) {
      window.togglePlay();
      return;
    }

    if (metadataInterval) clearInterval(metadataInterval);
    resetCardsVisuals();

    currentCard = card;
    isPlaying = true;

    card.classList.add('ring-2', 'ring-white/50');
    const eq = card.querySelector('.equalizer');
    if (eq) { eq.classList.remove('hidden'); eq.classList.add('flex'); }

    audio.src = url;
    audio.play().catch(e => console.error("Audio error:", e));

    player.style.opacity = '1';
    player.style.pointerEvents = 'auto';
    player.style.transform = 'translateY(0)';

    updatePlayerVisuals(gradient);
    updatePlayPauseButton(true);
    updatePlayerInfo(name, 'En direct', img);

    if (radioAPIs[radioId] && radioAPIs[radioId].url) {
      updatePlayerInfo(name, 'Chargement...', img);
      fetchMetadataWrapper(radioId, img, name);
      metadataInterval = setInterval(() => fetchMetadataWrapper(radioId, img, name), 10000);
    }
  };

  window.togglePlay = function () {
    if (audio.paused) { audio.play(); isPlaying = true; }
    else { audio.pause(); isPlaying = false; }
    updatePlayPauseButton(isPlaying);
    updateCardStatus(isPlaying);
  };

  window.stopRadio = function () {
    audio.pause();
    audio.src = '';
    isPlaying = false;
    if (metadataInterval) clearInterval(metadataInterval);
    resetCardsVisuals();
    player.style.opacity = '0';
    player.style.pointerEvents = 'none';
    player.style.transform = 'translateY(20px)';
    document.title = 'Noct PLM';
  };

  async function fetchMetadataWrapper(radioId, defaultImg, defaultName) {
    const config = radioAPIs[radioId];
    if (!config || !config.url) return;

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);

      // Add cache buster to prevent proxy from returning cached data
      const cacheBuster = Date.now();
      const proxyUrl = PROXY_BASE + encodeURIComponent(config.url + '?_cb=' + cacheBuster);

      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });
      clearTimeout(id);

      if (!response.ok) throw new Error('Proxy error');

      let info;
      if (config.isHtmlScrape) {
        // For HTML scraping, get text and parse
        const html = await response.text();
        info = config.jsonPath(html);
      } else {
        // For JSON APIs
        const data = await response.json();
        info = config.jsonPath(data);
      }

      if (info && info.title) {
        updatePlayerInfo(info.title, info.artist, info.cover || defaultImg);
        document.title = `🎵 ${info.title} • ${defaultName}`;
        if (!info.cover && info.title) fetchItunesCover(info.title, info.artist);

        // Add to history if it's a new track
        const trackKey = `${info.title}-${info.artist}`.toLowerCase();
        if (trackKey !== lastTrackKey && info.artist && info.artist !== 'En direct') {
          lastTrackKey = trackKey;
          addToHistory({
            title: info.title,
            artist: info.artist,
            cover: info.cover || defaultImg,
            radio: defaultName,
            timestamp: new Date()
          });
        }
      } else {
        updatePlayerInfo(defaultName, 'En direct', defaultImg);
      }
    } catch (e) {
      console.warn('Meta fetch error', e);
      if (playerName.innerText.includes('Chargement')) {
        updatePlayerInfo(defaultName, 'En direct', defaultImg);
      }
    }
  }

  async function fetchItunesCover(title, artist) {
    try {
      const resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title + ' ' + artist)}&media=music&limit=1`);
      const data = await resp.json();
      if (data.results?.[0]) {
        playerImg.src = data.results[0].artworkUrl100.replace('100x100', '600x600');
      }
    } catch (e) { }
  }

  function updatePlayerInfo(title, artist, cover) {
    playerName.innerHTML = `
      <span class="block text-white font-bold truncate text-base sm:text-lg">${title}</span>
      <span class="block text-gray-300 truncate text-xs sm:text-sm font-medium">${artist}</span>
    `;
    if (cover) playerImg.src = cover;
    if (currentCard) {
      const status = currentCard.querySelector('.status');
      if (status && title !== currentCard.dataset.name && !title.includes('Chargement')) {
        status.innerHTML = `<span class="text-green-400 font-medium truncate block w-full">🎵 ${title}</span>`;
      }
    }
  }

  function resetCardsVisuals() {
    document.querySelectorAll('.radio-card').forEach(c => {
      c.classList.remove('ring-2', 'ring-white/50');
      c.querySelector('.equalizer').classList.add('hidden');
      c.querySelector('.equalizer').classList.remove('flex');
      const st = c.querySelector('.status');
      if (st) st.innerHTML = 'Cliquer pour écouter';
    });
  }

  function updateCardStatus(active) {
    if (!currentCard) return;
    const eq = currentCard.querySelector('.equalizer');
    const st = currentCard.querySelector('.status');
    if (active) {
      if (eq) { eq.classList.remove('hidden'); eq.classList.add('flex'); }
    } else {
      if (eq) { eq.classList.add('hidden'); eq.classList.remove('flex'); }
      if (st) st.innerHTML = '<span class="text-yellow-400">⏸ En pause</span>';
    }
  }

  function updatePlayerVisuals(gradient) {
    const pGrad = document.getElementById('playerGradient');
    const pGlow = document.getElementById('playerGlow');
    const pBtn = document.getElementById('playPauseBtn');
    if (pGrad) pGrad.className = 'h-1 bg-gradient-to-r ' + gradient;
    if (pGlow) pGlow.className = 'absolute -inset-1 opacity-40 blur-xl transition-all duration-500 bg-gradient-to-r ' + gradient;
    if (pBtn) pBtn.className = 'relative w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-r ' + gradient;
  }

  function updatePlayPauseButton(playing) {
    const playIcon = document.getElementById('playerPlayIcon');
    const pauseIcon = document.getElementById('playerPauseIcon');
    const status = document.getElementById('playerStatus');
    if (playing) {
      playIcon.classList.add('hidden'); pauseIcon.classList.remove('hidden');
      status.innerHTML = '<span class="text-green-400 font-bold animate-pulse">● EN DIRECT</span>';
    } else {
      playIcon.classList.remove('hidden'); pauseIcon.classList.add('hidden');
      status.innerHTML = '<span class="text-gray-400">PAUSE</span>';
    }
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', function () {
      audio.volume = this.value;
      if (volumeFill) volumeFill.style.width = (this.value * 100) + '%';
      updateVolumeIcon();
    });
  }
  window.toggleMute = function () { audio.muted = !audio.muted; updateVolumeIcon(); }

  function updateVolumeIcon() {
    if (volumeIcon) volumeIcon.innerHTML = audio.muted || audio.volume == 0 ?
      '<path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" stroke="currentColor" stroke-width="2"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2"/>' :
      '<path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" stroke="currentColor" stroke-width="2"/>';
  }

  // ===== HISTORY SYSTEM =====

  function addToHistory(track) {
    // Add to beginning of array
    trackHistory.unshift(track);
    // Keep only last 10 tracks
    if (trackHistory.length > 10) {
      trackHistory.pop();
    }
    // Update UI
    renderHistory();
  }

  function renderHistory() {
    const historyList = document.getElementById('historyList');
    const historyCount = document.getElementById('historyCount');

    if (!historyList) return;

    if (trackHistory.length === 0) {
      historyList.innerHTML = `
        <div class="p-4 text-center text-gray-500 text-sm">
          <p>Aucun titre pour le moment</p>
          <p class="text-xs mt-1">L'historique s'affichera au fur et à mesure</p>
        </div>
      `;
      if (historyCount) historyCount.textContent = '0 titres';
      return;
    }

    if (historyCount) historyCount.textContent = `${trackHistory.length} titre${trackHistory.length > 1 ? 's' : ''}`;

    historyList.innerHTML = trackHistory.map((track, index) => {
      const timeAgo = getTimeAgo(track.timestamp);
      const searchQuery = encodeURIComponent(`${track.artist} ${track.title}`);

      return `
        <div class="flex items-center gap-3 p-3 hover:bg-white/5 transition-colors ${index !== trackHistory.length - 1 ? 'border-b border-white/5' : ''}">
          <!-- Cover -->
          <div class="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/10">
            <img src="${track.cover || 'images/noct-plm.png'}" alt="" class="w-full h-full object-cover">
          </div>
          
          <!-- Info -->
          <div class="flex-1 min-w-0">
            <p class="text-white text-sm font-medium truncate">${track.title}</p>
            <p class="text-gray-400 text-xs truncate">${track.artist}</p>
            <p class="text-gray-600 text-xs mt-0.5">${timeAgo} • ${track.radio}</p>
          </div>
          
          <!-- Streaming Links -->
          <div class="flex items-center gap-1">
            <a href="https://open.spotify.com/search/${searchQuery}" target="_blank" 
               class="w-8 h-8 rounded-full bg-white/5 hover:bg-green-500/20 flex items-center justify-center transition-colors group" title="Spotify">
              <svg class="w-4 h-4 text-gray-400 group-hover:text-green-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
            </a>
            <a href="https://www.deezer.com/search/${searchQuery}" target="_blank"
               class="w-8 h-8 rounded-full bg-white/5 hover:bg-purple-500/20 flex items-center justify-center transition-colors group" title="Deezer">
              <svg class="w-4 h-4 text-gray-400 group-hover:text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.81 4.16v3.03H24V4.16h-5.19zM6.27 8.38v3.027h5.189V8.38h-5.19zm12.54 0v3.027H24V8.38h-5.19zM6.27 12.594v3.027h5.189v-3.027h-5.19zm6.271 0v3.027h5.19v-3.027h-5.19zm6.27 0v3.027H24v-3.027h-5.19zM0 16.81v3.029h5.19v-3.03H0zm6.27 0v3.029h5.189v-3.03h-5.19zm6.271 0v3.029h5.19v-3.03h-5.19zm6.27 0v3.029H24v-3.03h-5.19z"/>
              </svg>
            </a>
            <a href="https://music.apple.com/search?term=${searchQuery}" target="_blank"
               class="w-8 h-8 rounded-full bg-white/5 hover:bg-pink-500/20 flex items-center justify-center transition-colors group" title="Apple Music">
              <svg class="w-4 h-4 text-gray-400 group-hover:text-pink-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.364-1.29.44-2.244 1.237-2.865 2.456a5.175 5.175 0 00-.428 1.282c-.09.437-.144.88-.173 1.327-.016.228-.023.457-.025.687V18.06c.01.16.02.32.03.478.046.8.13 1.592.396 2.35.496 1.41 1.426 2.4 2.792 2.96.616.253 1.263.38 1.927.432.34.027.683.036 1.024.04H18.12c.166-.01.332-.02.497-.032.727-.05 1.446-.14 2.128-.38 1.266-.447 2.196-1.25 2.8-2.45.285-.565.44-1.17.533-1.792.073-.48.108-.965.12-1.452v-.06c.01-.17.01-.34.01-.51z"/>
              </svg>
            </a>
          </div>
        </div>
      `;
    }).join('');
  }

  function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'À l\'instant';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Il y a ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    return `Il y a ${hours}h`;
  }

  window.toggleHistory = function () {
    const panel = document.getElementById('historyPanel');
    if (panel) {
      panel.classList.toggle('hidden');
    }
  };

  console.log('Noct PLM: Audio Buffer Sync Version Loaded');
});

/* =====================================================
   RADIO INFO SYSTEM
   ===================================================== */

const radioInfoData = {
  'funradio': {
    name: 'Fun Radio',
    slogan: 'Enjoy the Music',
    description: 'Fun Radio est une station de radio musicale belge qui diffuse principalement de la musique dance, électro et hits actuels. Connue pour ses DJ sets et ses événements musicaux.',
    location: 'Bruxelles, Belgique',
    year: '1983',
    genres: ['Dance', 'Électro', 'Hits', 'House'],
    website: 'https://www.funradio.be',
    socials: {
      facebook: 'https://www.facebook.com/funradiobe',
      instagram: 'https://www.instagram.com/funradiobe',
      twitter: 'https://twitter.com/funradiobe',
      youtube: 'https://www.youtube.com/funradiobe'
    },
    email: 'contact@funradio.be',
    gradient: 'from-yellow-400 via-orange-500 to-red-500'
  },
  'skyrock': {
    name: 'Skyrock',
    slogan: 'Premier sur le Rap',
    description: 'Skyrock est la radio française numéro 1 du rap et du RnB. Elle diffuse les meilleurs hits hip-hop français et internationaux depuis 1986.',
    location: 'Paris, France',
    year: '1986',
    genres: ['Rap', 'Hip-Hop', 'RnB', 'Urbain'],
    website: 'https://www.skyrock.fm',
    socials: {
      facebook: 'https://www.facebook.com/SkyrockOfficiel',
      instagram: 'https://www.instagram.com/skyabordo',
      twitter: 'https://twitter.com/abordo_skyrock',
      youtube: 'https://www.youtube.com/skyrock',
      snapchat: 'https://www.snapchat.com/add/skyrock',
      tiktok: 'https://www.tiktok.com/@skyrock'
    },
    email: 'contact@skyrock.com',
    gradient: 'from-red-500 via-orange-500 to-amber-500'
  },
  'skyrockplm': {
    name: 'Skyrock PLM',
    slogan: 'La Playlist Musicale Non-Stop',
    description: 'Skyrock PLM (Playlist Musicale) est la webradio de Skyrock dédiée à la musique non-stop, sans animateur. 100% hits rap et RnB en continu.',
    location: 'Paris, France',
    year: '2010',
    genres: ['Rap', 'Hip-Hop', 'RnB', 'Playlist'],
    website: 'https://www.skyrock.fm/plm',
    socials: {
      facebook: 'https://www.facebook.com/SkyrockOfficiel',
      instagram: 'https://www.instagram.com/skyabordo',
      twitter: 'https://twitter.com/abordo_skyrock'
    },
    email: 'contact@skyrock.com',
    gradient: 'from-orange-500 via-red-500 to-pink-500'
  },
  'mouv': {
    name: "Mouv'",
    slogan: '100% Urbain',
    description: "Mouv' est une station de Radio France dédiée aux cultures urbaines. Elle propose du rap français, de l'afrobeat, du reggaeton et des découvertes musicales.",
    location: 'Paris, France',
    year: '1997',
    genres: ['Rap FR', 'Afrobeat', 'Urbain', 'Reggaeton'],
    website: 'https://www.radiofrance.fr/mouv',
    socials: {
      facebook: 'https://www.facebook.com/moabordo',
      instagram: 'https://www.instagram.com/moabordo',
      twitter: 'https://twitter.com/moabordo',
      youtube: 'https://www.youtube.com/user/moabordo'
    },
    email: 'mouv@radiofrance.com',
    gradient: 'from-purple-500 via-pink-500 to-rose-500'
  }
};

// Social network icons
const socialIcons = {
  facebook: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  instagram: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>',
  twitter: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  youtube: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
  snapchat: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/></svg>',
  tiktok: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>'
};

function openRadioInfo(radioId, event) {
  event.stopPropagation(); // Prevent triggering playRadio

  const info = radioInfoData[radioId];
  if (!info) return;

  const modal = document.getElementById('radioInfoModal');
  const card = event.target.closest('.radio-card');
  const img = card?.dataset.img || '';

  // Update modal content
  document.getElementById('modalRadioImg').src = img;
  document.getElementById('modalRadioName').textContent = info.name;
  document.getElementById('modalRadioSlogan').textContent = info.slogan;
  document.getElementById('modalDescription').textContent = info.description;
  document.getElementById('modalLocation').textContent = info.location;
  document.getElementById('modalYear').textContent = info.year;

  // Set gradient
  const header = document.getElementById('modalHeader');
  header.className = `relative h-32 bg-gradient-to-r ${info.gradient} rounded-t-3xl`;

  // Genres
  const genresContainer = document.getElementById('modalGenres');
  genresContainer.innerHTML = info.genres.map(g =>
    `<span class="px-3 py-1 bg-white/10 rounded-full text-sm text-white">${g}</span>`
  ).join('');

  // Website
  const websiteEl = document.getElementById('modalWebsite');
  websiteEl.href = info.website;
  websiteEl.querySelector('span').textContent = info.website.replace('https://', '');

  // Socials
  const socialsContainer = document.getElementById('modalSocials');
  socialsContainer.innerHTML = Object.entries(info.socials).map(([platform, url]) =>
    `<a href="${url}" target="_blank" class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors" title="${platform}">
      ${socialIcons[platform] || ''}
    </a>`
  ).join('');

  // Email
  const emailEl = document.getElementById('modalEmail');
  emailEl.href = `mailto:${info.email}`;
  emailEl.textContent = info.email;

  // Listen button - store radioId for later
  document.getElementById('modalListenBtn').dataset.radioId = radioId;
  document.getElementById('modalListenBtn').onclick = () => {
    closeRadioInfo();
    const radioCard = document.querySelector(`[data-radio="${radioId}"]`);
    if (radioCard) playRadio(radioCard);
  };

  // Show modal
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
}

function closeRadioInfo() {
  const modal = document.getElementById('radioInfoModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.style.overflow = '';
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeRadioInfo();
});
