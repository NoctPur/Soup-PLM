const audio = document.getElementById("audio");
const logo = document.getElementById("playerLogo");
const text = document.getElementById("playerRadio");
const volume = document.getElementById("volume");

let isPlaying = false;

function playRadio(name, url, img) {
  audio.src = url;
  audio.play();
  isPlaying = true;

  logo.src = img;
  text.textContent = name;
  document.title = name + " • Noct PLM";
}

function togglePlay() {
  if (!audio.src) return;

  if (audio.paused) {
    audio.play();
    isPlaying = true;
  } else {
    audio.pause();
    isPlaying = false;
  }
}

function stopRadio() {
  audio.pause();
  audio.src = "";
  text.textContent = "Aucune radio";
  logo.src = "favicon.png";
  document.title = "Noct PLM";
}

volume.addEventListener("input", () => {
  audio.volume = volume.value;
});
