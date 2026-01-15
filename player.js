/* =====================================================
   NOCT PLM - Radio Player Controller
   With Now Playing API Integration
   ===================================================== */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function () {

  // DOM Elements
  const audio = document.getElementById('audio');
  const player = document.getElementById('player');
  const playerImg = document.getElementById('playerImg');
  const playerName = document.getElementById('playerName');
  const playerStatus = document.getElementById('playerStatus');
  const playerGradient = document.getElementById('playerGradient');
  const playerGlow = document.getElementById('playerGlow');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playerPlayIcon = document.getElementById('playerPlayIcon');
  const playerPauseIcon = document.getElementById('playerPauseIcon');
  const volumeSlider = document.getElementById('volume');
  const volumeFill = document.getElementById('volumeFill');
  const volumeIcon = document.getElementById('volumeIcon');

  // State
  let currentCard = null;
  let isPlaying = false;
  let isMuted = false;
  let currentGradient = 'from-purple-500 via-pink-500 to-cyan-500';
  let currentRadioId = null;
  let nowPlayingInterval = null;

  // Radio API configurations
  const radioAPIs = {
    'skyrock': {
      api: 'https://skyrock.fm/api/v3/player/onair/plm',
      fallbackApi: null,
      parseResponse: function (data) {
        if (data && data.current) {
          return {
            title: data.current.title || 'Titre inconnu',
            artist: data.current.artist || 'Artiste inconnu',
            cover: data.current.cover || null
          };
        }
        return null;
      }
    },
    'funradio': {
      api: 'https://www.funradio.fr/api/players/now-playing',
      fallbackApi: null,
      parseResponse: function (data) {
        if (data && data.now) {
          return {
            title: data.now.song || 'Titre inconnu',
            artist: data.now.artist || 'Artiste inconnu',
            cover: data.now.cover || null
          };
        }
        return null;
      }
    },
    'mouv': {
      api: 'https://www.radiofrance.fr/api/v2.1/stations/mouv/live',
      fallbackApi: null,
      parseResponse: function (data) {
        if (data && data.now && data.now.playing_item) {
          const item = data.now.playing_item;
          return {
            title: item.title || 'Titre inconnu',
            artist: item.subtitle || 'Artiste inconnu',
            cover: item.cover || null
          };
        }
        return null;
      }
    }
  };

  // Initialize volume
  if (volumeSlider) {
    audio.volume = volumeSlider.value;

    volumeSlider.addEventListener('input', function () {
      audio.volume = this.value;
      if (volumeFill) {
        volumeFill.style.width = (this.value * 100) + '%';
      }
      isMuted = this.value == 0;
      updateVolumeIcon();
    });
  }

  // Make playRadio globally accessible
  window.playRadio = function (card) {
    const name = card.dataset.name;
    const url = card.dataset.url;
    const img = card.dataset.img;
    const gradient = card.dataset.gradient;
    const radioId = card.dataset.radio || name.toLowerCase().replace(/[^a-z]/g, '');

    console.log('Playing:', name, url);

    // If clicking same card and playing, pause
    if (currentCard === card && isPlaying) {
      pauseRadio();
      return;
    }

    // Reset all cards
    resetAllCards();

    // Stop previous now playing updates
    if (nowPlayingInterval) {
      clearInterval(nowPlayingInterval);
    }

    // Update current card
    currentCard = card;
    currentGradient = gradient;
    currentRadioId = radioId;

    // Update card visual state
    card.classList.add('ring-2', 'ring-white/30');
    const equalizer = card.querySelector('.equalizer');
    if (equalizer) {
      equalizer.classList.remove('hidden');
      equalizer.classList.add('flex');
    }
    const status = card.querySelector('.status');
    if (status) {
      status.innerHTML = '<span class="text-green-400">▶ En lecture</span>';
    }

    // Load and play audio
    audio.src = url;
    audio.play().then(function () {
      isPlaying = true;
      updatePlayerUI(name, img, gradient);
      showPlayer();
      document.title = name + ' • Noct PLM';

      // Start fetching now playing info
      fetchNowPlaying(radioId, img);
      nowPlayingInterval = setInterval(function () {
        fetchNowPlaying(radioId, img);
      }, 15000); // Update every 15 seconds

    }).catch(function (e) {
      console.error('Playback error:', e);
      playerStatus.textContent = 'Erreur de lecture';
    });
  };

  // Fetch now playing info from API
  async function fetchNowPlaying(radioId, fallbackImg) {
    const config = radioAPIs[radioId];
    if (!config) {
      console.log('No API config for:', radioId);
      return;
    }

    try {
      const response = await fetch(config.api, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('API error: ' + response.status);
      }

      const data = await response.json();
      const nowPlaying = config.parseResponse(data);

      if (nowPlaying) {
        updateNowPlaying(nowPlaying, fallbackImg);
      }
    } catch (error) {
      console.log('Could not fetch now playing:', error.message);
      // Keep showing radio name if API fails
    }
  }

  // Update player with now playing info
  function updateNowPlaying(info, fallbackImg) {
    if (info.artist && info.title) {
      playerName.innerHTML = `
        <span class="block text-white font-semibold truncate">${info.title}</span>
        <span class="block text-sm text-gray-400 truncate">${info.artist}</span>
      `;
    }

    // Update cover if available
    if (info.cover && playerImg) {
      playerImg.src = info.cover;
      playerImg.onerror = function () {
        this.src = fallbackImg;
      };
    }
  }

  // Make togglePlay globally accessible
  window.togglePlay = function () {
    if (!audio.src) return;

    if (isPlaying) {
      pauseRadio();
    } else {
      audio.play();
      isPlaying = true;
      playerPlayIcon.classList.add('hidden');
      playerPauseIcon.classList.remove('hidden');
      playerStatus.innerHTML = '<span class="text-green-400">🔴 En direct</span>';

      if (currentCard) {
        const equalizer = currentCard.querySelector('.equalizer');
        if (equalizer) {
          equalizer.classList.remove('hidden');
          equalizer.classList.add('flex');
        }
      }
    }
  };

  // Make stopRadio globally accessible
  window.stopRadio = function () {
    audio.pause();
    audio.src = '';
    isPlaying = false;

    // Stop now playing updates
    if (nowPlayingInterval) {
      clearInterval(nowPlayingInterval);
      nowPlayingInterval = null;
    }

    // Hide player
    player.style.opacity = '0';
    player.style.pointerEvents = 'none';
    player.style.transform = 'translateY(20px)';

    // Reset all cards
    resetAllCards();
    currentCard = null;
    currentRadioId = null;

    document.title = 'Noct PLM • Radio Streaming';
  };

  // Make toggleMute globally accessible
  window.toggleMute = function () {
    isMuted = !isMuted;
    audio.muted = isMuted;

    if (volumeFill) {
      if (isMuted) {
        volumeFill.style.width = '0%';
      } else {
        volumeFill.style.width = (volumeSlider.value * 100) + '%';
      }
    }

    updateVolumeIcon();
  };

  function pauseRadio() {
    audio.pause();
    isPlaying = false;

    playerPlayIcon.classList.remove('hidden');
    playerPauseIcon.classList.add('hidden');
    playerStatus.innerHTML = '<span class="text-gray-400">En pause</span>';

    if (currentCard) {
      const equalizer = currentCard.querySelector('.equalizer');
      if (equalizer) {
        equalizer.classList.add('hidden');
        equalizer.classList.remove('flex');
      }
      const status = currentCard.querySelector('.status');
      if (status) {
        status.innerHTML = '<span class="text-yellow-400">⏸ En pause</span>';
      }
    }
  }

  function resetAllCards() {
    document.querySelectorAll('.radio-card').forEach(function (card) {
      card.classList.remove('ring-2', 'ring-white/30');

      const equalizer = card.querySelector('.equalizer');
      if (equalizer) {
        equalizer.classList.add('hidden');
        equalizer.classList.remove('flex');
      }

      const status = card.querySelector('.status');
      if (status) {
        status.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/>
          </svg>
          Cliquer pour écouter
        `;
      }
    });
  }

  function updatePlayerUI(name, img, gradient) {
    playerImg.src = img;
    playerName.textContent = name;

    playerPlayIcon.classList.add('hidden');
    playerPauseIcon.classList.remove('hidden');

    playerStatus.innerHTML = '<span class="text-green-400">🔴 En direct</span>';

    // Update gradient colors
    if (playerGradient) {
      playerGradient.className = 'h-1 bg-gradient-to-r ' + gradient;
    }
    if (playerGlow) {
      playerGlow.className = 'absolute -inset-1 bg-gradient-to-r ' + gradient + ' opacity-50 blur-xl transition-all duration-500';
    }
    if (playPauseBtn) {
      playPauseBtn.className = 'relative w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center bg-gradient-to-r ' + gradient + ' shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105';
    }
  }

  function showPlayer() {
    player.style.opacity = '1';
    player.style.pointerEvents = 'auto';
    player.style.transform = 'translateY(0)';
  }

  function updateVolumeIcon() {
    if (!volumeIcon) return;

    if (isMuted || audio.volume === 0) {
      volumeIcon.innerHTML = `
        <path d="M11 5L6 9H2v6h4l5 4V5z"/>
        <line x1="23" y1="9" x2="17" y2="15"/>
        <line x1="17" y1="9" x2="23" y2="15"/>
      `;
    } else {
      volumeIcon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>
      `;
    }
  }

  // Audio event listeners
  audio.addEventListener('error', function (e) {
    console.error('Audio error:', e);
    playerStatus.innerHTML = '<span class="text-red-400">Erreur de connexion</span>';
  });

  audio.addEventListener('waiting', function () {
    playerStatus.innerHTML = '<span class="text-yellow-400">Chargement...</span>';
  });

  audio.addEventListener('playing', function () {
    playerStatus.innerHTML = '<span class="text-green-400">🔴 En direct</span>';
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      window.togglePlay();
    }
    if (e.code === 'KeyM') {
      e.preventDefault();
      window.toggleMute();
    }
  });

  console.log('Noct PLM Player initialized!');
});
