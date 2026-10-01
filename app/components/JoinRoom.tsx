'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeCode, isCode, CODE_LENGTH } from '../_lib/online/protocol';

/** "Got a room code?" A friend who was told the code out loud types it here. */
export default function JoinRoom() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const join = () => {
    if (!isCode(code)) { setError(`Codes are ${CODE_LENGTH} letters, like TAXW.`); return; }
    router.push(`/r/${code}`);
  };
  return (
    <form
      onSubmit={e => { e.preventDefault(); join(); }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 48 }}
    >
      <label htmlFor="room-code" style={{ fontSize: 12, color: 'rgba(240,236,224,0.5)' }}>Got a room code from a friend?</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id="room-code"
          value={code}
          onChange={e => { setCode(normalizeCode(e.target.value)); setError(''); }}
          placeholder="ABCD"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          style={{ width: 120, padding: '10px 14px', borderRadius: 22, border: '1px solid rgba(240,236,224,0.25)', background: 'rgba(240,236,224,0.05)', color: 'var(--fog)', fontSize: 16, letterSpacing: '.25em', textAlign: 'center', fontFamily: "'Space Grotesk',sans-serif", textTransform: 'uppercase' }}
        />
        <button type="submit" style={{ padding: '10px 22px', borderRadius: 22, border: 'none', background: 'var(--fog)', color: '#0d110b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Join</button>
      </div>
      {error && <p role="alert" style={{ fontSize: 12, color: '#ef8a7a', margin: 0 }}>{error}</p>}
    </form>
  );
}
