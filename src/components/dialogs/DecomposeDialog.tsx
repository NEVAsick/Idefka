import { useState } from 'react';
import type { Notation } from '../../model/types';
import { getState } from '../../store';
import { boxNumber } from '../../model/query';
import { NOTATIONS } from '../../model/notation';
import { doDecompose } from '../../actions';

const CHILD_WORD: Partial<Record<Notation, string>> = { dfd: 'процессов', bpmn: 'задач', epc: 'функций', activity: 'действий' };

const AUTO_NOTE: Partial<Record<Notation, string>> = {
  bpmn: 'Начальное и конечное события добавятся сами.',
  epc: 'Между функциями сами встанут события, цепочка начнётся и закончится событием.',
  activity: 'Начальный и конечный узлы добавятся сами.',
};

const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];

export function DecomposeDialog({ boxId, close }: { boxId: string; close: () => void }) {
  const { model, diagramId } = getState();
  const notation = model.diagrams[diagramId].notation;
  const idef0 = notation === 'idef0';
  const [count, setCount] = useState(idef0 ? 4 : 3);
  const children = CHILD_WORD[notation] ?? 'работ';
  const note = AUTO_NOTE[notation] ?? 'Граничные стрелки перенесутся автоматически.';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        doDecompose(boxId, count);
      }}
    >
      <h2>
        {notation === 'bpmn' ? 'Подпроцесс' : 'Декомпозиция'} {boxNumber(model, diagramId, boxId)}
      </h2>
      <p className="modal-text">
        Дочерняя диаграмма {NOTATIONS[notation].short}. Сколько {children} на ней создать{idef0 ? ' (по стандарту — от 3 до 6)' : ''}? {note}
      </p>
      <div className="count-picker">
        {COUNTS.map((k) => (
          <button type="button" key={k} className={k === count ? 'on' : ''} onClick={() => setCount(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={close}>
          Отмена
        </button>
        <button type="submit" className="btn primary" autoFocus>
          Создать диаграмму
        </button>
      </div>
    </form>
  );
}
