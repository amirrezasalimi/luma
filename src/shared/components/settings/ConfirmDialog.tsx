import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../Modal';

const Confirmation = createContext<(message: string) => Promise<boolean>>(async () => false);
export const useSettingsConfirm = () => useContext(Confirmation);

export function SettingsConfirmProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const resolve = useRef<((accepted: boolean) => void) | null>(null);
  const title = useId(), description = useId();
  function finish(accepted: boolean) {
    setMessage('');
    resolve.current?.(accepted);
    resolve.current = null;
  }
  useEffect(() => () => { resolve.current?.(false); }, []);
  return <Confirmation.Provider value={text => new Promise<boolean>(done => {
    resolve.current?.(false);
    resolve.current = done;
    setMessage(text);
  })}>
    {children}
    {message && <Modal className="settings-confirm" aria-labelledby={title} aria-describedby={description} onClose={() => finish(false)}>
      <span className="settings-eyebrow">REVIEW ACTION</span>
      <h2 id={title}>Please confirm</h2>
      <p id={description}>{message}</p>
      <div className="settings-confirm-actions"><button autoFocus type="button" onClick={() => finish(false)}>Cancel</button><button type="button" className="confirm-accept" onClick={() => finish(true)}>Confirm</button></div>
    </Modal>}
  </Confirmation.Provider>;
}
