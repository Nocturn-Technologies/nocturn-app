export function haptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  switch (type) {
    case 'light': navigator.vibrate(10); break;
    case 'medium': navigator.vibrate(30); break;
    case 'heavy': navigator.vibrate(50); break;
    case 'success': navigator.vibrate([30, 50, 30]); break;
    case 'error': navigator.vibrate([50, 30, 50, 30, 50]); break;
  }
}
