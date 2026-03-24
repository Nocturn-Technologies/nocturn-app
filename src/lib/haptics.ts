export function haptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'flip' | 'scan' | 'select' | 'confirm' = 'light') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  switch (type) {
    case 'light': navigator.vibrate(10); break;
    case 'medium': navigator.vibrate(30); break;
    case 'heavy': navigator.vibrate(50); break;
    case 'success': navigator.vibrate([30, 50, 30]); break;
    case 'error': navigator.vibrate([50, 30, 50, 30, 50]); break;
    case 'flip': navigator.vibrate([15, 30, 15]); break;
    case 'scan': navigator.vibrate([10, 20, 10, 20, 40]); break;
    case 'select': navigator.vibrate(8); break;
    case 'confirm': navigator.vibrate([20, 40, 60]); break;
  }
}
