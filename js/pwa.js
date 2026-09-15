(() => {
  const INSTALL_DISMISSED_KEY = 'pwa_install_dismissed';
  const banner = document.getElementById('pwaInstallBanner');
  const installBtn = document.getElementById('pwaInstallBtn');
  const dismissBtn = document.getElementById('pwaInstallDismiss');
  const iosHint = document.getElementById('pwaIosHint');
  const toast = document.getElementById('pwaToast');

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

  let deferredPrompt = null;

  function showToast(message, actionLabel, onAction) {
    if (!toast) return;
    toast.hidden = false;
    toast.innerHTML = '';
    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);
    if (actionLabel && onAction) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm';
      btn.textContent = actionLabel;
      btn.addEventListener('click', onAction);
      toast.appendChild(btn);
    }
    if (!onAction) {
      setTimeout(() => { toast.hidden = true; }, 4000);
    }
  }

  function showBanner() {
    if (!banner || isStandalone) return;
    if (sessionStorage.getItem(INSTALL_DISMISSED_KEY)) return;
    banner.hidden = false;
  }

  function hideBanner() {
    if (banner) banner.hidden = true;
    sessionStorage.setItem(INSTALL_DISMISSED_KEY, '1');
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (iosHint) iosHint.hidden = true;
    showBanner();
  });

  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    hideBanner();
  });

  dismissBtn?.addEventListener('click', hideBanner);

  window.addEventListener('appinstalled', () => {
    hideBanner();
    showToast('App instalada. Ya puedes abrirla desde el inicio.');
  });

  if (isIos && isSafari && !isStandalone) {
    if (iosHint) iosHint.hidden = false;
    showBanner();
    if (installBtn) installBtn.hidden = true;
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          showToast('Hay una versión nueva.', 'Actualizar', () => {
            registration.waiting.postMessage('SKIP_WAITING');
          });
        }

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Hay una versión nueva.', 'Actualizar', () => {
                worker.postMessage('SKIP_WAITING');
              });
            }
          });
        });
      }).catch(() => {
        /* Sin service worker la app sigue funcionando en línea. */
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    });
  }

  window.showPwaToast = showToast;

  window.addEventListener('online', () => {
    showToast('Conexión restablecida.');
    window.dispatchEvent(new CustomEvent('voluntarios:online'));
  });
  window.addEventListener('offline', () => showToast('Estás sin conexión. Se usará la última copia local.'));

  document.addEventListener('DOMContentLoaded', () => {
    const tab = new URLSearchParams(location.search).get('tab');
    if (!tab) return;
    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (btn) btn.click();
  });
})();
