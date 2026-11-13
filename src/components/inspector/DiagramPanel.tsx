import type { DiagramStatus, Model } from '../../model/types';
import { diagramTitle, isContext, nodeOf } from '../../model/query';
import { DIAGRAM_STATUSES, NOTATIONS } from '../../model/notation';
import { commit, setState } from '../../store';
import { openDiagram } from '../../actions';
import { Icon } from '../icons';
import { Field, Segmented } from './controls';

type MetaField = 'name' | 'author' | 'purpose' | 'viewpoint';

const setMeta = (field: MetaField, value: string) =>
  commit((draft) => {
    draft.meta[field] = value;
  }, 'meta-' + field);

export function DiagramPanel({ model, diagramId }: { model: Model; diagramId: string }) {
  const diagram = model.diagrams[diagramId];
  const context = isContext(diagram);
  const parent = diagram.parent;
  const setStatus = (status: DiagramStatus) =>
    commit((draft) => {
      draft.diagrams[diagramId].status = status;
    });

  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">Диаграмма {NOTATIONS[diagram.notation].short}</span>
        <span className="insp-num">{nodeOf(model, diagramId)}</span>
      </div>
      {!context && <p className="insp-title">{diagramTitle(model, diagramId)}</p>}
      <Field label="Статус">
        <Segmented<DiagramStatus> value={diagram.status} options={DIAGRAM_STATUSES} onChange={setStatus} cols={2} />
      </Field>
      {parent && (
        <button className="btn" onClick={() => openDiagram(parent.diagram, parent.box)}>
          <Icon.up />
          Родительская диаграмма {nodeOf(model, parent.diagram)}
        </button>
      )}

      <div className="insp-section">Модель</div>
      <Field label="Название модели">
        <input value={model.meta.name} onChange={(e) => setMeta('name', e.target.value)} />
      </Field>
      <Field label="Автор">
        <input value={model.meta.author} onChange={(e) => setMeta('author', e.target.value)} placeholder="Фамилия И. О." />
      </Field>
      <Field label="Цель моделирования" hint={context ? 'Выводится на диаграмме A-0.' : undefined}>
        <textarea rows={3} value={model.meta.purpose} onChange={(e) => setMeta('purpose', e.target.value)} placeholder="Зачем строится модель" />
      </Field>
      <Field label="Точка зрения">
        <input value={model.meta.viewpoint} onChange={(e) => setMeta('viewpoint', e.target.value)} placeholder="Например, директор по продажам" />
      </Field>
      {diagram.notation === 'idef0' && (
        <button className="btn" onClick={() => setState({ dialog: { kind: 'abc' } })}>
          <Icon.money />
          Стоимостной анализ (ABC)
        </button>
      )}
    </>
  );
}
