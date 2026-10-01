'use client';
import { useSyncExternalStore } from 'react';
import { controlsText } from '../_lib/players';

// Touch support never changes while the page is open, so there's nothing to subscribe to.
const subscribe = () => () => {};
const touchNow = () => navigator.maxTouchPoints > 0;
// The server can't know; render the keyboard wording there and let the client correct it.
const touchOnServer = () => false;

export default function Controls() {
  const isTouch = useSyncExternalStore(subscribe, touchNow, touchOnServer);
  return (
    <span>{controlsText(isTouch)} · roles swap after round 1 · Esc, P or Start pauses</span>
  );
}
