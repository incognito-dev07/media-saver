if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(registration => {
        console.log('ServiceWorker registered:', registration.scope);
      })
      .catch(error => {
        console.log('ServiceWorker registration failed:', error);
      });
  });
}

const onlineContent = document.getElementById('onlineContent');
const offlineContent = document.getElementById('offlineContent');

function updateOnlineStatus() {
  if (navigator.onLine) {
    onlineContent.classList.remove('hidden');
    offlineContent.classList.add('hidden');
  } else {
    onlineContent.classList.add('hidden');
    offlineContent.classList.remove('hidden');
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();