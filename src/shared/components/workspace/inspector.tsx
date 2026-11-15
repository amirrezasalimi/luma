import { useEffect, useState, type ChangeEvent } from 'react';
import { profilesContextState } from '../../services/runtime/profiles-context';
import { addObj, delObj, setObj } from '../../services/runtime/scene-objects';
import { attach, detach, scriptLifecycleState } from '../../services/runtime/script-lifecycle';

interface ObjectRecord {
  id: string; kind: string; by: string; parent: string; text: string; color: string; border: string; fill: string;
  fillA: number; bw: number; fs: number; n: number; r: number; vars: Record<string, unknown>;
  scripts: Array<{ name: string; src: string; by: string; err?: string }>;
  t: { x: number; y: number; z: number; x2: number; y2: number; z2: number; size: number };
}

function Field({ name, label, value, min, max, step, type = 'number', onChange }: {
  name: string; label: string; value: string | number; min?: number; max?: number; step?: number;
  type?: 'number' | 'range' | 'color' | 'text'; onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return <div><label htmlFor={`inspector-${name}`}>{label}</label><input id={`inspector-${name}`} data-p={name} type={type} value={value}
    min={min} max={max} step={step} onChange={onChange} /></div>;
}

export function Inspector() {
  const [revision, setRevision] = useState(0);
  const [scriptName, setScriptName] = useState('main');
  const [scriptSource, setScriptSource] = useState('exportVars({speed:1});\nfunction mount(){}\nfunction update(dt){self.rot+=dt*self.speed}\nfunction onClick(e){self.animate("pulse")}\nfunction unmount(){}');
  const selectedId = profilesContextState.sel as string | null;
  const object = selectedId ? profilesContextState.O.get(selectedId) as ObjectRecord | undefined : undefined;

  useEffect(() => { setRevision(value => value + 1); }, [selectedId]);
  const update = (event: ChangeEvent<HTMLInputElement>) => {
    const target = event.currentTarget;
    if (!object) return;
    const key = target.dataset.p;
    if (!key) return;
    if (key === 'parent') setObj(object as never, { parent: target.value });
    else setObj(object as never, { [key]: target.type === 'number' || target.type === 'range' ? Number(target.value) : target.value });
    setRevision(value => value + 1);
  };
  if (!object) return <div className="mut">No selection</div>;
  const node = object.kind === 'node';
  const number = (key: keyof ObjectRecord['t'], label: string, min: number, max: number, step: number, type: 'number' | 'range' = 'number') =>
    <Field name={key} label={label} value={object.t[key]} min={min} max={max} step={step} type={type} onChange={update} />;
  const duplicate = () => {
    const copy = addObj({ kind: object.kind, text: object.text, color: object.color, border: object.border, fill: object.fill,
      fillA: object.fillA, bw: object.bw, fs: object.fs, n: object.n, size: object.t.size, x: object.t.x + .8,
      y: object.t.y, z: object.t.z, x2: object.t.x2 + .8, y2: object.t.y2, z2: object.t.z2, parent: object.parent,
      vars: object.vars, keep: 0 });
    for (const script of object.scripts) attach(copy, script.name, script.src, script.by);
    profilesContextState.sel = copy.id;
    setRevision(value => value + 1);
  };

  return <section key={`${object.id}:${revision}`}>
    <label>{object.kind.toUpperCase()} · {object.id} · by {object.by}</label>
    {!node && <Field name="text" label="TEXT / LABEL" value={object.text} type="text" onChange={update} />}
    <Field name="parent" label="PARENT NODE" value={object.parent} type="text" onChange={update} />
    {!node && <div className="g3">
      <Field name="color" label="TEXT" value={object.color} type="color" onChange={update} />
      <Field name="border" label="BORDER" value={object.border} type="color" onChange={update} />
      <Field name="fill" label="FILL" value={object.fill} type="color" onChange={update} />
    </div>}
    {!node && <>
      <Field name="fillA" label="FILL DENSITY" value={object.fillA} min={0} max={1} step={.01} type="range" onChange={update} />
      <Field name="bw" label="BORDER WIDTH" value={object.bw} min={0} max={10} step={.5} type="range" onChange={update} />
      {object.kind !== 'link' && number('size', 'SIZE', .2, 5, .1)}
      <Field name="fs" label="FONT SIZE" value={object.fs} min={8} max={64} step={1} type="range" onChange={update} />
      {object.kind === 'poly' && <Field name="n" label="SIDES" value={object.n} min={3} max={12} step={1} type="range" onChange={update} />}
    </>}
    {object.kind !== 'link' && <div className="g3">{number('x', 'X', -8, 8, .1)}{number('y', 'Y', -4, 6, .1)}{number('z', 'Z', -8, 8, .1)}</div>}
    {node && <Field name="rot" label="ROTATION" value={object.r} min={-7} max={7} step={.05} type="range" onChange={update} />}
    {object.kind === 'arrow' && <div className="g3">{number('x2', 'X2', -8, 8, .1)}{number('y2', 'Y2', -4, 6, .1)}{number('z2', 'Z2', -8, 8, .1)}</div>}
    <div style={{ display: 'flex', gap: 6 }}><button type="button" onClick={duplicate} disabled={object.kind === 'link'}>DUPLICATE</button>
      <button type="button" onClick={() => { delObj(object.id); profilesContextState.sel = null; setRevision(value => value + 1); }}>DELETE</button></div>
    <label>SCRIPTS</label>
    {object.scripts.map(script => <div className="ar" key={script.name}><b>{script.name}</b><span>{script.err ? '✖ error' : '✓ ok'} · {script.by}</span>
      {script.err && <div className="err-box">{scriptLifecycleState.errTxt(script.err)}</div>}
      <div className="bt"><button type="button" onClick={() => { setScriptName(script.name); setScriptSource(script.src); }}>EDIT</button>
        <button type="button" onClick={() => { detach(object as never, script.name); setRevision(value => value + 1); }}>REMOVE</button></div></div>)}
    <input aria-label="Script name" value={scriptName} onChange={event => setScriptName(event.target.value)} />
    <textarea aria-label="Script source" rows={8} spellCheck={false} value={scriptSource} onChange={event => setScriptSource(event.target.value)} />
    <button type="button" onClick={() => { attach(object as never, scriptName.trim() || 'main', scriptSource, 'user'); setRevision(value => value + 1); }}>ATTACH / UPDATE</button>
    <label>VARS (JSON)</label><textarea rows={2} spellCheck={false} defaultValue={JSON.stringify(object.vars)} onBlur={event => {
      try { object.vars = JSON.parse(event.currentTarget.value) as Record<string, unknown>; setRevision(value => value + 1); } catch { /* Keep invalid edits visible without mutating runtime vars. */ }
    }} />
  </section>;
}
