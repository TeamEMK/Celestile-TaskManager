'use client';
import { useState } from 'react';

export function useConfirmToast() {
  const [state, setState] = useState(null); // { msg, onConfirm }

  function ask(msg, onConfirm) {
    setState({ msg, onConfirm });
  }

  const ConfirmUI = state ? (
    <div style={{
      position: 'fixed', bottom: '28px', left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      background: 'linear-gradient(180deg, #1F2937, #111111)',
      padding: '14px 20px',
      borderRadius: '14px',
      boxShadow: '0 12px 40px rgba(20,15,8,0.45)',
      display: 'flex', alignItems: 'center', gap: '14px',
      border: '1px solid rgba(232,200,154,0.14)',
      whiteSpace: 'nowrap',
    }}>
      <style>{`@keyframes _ctin{from{opacity:0;transform:translateX(-50%) translateY(14px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      <style>{`div[data-ctid]{animation:_ctin 0.25s cubic-bezier(0.16,1,0.3,1)}`}</style>
      <span data-ctid="1" style={{ fontSize: '15px', fontWeight: 500, color: '#E5E5E5' }}>{state.msg}</span>
      <button
        onClick={() => { const fn = state.onConfirm; setState(null); fn(); }}
        style={{
          background: '#ef4444', color: '#fff', border: 'none',
          padding: '7px 18px', borderRadius: '8px', cursor: 'pointer',
          fontSize: '12px', fontWeight: 700, letterSpacing: '0.02em',
        }}
      >Confirm</button>
      <button
        onClick={() => setState(null)}
        style={{
          background: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: 'none',
          padding: '7px 14px', borderRadius: '8px', cursor: 'pointer',
          fontSize: '12px', fontWeight: 600,
        }}
      >Cancel</button>
    </div>
  ) : null;

  return { ask, ConfirmUI };
}
