import { useEffect, useRef, useState } from 'react';
import { useRuntimeUI, type RuntimeQuestion } from '../../../stores/runtime-ui';

function QuestionCard({ question: q }: { question: RuntimeQuestion }) {
  const card = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('');
  useEffect(() => { card.current?.scrollIntoView({ block: 'nearest' }); }, []);
  return <form ref={card} className="pn" style={{ padding: 12 }} onSubmit={event => {
    event.preventDefault();
    if (q.options.length && !q.multiple && !selected.length) return;
    q.finish({ cancelled: false, value: !q.options.length ? text : q.multiple ? selected : q.yesNo ? selected[0] === 'Yes' : selected[0] });
  }}>
    <strong>{q.title}</strong><p>{q.question}</p>
    <div>{q.options.length ? q.options.map((option, index) => <label key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type={q.multiple ? 'checkbox' : 'radio'} name={q.id} value={option.value} style={{ width: 'auto' }}
        checked={selected.includes(option.value)} onChange={event => setSelected(current => q.multiple
          ? event.target.checked ? [...current, option.value] : current.filter(value => value !== option.value)
          : [option.value])} />
      <span>{option.label}</span>
    </label>) : <textarea rows={2} placeholder="Your answer" value={text} onChange={event => setText(event.target.value)} />}</div>
    <button type="submit">ANSWER</button><button type="button" onClick={() => q.finish({ cancelled: true })}>CANCEL</button>
  </form>;
}

export function RuntimeOverlays() {
  const questions = useRuntimeUI(state => state.questions);
  const restoring = useRuntimeUI(state => state.restoringSession);
  const warning = useRuntimeUI(state => state.storageWarning);
  return <>
    <section aria-label="Agent questions" style={{ position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: 'min(640px,94vw)', maxHeight: '45vh', overflow: 'auto', zIndex: 8, display: 'grid', gap: 8 }}>
      {questions.map(question => <QuestionCard key={question.id} question={question} />)}
    </section>
    {restoring && <div role="status" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--card)', color: 'var(--fg)', display: 'grid', placeItems: 'center' }}>Restoring latest session…</div>}
    {warning && <div id="session-storage-warning" role="alert" style={{ position: 'fixed', bottom: 12, left: 12, maxWidth: 600, zIndex: 99, padding: 12, background: '#321020', color: '#fff', border: '1px solid #ff647c' }}>{warning}</div>}
  </>;
}
