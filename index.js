import { serviceWorkerManager } from '/src/ServiceWorkerManager.js';
import '/components/UpdateNotification.js';

const whenLoaded = Promise.all([customElements.whenDefined('update-notification')]);

whenLoaded.then(async () => {
  const updateNotification = document.querySelector('update-notification');

  window.addEventListener('sw-update-available', event => {
    console.log('Service worker update available, showing notification');
    updateNotification.show(event.detail.pendingWorker);
  });

  await serviceWorkerManager.register();
});
