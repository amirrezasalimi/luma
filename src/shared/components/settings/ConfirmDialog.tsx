import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const Confirmation = createContext<(message: string) => Promise<boolean>>(async () => false);
export const useSettingsConfirm = () => useContext(Confirmation);

export function SettingsConfirmProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const resolve = useRef<((accepted: boolean) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const title = useId(), description = useId();
  function finish(accepted: boolean) {
    dialog.current?.close();
    setMessage('');
    resolve.current?.(accepted);
    resolve.current = null;
  }
  useEffect(() => {
    if (message) { dialog.current?.showModal(); cancel.current?.focus(); }
  }, [message]);
  useEffect(() => () => { resolve.current?.(false); }, []);
  return <Confirmation.Provider value={text => new Promise<boolean>(done => {
    resolve.current?.(false);
    resolve.current = done;
    setMessage(text);
  })}>
    {children}
    {typeof document !== 'undefined' && createPortal(<dialog ref={dialog} className="settings-confirm" aria-labelledby={title} aria-describedby={description}
      onKeyDown={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); finish(false); }}>
      <span className="settings-eyebrow">REVIEW ACTION</span>
      <h2 id={title}>Please confirm</h2>
      <p id={description}>{message}</p>
      <div className="settings-confirm-actions"><button ref={cancel} type="button" onClick={() => finish(false)}>Cancel</button><button type="button" className="confirm-accept" onClick={() => finish(true)}>Confirm</button></div>
    </dialog>, document.body)}
  </Confirmation.Provider>;
}
