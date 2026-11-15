import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { useRuntimeUI, type RuntimeImage as ImageState } from '../../../stores/runtime-ui';

function ImageContent({ image, modal = false, step, open }: { image: ImageState; modal?: boolean; step: (delta: number) => void; open: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const img = <>
    <img src={image.url || undefined} alt={image.alt} decoding="async" hidden={!loaded || failed}
      onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
      style={{ objectFit: image.fit, ...(!modal ? { position: image.height === 'auto' ? 'static' : 'absolute', height: image.height === 'auto' ? 'auto' : '100%' } as const : {}) }} />
    <span className="gimage-status" role="status" aria-live="polite" hidden={loaded && !failed}>{!image.url ? image.count ? 'Image unavailable: invalid or unsafe URL.' : 'No images.' : failed ? 'Image could not be loaded.' : 'Loading image…'}</span>
  </>;
  return <>
    {modal ? <div aria-busy={!!image.url && !loaded && !failed}>{img}</div> : <button type="button" className="gimage-view" disabled={image.disabled || !image.url}
      aria-label={image.alt ? `Open image: ${image.alt}` : 'Open image in lightbox'} aria-haspopup="dialog" aria-busy={!!image.url && !loaded && !failed}
      style={{ height: image.height === 'fixed' ? 0 : image.height === 'auto' ? 'auto' : 180, flex: image.height === 'fixed' ? '1 1 0px' : 'none' }} onClick={open}>{img}</button>}
    {modal ? <p className="gimage-caption" hidden={!image.caption}>{image.caption}</p> : <figcaption className="gimage-caption" hidden={!image.caption}>{image.caption}</figcaption>}
    <div className="gimage-controls" hidden={image.count < 2}>
      <button type="button" aria-label="Previous image" disabled={image.disabled || image.count < 2} onClick={e => { e.stopPropagation(); step(-1); }}>←</button>
      <span aria-live="polite">{image.count ? image.index + 1 : 0} / {image.count}</span>
      <button type="button" aria-label="Next image" disabled={image.disabled || image.count < 2} onClick={e => { e.stopPropagation(); step(1); }}>→</button>
    </div>
  </>;
}

function ImageDialog({ id, image, step, close }: { id: string; image: ImageState; step: (delta: number) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const focus = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<dialog ref={dialog} className="gimage-lightbox" aria-labelledby={`gimage-title-${id}`} aria-modal="true"
    onCancel={event => { event.preventDefault(); close(); }} onClose={close}
    onClick={event => {
      event.stopPropagation();
      if (event.target !== event.currentTarget) return;
      const r = event.currentTarget.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
    }} onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); event.stopPropagation(); step(event.key === 'ArrowLeft' ? -1 : 1);
      }
    }}>
    <h2 id={`gimage-title-${id}`}>Image viewer</h2><button type="button" aria-label="Close image lightbox" autoFocus onClick={close}>Close</button>
    <ImageContent key={image.url} image={image} modal step={step} open={() => {}} />
  </dialog>, document.body);
}

function RuntimeImage({ id, step, open, close }: { id: string; step: (delta: number) => void; open: () => void; close: () => void }) {
  const image = useRuntimeUI(state => state.images[id]);
  if (!image) return null;
  return <><ImageContent key={image.url} image={image} step={step} open={open} />
    {image.open && <ImageDialog id={id} image={image} step={step} close={close} />}</>;
}

/** The legacy runtime owns only the figure host; React exclusively owns its contents. */
export function mountRuntimeImage(host: HTMLElement, id: string, actions: { step: (delta: number) => void; open: () => void; close: () => void }): () => void {
  const root = createRoot(host);
  let mounted = true;
  root.render(<RuntimeImage id={id} {...actions} />);
  return () => {
    if (!mounted) return;
    mounted = false;
    root.unmount();
    useRuntimeUI.setState(state => {
      const images = { ...state.images };
      delete images[id];
      return { images };
    });
  };
}
