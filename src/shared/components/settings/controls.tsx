import { useId, type ReactNode } from 'react';

export function Field({ label, value, onChange, multiline = false, type = 'text', maxLength, placeholder }: {
  label: string; value: string | number; onChange(value: string): void;
  multiline?: boolean; type?: string; maxLength?: number; placeholder?: string;
}) {
  const id = useId();
  return <><label htmlFor={id}>{label}</label>{multiline
    ? <textarea id={id} rows={5} value={value} maxLength={maxLength} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    : <input id={id} type={type} value={value} maxLength={maxLength} placeholder={placeholder} onChange={e => onChange(e.target.value)} />}</>;
}

export function Select({ label, value, onChange, children }: {
  label: string; value: string; onChange(value: string): void; children: ReactNode;
}) {
  const id = useId();
  return <><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={e => onChange(e.target.value)}>{children}</select></>;
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="ck"><input type="checkbox" style={{ width: 'auto' }} checked={checked} onChange={e => onChange(e.target.checked)} /> {label}</label>;
}

export function Action({ children, onClick, disabled = false }: { children: ReactNode; onClick(): void; disabled?: boolean }) {
  return <button className="b" type="button" disabled={disabled} onClick={onClick}>{children}</button>;
}

export function ReasoningOptions() {
  return <><option value="">Provider default</option>{['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].map(value =>
    <option key={value} value={value}>{value === 'xhigh' ? 'Extra high' : value[0].toUpperCase() + value.slice(1)}</option>)}</>;
}
