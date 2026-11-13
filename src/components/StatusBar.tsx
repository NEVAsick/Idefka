import { useEffect, useMemo, useState } from 'react';
import { select, useStore } from '../store';
import { validate, type Issue } from '../model/validate';
import { diagramOrder, diagramTitle, nodeOf } from '../model/query';
import { NOTATIONS } from '../model/notation';
import { openDiagram } from '../actions';
import { Icon } from './icons';

function goToIssue(issue: Issue) {
  openDiagram(issue.diagram);
  if (issue.kind === 'box') select({ boxes: [issue.id] });
  if (issue.kind === 'arrow') select({ arrows: [issue.id] });
}

function useEscapeToClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
}

function IssuesPopup({ issues, notationName, currentId, close }: { issues: Issue[]; notationName: string; currentId: string; close: () => void }) {
  return (
    <>
      <div className="menu-backdrop" onPointerDown={close} />
      <div className="issues-pop">
        <div className="issues-head">
          Проверка по правилам {notationName}
          <button className="tb-icon" onClick={close} aria-label="Закрыть">
            <Icon.close />
          </button>
        </div>
        <div className="issues-list">
          {issues.map((issue, i) => (
            <button key={i} className={'issue' + (issue.diagram === currentId ? ' here' : '')} onClick={() => goToIssue(issue)}>
              {issue.text}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function issuesLabel(total: number, here: number) {
  if (!total) return 'Модель соответствует правилам';
  return `Замечаний: ${total}${here ? ` (здесь ${here})` : ''}`;
}

export function StatusBar() {
  const { model, diagramId } = useStore();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  useEscapeToClose(open, close);

  const diagram = model.diagrams[diagramId];
  const notation = NOTATIONS[diagram.notation];
  const allIssues = useMemo(() => validate(model), [model]);
  const issues = allIssues.filter((issue) => model.diagrams[issue.diagram]?.notation === diagram.notation);
  const here = issues.filter((issue) => issue.diagram === diagramId).length;
  const elements = diagram.boxes.filter((b) => b.kind !== 'text').length;

  return (
    <footer className="statusbar">
      <span className="sb-node">{nodeOf(model, diagramId)}</span>
      <span className="sb-title">{diagramTitle(model, diagramId)}</span>
      <span className="sb-sep" />
      <span>
        {diagram.notation === 'idef0' ? 'Работ' : 'Элементов'}: {elements}
      </span>
      <span>Стрелок: {diagram.arrows.length}</span>
      <span>
        Диаграмм {notation.short}: {diagramOrder(model, diagram.notation).length}
      </span>
      <span className="sb-grow" />
      <button className={'sb-issues' + (issues.length ? ' has' : ' ok')} onClick={() => setOpen(!open)}>
        {issues.length ? <Icon.warn /> : <Icon.check />}
        {issuesLabel(issues.length, here)}
      </button>
      {open && issues.length > 0 && <IssuesPopup issues={issues} notationName={notation.short} currentId={diagramId} close={close} />}
    </footer>
  );
}
