import { useEffect, useRef, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';

type Props = Omit<ComponentProps<'dialog'>, 'open' | 'onClose'> & { open?: boolean; onClose: () => void };

/** Shared native modal: top-layer focus containment, Escape, backdrop and focus return. */
export function Modal({ open = true, onClose, children, onKeyDown, ...props }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const previous = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  if (typeof document === 'undefined') return null;
  return createPortal(<dialog {...props} ref={ref} aria-modal="true"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      onKeyDown?.(event);
    }} onClick={event => {
      event.stopPropagation();
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>{children}</dialog>, document.body);
}
