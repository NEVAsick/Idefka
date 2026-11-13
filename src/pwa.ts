type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

let installPrompt: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

const isLocal = () => location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

export function initPwa() {
  if ('serviceWorker' in navigator && !isLocal()) {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    notify();
  });
}

export const canInstall = () => !!installPrompt;

export function onInstallChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function install() {
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt = null;
  notify();
}
